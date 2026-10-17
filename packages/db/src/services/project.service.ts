import {
  type CreateProjectInput,
  type ProjectDetail,
  type ProjectListQuery,
  type ProjectStatus,
  type ProjectSummary,
  type ProjectType,
  type UpdateProjectInput,
} from '@interscale/shared';
import mongoose from 'mongoose';
import type { Connection } from 'mongoose';
import { getConnection } from '../connection';
import { assertObjectId } from '../lib/object-id';
import {
  ConcurrentModificationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../lib/errors';
import { ClientModel } from '../models/client';
import { ProjectModel } from '../models/project';
import { recordAudit } from './audit.service';
import { ensureActiveMembership, listActiveClientIdsForUser } from './client.service';
import type { EmployeeDirectory } from './employee-directory';

/**
 * Server-side project administration (Step 7).
 *
 * Listing is scope-filtered: Admins read every project, Managers read projects
 * under clients where they hold an active membership, and Employees read only
 * projects containing their own non-cancelled assigned work. Changing a
 * project status never touches task statuses.
 */

export interface ProjectServiceOptions {
  connection?: Connection;
}

export interface ProjectServiceDeps extends ProjectServiceOptions {
  /** Employee lookup used to validate the assigned Project Manager. */
  directory: EmployeeDirectory;
}

export type ProjectScope =
  { kind: 'all' } | { kind: 'member'; userId: string } | { kind: 'assignee'; userId: string };

function resolveConnection(options: ProjectServiceOptions): Connection {
  return options.connection ?? getConnection();
}

type ProjectFilter = {
  clientId?: mongoose.Types.ObjectId | { $in: mongoose.Types.ObjectId[] };
  status?: ProjectStatus;
  type?: ProjectType;
  managerId?: mongoose.Types.ObjectId;
  name?: { $regex: string; $options: string };
  _id?: { $in?: mongoose.Types.ObjectId[]; $gt?: mongoose.Types.ObjectId };
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function asIso(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return new Date(0).toISOString();
}

function asNullableIso(value: Date | null | undefined): string | null {
  return value instanceof Date ? value.toISOString() : null;
}

function toSummary(doc: {
  _id: mongoose.Types.ObjectId;
  clientId: mongoose.Types.ObjectId;
  name: string;
  description: string | null;
  type: ProjectType;
  status: ProjectStatus;
  managerId?: mongoose.Types.ObjectId | null;
  startAt?: Date | null;
  targetAt?: Date | null;
  createdBy?: mongoose.Types.ObjectId | null;
  updatedBy?: mongoose.Types.ObjectId | null;
  __v?: number;
  createdAt: Date;
  updatedAt: Date;
}): ProjectSummary {
  return {
    id: doc._id.toString(),
    clientId: doc.clientId.toString(),
    name: doc.name,
    description: doc.description ?? null,
    type: doc.type,
    status: doc.status,
    managerId: doc.managerId ? doc.managerId.toString() : null,
    startAt: asNullableIso(doc.startAt),
    targetAt: asNullableIso(doc.targetAt),
    createdBy: doc.createdBy ? doc.createdBy.toString() : null,
    updatedBy: doc.updatedBy ? doc.updatedBy.toString() : null,
    version: typeof doc.__v === 'number' ? doc.__v : 0,
    createdAt: asIso(doc.createdAt),
    updatedAt: asIso(doc.updatedAt),
  };
}

export interface ProjectListResult {
  readonly data: ProjectSummary[];
  readonly nextCursor: string | null;
}

/**
 * Project ids containing non-cancelled work assigned to a user.
 *
 * Reads the `tasks` collection directly (no service import) so project and
 * task services stay decoupled; subtask assignments count via the same field.
 */
export async function listAssignedProjectIdsForUser(
  userId: string,
  options: ProjectServiceOptions = {},
): Promise<string[]> {
  const connection = resolveConnection(options);

  if (!connection.db) {
    throw new ValidationError('Database connection is not ready');
  }

  const rows = (await connection.db.collection('tasks').distinct('projectId', {
    assignedUserId: new mongoose.Types.ObjectId(assertObjectId(userId, 'user')),
    status: { $ne: 'cancelled' },
  })) as mongoose.Types.ObjectId[];

  return [...new Set(rows.map((id) => id.toString()))];
}

/** Whether a user holds non-cancelled assigned work inside a project. */
export async function hasAssignedWorkInProject(
  projectId: string,
  userId: string,
  options: ProjectServiceOptions = {},
): Promise<boolean> {
  const connection = resolveConnection(options);

  if (!connection.db) {
    throw new ValidationError('Database connection is not ready');
  }

  const count = await connection.db.collection('tasks').countDocuments({
    projectId: new mongoose.Types.ObjectId(assertObjectId(projectId, 'project')),
    assignedUserId: new mongoose.Types.ObjectId(assertObjectId(userId, 'user')),
    status: { $ne: 'cancelled' },
  });

  return count > 0;
}

export interface ProjectProgressResult {
  total: number;
  completed: number;
  percent: number;
}

/**
 * Leaf-task progress for a project.
 *
 * Completed active (non-cancelled) leaf tasks / total active leaf tasks.
 * A task with children is not counted itself; standalone tasks count as
 * leaves. Zero active tasks yields 0 percent.
 */
export async function computeProjectProgress(
  projectId: string,
  options: ProjectServiceOptions = {},
): Promise<ProjectProgressResult> {
  const connection = resolveConnection(options);

  if (!connection.db) {
    throw new ValidationError('Database connection is not ready');
  }

  const rows = (await connection.db
    .collection('tasks')
    .find(
      {
        projectId: new mongoose.Types.ObjectId(assertObjectId(projectId, 'project')),
        status: { $ne: 'cancelled' },
      },
      { projection: { _id: 1, parentTaskId: 1, status: 1 } },
    )
    .toArray()) as Array<{
    _id: mongoose.Types.ObjectId;
    parentTaskId?: mongoose.Types.ObjectId | null;
    status: string;
  }>;

  const childIds = new Set(rows.map((row) => row.parentTaskId?.toString()).filter(Boolean));
  const leaves = rows.filter((row) => !childIds.has(row._id.toString()));
  const completed = leaves.filter((row) => row.status === 'done').length;

  return {
    total: leaves.length,
    completed,
    percent: leaves.length === 0 ? 0 : Math.round((completed / leaves.length) * 100),
  };
}

/** List projects with filters, scope filtering and `_id` cursor pagination. */
export async function listProjects(
  query: ProjectListQuery,
  scope: ProjectScope,
  options: ProjectServiceOptions = {},
): Promise<ProjectListResult> {
  void resolveConnection(options);

  const filter: ProjectFilter = {};

  if (query.status) filter.status = query.status;
  if (query.type) filter.type = query.type;

  if (query.managerId) {
    filter.managerId = new mongoose.Types.ObjectId(assertObjectId(query.managerId, 'manager'));
  }

  if (query.search && query.search.length > 0) {
    filter.name = { $regex: escapeRegExp(query.search), $options: 'i' };
  }

  if (query.clientId) {
    filter.clientId = new mongoose.Types.ObjectId(assertObjectId(query.clientId, 'client'));
  }

  if (scope.kind === 'member') {
    const clientIds = await listActiveClientIdsForUser(scope.userId, options);

    if (clientIds.length === 0) {
      return { data: [], nextCursor: null };
    }

    const allowed = clientIds.map((id) => new mongoose.Types.ObjectId(id));

    if (filter.clientId instanceof mongoose.Types.ObjectId) {
      if (!allowed.some((id) => id.equals(filter.clientId as mongoose.Types.ObjectId))) {
        return { data: [], nextCursor: null };
      }
    } else {
      filter.clientId = { $in: allowed };
    }
  }

  if (scope.kind === 'assignee') {
    const projectIds = await listAssignedProjectIdsForUser(scope.userId, options);

    if (projectIds.length === 0) {
      return { data: [], nextCursor: null };
    }

    filter._id = { $in: projectIds.map((id) => new mongoose.Types.ObjectId(id)) };
  }

  if (query.cursor) {
    filter._id = { ...filter._id, $gt: new mongoose.Types.ObjectId(query.cursor) };
  }

  const documents = await ProjectModel.find(filter)
    .sort({ _id: 1 })
    .limit(query.limit + 1)
    .lean();

  return toPage(documents, query.limit);
}

function toPage(
  documents: Array<Parameters<typeof toSummary>[0]>,
  limit: number,
): ProjectListResult {
  const hasMore = documents.length > limit;
  const page = hasMore ? documents.slice(0, limit) : documents;

  return {
    data: page.map((doc) => toSummary(doc)),
    nextCursor: hasMore && page.length > 0 ? (page[page.length - 1]?._id.toString() ?? null) : null,
  };
}

/** Find a single project, or `null` when the id is malformed or unknown. */
export async function findProject(
  id: string,
  options: ProjectServiceOptions = {},
): Promise<ProjectSummary | null> {
  void resolveConnection(options);

  let objectId: mongoose.Types.ObjectId;

  try {
    objectId = new mongoose.Types.ObjectId(assertObjectId(id, 'project'));
  } catch {
    return null;
  }

  const doc = await ProjectModel.findById(objectId).lean();

  if (!doc) {
    return null;
  }

  return toSummary({
    _id: doc._id,
    clientId: doc.clientId,
    name: doc.name,
    description: doc.description,
    type: doc.type,
    status: doc.status,
    managerId: doc.managerId,
    startAt: doc.startAt,
    targetAt: doc.targetAt,
    createdBy: doc.createdBy,
    updatedBy: doc.updatedBy,
    __v: doc.__v,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  });
}

/** Project detail with server-computed leaf-task progress. */
export async function findProjectDetail(
  id: string,
  options: ProjectServiceOptions = {},
): Promise<ProjectDetail | null> {
  const summary = await findProject(id, options);

  if (!summary) {
    return null;
  }

  const progress = await computeProjectProgress(summary.id, options);

  return { ...summary, progress };
}

function toDate(value: string | null | undefined, label: string): Date | null {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError(`A valid ${label} is required`);
  }

  return parsed;
}

function assertDateOrder(startAt: Date | null, targetAt: Date | null): void {
  if (startAt && targetAt && targetAt.getTime() < startAt.getTime()) {
    throw new ValidationError('The target date cannot be earlier than the start date');
  }
}

async function assertActiveEmployee(
  directory: ProjectServiceDeps['directory'],
  userId: string,
  label: string,
): Promise<void> {
  const employee = await directory.findById(assertObjectId(userId, label));

  if (!employee) {
    throw new NotFoundError('Employee');
  }

  if (employee.status !== 'active') {
    throw new ValidationError(`The ${label} is not active`);
  }
}

/** Create a project (Admin only; enforced by the API layer). */
export async function createProjectRecord(
  input: CreateProjectInput,
  actorId: string,
  deps: ProjectServiceDeps,
): Promise<ProjectSummary> {
  void resolveConnection(deps);

  const client = await ClientModel.findById(assertObjectId(input.clientId, 'client')).lean();

  if (!client) {
    throw new NotFoundError('Client');
  }

  if (input.managerId !== null) {
    await assertActiveEmployee(deps.directory, input.managerId, 'project manager');
  }

  const startAt = toDate(input.startAt, 'start date');
  const targetAt = toDate(input.targetAt, 'target date');
  assertDateOrder(startAt, targetAt);

  let document;

  try {
    [document] = await ProjectModel.create([
      {
        clientId: input.clientId,
        name: input.name,
        description: input.description,
        type: input.type,
        status: input.status,
        managerId: input.managerId,
        startAt,
        targetAt,
        templateId: input.template?.templateId ?? null,
        templateVersion: input.template?.templateVersion ?? null,
        createdBy: assertObjectId(actorId, 'actor'),
        updatedBy: assertObjectId(actorId, 'actor'),
      },
    ]);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 11000) {
      throw new ConflictError('A project with this name already exists for this client');
    }

    throw error;
  }

  if (!document) {
    throw new ValidationError('Failed to create project');
  }

  const projectId = document._id.toString();

  if (input.managerId !== null) {
    await ensureActiveMembership(input.clientId, input.managerId, actorId, 'project manager');
  }

  await recordAudit({
    actorId,
    action: 'project.create',
    entityType: 'project',
    entityId: projectId,
    previousValue: null,
    newValue: {
      clientId: input.clientId,
      name: input.name,
      type: input.type,
      status: input.status,
      managerId: input.managerId,
    },
    notes: null,
  });

  const created = await findProject(projectId, deps);

  if (!created) {
    throw new NotFoundError('Project');
  }

  return created;
}

/** Update project fields (status changes go through `changeProjectStatus`). */
export async function updateProjectRecord(
  id: string,
  input: UpdateProjectInput,
  actorId: string,
  deps: ProjectServiceDeps,
  expectedVersion?: number,
): Promise<ProjectSummary> {
  void resolveConnection(deps);

  const projectId = assertObjectId(id, 'project');
  const document = await ProjectModel.findById(projectId);

  if (!document) {
    throw new NotFoundError('Project');
  }

  if (expectedVersion !== undefined && document.__v !== expectedVersion) {
    throw new ConcurrentModificationError();
  }

  if (input.managerId !== undefined && input.managerId !== null) {
    await assertActiveEmployee(deps.directory, input.managerId, 'project manager');
  }

  const managerChanged =
    input.managerId !== undefined && (document.managerId?.toString() ?? null) !== input.managerId;
  const previousManager = document.managerId ? document.managerId.toString() : null;

  const previous = {
    name: document.name,
    description: document.description,
    type: document.type,
    startAt: asNullableIso(document.startAt),
    targetAt: asNullableIso(document.targetAt),
  };

  if (input.name !== undefined) document.name = input.name;
  if (input.description !== undefined) document.description = input.description;
  if (input.type !== undefined) document.type = input.type;
  if (input.managerId !== undefined) {
    document.managerId = input.managerId ? new mongoose.Types.ObjectId(input.managerId) : null;
  }

  const nextStart =
    input.startAt !== undefined ? toDate(input.startAt, 'start date') : document.startAt;
  const nextTarget =
    input.targetAt !== undefined ? toDate(input.targetAt, 'target date') : document.targetAt;
  assertDateOrder(nextStart, nextTarget);
  document.startAt = nextStart;
  document.targetAt = nextTarget;
  document.updatedBy = new mongoose.Types.ObjectId(assertObjectId(actorId, 'actor'));

  try {
    await document.save();
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 11000) {
      throw new ConflictError('A project with this name already exists for this client');
    }

    if (error instanceof Error && error.name === 'VersionError') {
      throw new ConcurrentModificationError();
    }

    throw error;
  }

  if (managerChanged && input.managerId) {
    await ensureActiveMembership(
      document.clientId.toString(),
      input.managerId,
      actorId,
      'project manager',
    );

    await recordAudit({
      actorId,
      action: 'project.manager.update',
      entityType: 'project',
      entityId: projectId,
      previousValue: { managerId: previousManager },
      newValue: { managerId: input.managerId },
      notes: null,
    });
  }

  await recordAudit({
    actorId,
    action: 'project.update',
    entityType: 'project',
    entityId: projectId,
    previousValue: previous,
    newValue: {
      name: document.name,
      description: document.description,
      type: document.type,
      startAt: asNullableIso(document.startAt),
      targetAt: asNullableIso(document.targetAt),
    },
    notes: null,
  });

  const updated = await findProject(projectId, deps);

  if (!updated) {
    throw new NotFoundError('Project');
  }

  return updated;
}

/**
 * Change a project's status.
 *
 * Task statuses are never touched: project and task lifecycles stay separate.
 */
export async function changeProjectStatus(
  id: string,
  status: ProjectStatus,
  actorId: string,
  options: ProjectServiceOptions & { reason?: string | null; expectedVersion?: number } = {},
): Promise<ProjectSummary> {
  void resolveConnection(options);

  const projectId = assertObjectId(id, 'project');
  const document = await ProjectModel.findById(projectId);

  if (!document) {
    throw new NotFoundError('Project');
  }

  if (options.expectedVersion !== undefined && document.__v !== options.expectedVersion) {
    throw new ConcurrentModificationError();
  }

  const previous = document.status;
  document.status = status;
  document.updatedBy = new mongoose.Types.ObjectId(assertObjectId(actorId, 'actor'));

  try {
    await document.save();
  } catch (error) {
    if (error instanceof Error && error.name === 'VersionError') {
      throw new ConcurrentModificationError();
    }

    throw error;
  }

  await recordAudit({
    actorId,
    action: 'project.status.update',
    entityType: 'project',
    entityId: projectId,
    previousValue: { status: previous },
    newValue: { status },
    notes: options.reason ?? null,
  });

  const updated = await findProject(projectId, options);

  if (!updated) {
    throw new NotFoundError('Project');
  }

  return updated;
}
