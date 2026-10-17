import {
  TERMINAL_TASK_STATUSES,
  type AssignmentSource,
  type AuditAction,
  type CreateSubtaskInput,
  type CreateTaskInput,
  type TaskDetail,
  type TaskListQuery,
  type TaskPriority,
  type TaskStatus,
  type TaskSummary,
  type UpdateTaskInput,
} from '@interscale/shared';
import mongoose from 'mongoose';
import type { ClientSession, Connection } from 'mongoose';
import { getConnection } from '../connection';
import { assertObjectId } from '../lib/object-id';
import { ConcurrentModificationError, NotFoundError, ValidationError } from '../lib/errors';
import { ClientModel } from '../models/client';
import { DependencyReviewModel } from '../models/dependency-review';
import { ProjectModel } from '../models/project';
import { TaskActivityModel } from '../models/task-activity';
import { TaskModel } from '../models/task';
import { JobRoleModel } from '../models/job-role';
import { recordAudit } from './audit.service';
import { isActiveClientMember, listActiveClientIdsForUser } from './client.service';
import { resolveAssignableEmployee, type EmployeeDirectory } from './employee-directory';

/**
 * Server-side task administration (Steps 8–10).
 *
 * Status changes never happen here directly: `updateTaskRecord` edits fields
 * only, assignment goes through `assignTaskRecord`, and every workflow
 * transition runs through the state-transition engine
 * (`task-transitions.service`, Step 10). Subtask creation and nesting rules
 * land in Step 9.
 */

export interface TaskServiceOptions {
  connection?: Connection;
  session?: ClientSession;
}

export interface TaskServiceDeps extends TaskServiceOptions {
  /** Employee lookup used to validate assignees and approvers. */
  directory: EmployeeDirectory;
}

export type TaskScope =
  { kind: 'all' } | { kind: 'member'; userId: string } | { kind: 'assignee'; userId: string };

function resolveConnection(options: TaskServiceOptions): Connection {
  return options.connection ?? getConnection();
}

function isOverdueStatus(status: TaskStatus): boolean {
  return status !== 'done' && status !== 'cancelled';
}

function computeDerived(doc: {
  status: TaskStatus;
  dueAt?: Date | null;
  assignedUserId?: unknown;
}): {
  isOverdue: boolean;
  needsAssignment: boolean;
} {
  const now = new Date();
  const dueAt = doc.dueAt instanceof Date ? doc.dueAt : null;

  return {
    isOverdue: dueAt !== null && dueAt.getTime() < now.getTime() && isOverdueStatus(doc.status),
    needsAssignment:
      (doc.assignedUserId === null || doc.assignedUserId === undefined) &&
      !TERMINAL_TASK_STATUSES.includes(doc.status),
  };
}

interface TaskDocShape {
  _id: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  parentTaskId?: mongoose.Types.ObjectId | null;
  title: string;
  description?: string | null;
  assignedUserId?: mongoose.Types.ObjectId | null;
  assignedJobRoleId?: mongoose.Types.ObjectId | null;
  dueAt?: Date | null;
  priority: TaskPriority;
  status: TaskStatus;
  approvalRequired: boolean;
  approverId?: mongoose.Types.ObjectId | null;
  submittedBy?: mongoose.Types.ObjectId | null;
  submittedAt?: Date | null;
  approvedBy?: mongoose.Types.ObjectId | null;
  approvedAt?: Date | null;
  completedAt?: Date | null;
  revisionCount: number;
  sopUrl?: string | null;
  referenceUrl?: string | null;
  sourceMeetingId?: mongoose.Types.ObjectId | null;
  manualBlockReason?: string | null;
  autoAssign: boolean;
  assignmentSource?: 'manual' | 'role_mapping' | 'template_override' | null;
  createdBy?: mongoose.Types.ObjectId | null;
  updatedBy?: mongoose.Types.ObjectId | null;
  __v?: number;
  createdAt: Date;
  updatedAt: Date;
}

function asId(value: mongoose.Types.ObjectId | null | undefined): string | null {
  return value ? value.toString() : null;
}

function asIsoDate(value: Date | null | undefined): string | null {
  return value instanceof Date ? value.toISOString() : null;
}

export function toTaskSummary(doc: TaskDocShape): TaskSummary {
  const derived = computeDerived({
    status: doc.status,
    dueAt: doc.dueAt,
    assignedUserId: doc.assignedUserId,
  });

  return {
    id: doc._id.toString(),
    projectId: doc.projectId.toString(),
    parentTaskId: asId(doc.parentTaskId),
    title: doc.title,
    description: doc.description ?? null,
    assignedUserId: asId(doc.assignedUserId),
    assignedJobRoleId: asId(doc.assignedJobRoleId),
    dueAt: asIsoDate(doc.dueAt),
    priority: doc.priority,
    status: doc.status,
    approvalRequired: doc.approvalRequired,
    approverId: asId(doc.approverId),
    submittedBy: asId(doc.submittedBy),
    submittedAt: asIsoDate(doc.submittedAt),
    approvedBy: asId(doc.approvedBy),
    approvedAt: asIsoDate(doc.approvedAt),
    completedAt: asIsoDate(doc.completedAt),
    revisionCount: doc.revisionCount,
    sopUrl: doc.sopUrl ?? null,
    referenceUrl: doc.referenceUrl ?? null,
    sourceMeetingId: asId(doc.sourceMeetingId),
    manualBlockReason: typeof doc.manualBlockReason === 'string' ? doc.manualBlockReason : null,
    autoAssign: doc.autoAssign === true,
    assignmentSource: doc.assignmentSource ?? null,
    version: typeof doc.__v === 'number' ? doc.__v : 0,
    createdBy: asId(doc.createdBy),
    updatedBy: asId(doc.updatedBy),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
    isOverdue: derived.isOverdue,
    needsAssignment: derived.needsAssignment,
  };
}

export interface TaskListResult {
  readonly data: TaskSummary[];
  readonly nextCursor: string | null;
}

/** Append a user-visible activity entry (optionally inside a transaction). */
export async function recordTaskActivity(
  taskId: string,
  actorId: string | null,
  action: AuditAction,
  previousValue: unknown,
  newValue: unknown,
  notes: string | null,
  options: TaskServiceOptions = {},
): Promise<string> {
  void resolveConnection(options);

  const [document] = await TaskActivityModel.create(
    [
      {
        taskId: new mongoose.Types.ObjectId(assertObjectId(taskId, 'task')),
        actorId: actorId ? new mongoose.Types.ObjectId(assertObjectId(actorId, 'actor')) : null,
        action,
        previousValue: previousValue ?? null,
        newValue: newValue ?? null,
        notes,
      },
    ],
    options.session ? { session: options.session } : {},
  );

  if (!document) {
    throw new ValidationError('Failed to record task activity');
  }

  return document._id.toString();
}

async function writeAuditAndActivity(
  params: {
    taskId: string;
    actorId: string;
    action: AuditAction;
    previousValue: unknown;
    newValue: unknown;
    notes?: string | null;
  },
  options: TaskServiceOptions,
): Promise<void> {
  await recordAudit({
    actorId: params.actorId,
    action: params.action,
    entityType: 'task',
    entityId: params.taskId,
    previousValue: params.previousValue,
    newValue: params.newValue,
    notes: params.notes ?? null,
    session: options.session,
  });

  await recordTaskActivity(
    params.taskId,
    params.actorId,
    params.action,
    params.previousValue,
    params.newValue,
    params.notes ?? null,
    options,
  );
}

async function resolveProjectClientId(projectId: string): Promise<string> {
  const project = await ProjectModel.findById(assertObjectId(projectId, 'project'))
    .select({ clientId: 1 })
    .lean();

  if (!project) {
    throw new NotFoundError('Project');
  }

  return project.clientId.toString();
}

async function assertJobRoleExists(jobRoleId: string): Promise<void> {
  const role = await JobRoleModel.findById(assertObjectId(jobRoleId, 'job role'))
    .select({ _id: 1 })
    .lean();

  if (!role) {
    throw new NotFoundError('Job role');
  }
}

/**
 * Validate an assignee triple: active employee, holding the job role, and an
 * active member of the task's client team.
 */
export async function validateTaskAssignee(
  directory: EmployeeDirectory,
  clientId: string,
  userId: string | null,
  jobRoleId: string | null,
): Promise<void> {
  if (userId === null) {
    if (jobRoleId !== null) {
      await assertJobRoleExists(jobRoleId);
    }

    return;
  }

  if (jobRoleId === null) {
    throw new ValidationError('Select a functional job role for the assigned employee');
  }

  await resolveAssignableEmployee(directory, userId, jobRoleId);

  const member = await isActiveClientMember(clientId, userId);

  if (!member) {
    throw new ValidationError('The assigned employee is not an active member of this client team');
  }
}

/** Validate a designated approver: active employee inside the client team. */
export async function validateTaskApprover(
  directory: EmployeeDirectory,
  clientId: string,
  approverId: string,
): Promise<void> {
  const employee = await directory.findById(assertObjectId(approverId, 'approver'));

  if (!employee) {
    throw new NotFoundError('Employee');
  }

  if (employee.status !== 'active') {
    throw new ValidationError('The designated approver is not active');
  }

  const member = await isActiveClientMember(clientId, approverId);

  if (!member) {
    throw new ValidationError(
      'The designated approver is not an active member of this client team',
    );
  }
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

/** Create a top-level task (subtask creation lands in Step 9). */
export async function createTaskRecord(
  input: CreateTaskInput,
  actorId: string,
  deps: TaskServiceDeps,
): Promise<TaskSummary> {
  void resolveConnection(deps);

  if (input.parentTaskId !== null) {
    throw new ValidationError('Subtasks are created through the subtask endpoint');
  }

  const clientId = await resolveProjectClientId(input.projectId);

  await validateTaskAssignee(
    deps.directory,
    clientId,
    input.assignedUserId,
    input.assignedJobRoleId,
  );

  if (input.approverId !== null) {
    await validateTaskApprover(deps.directory, clientId, input.approverId);
  }

  if (input.approvalRequired && input.approverId === null) {
    throw new ValidationError('Select a designated approver when approval is required');
  }

  const [document] = await TaskModel.create(
    [
      {
        projectId: new mongoose.Types.ObjectId(input.projectId),
        parentTaskId: null,
        title: input.title,
        description: input.description,
        assignedUserId: input.assignedUserId,
        assignedJobRoleId: input.assignedJobRoleId,
        dueAt: toDate(input.dueAt, 'due date'),
        priority: input.priority,
        status: 'todo',
        approvalRequired: input.approvalRequired,
        approverId: input.approverId,
        sopUrl: input.sopUrl,
        referenceUrl: input.referenceUrl,
        sourceMeetingId: input.sourceMeetingId,
        autoAssign: input.autoAssign,
        assignmentSource: input.assignedUserId ? 'manual' : null,
        createdBy: new mongoose.Types.ObjectId(assertObjectId(actorId, 'actor')),
        updatedBy: new mongoose.Types.ObjectId(assertObjectId(actorId, 'actor')),
      },
    ],
    deps.session ? { session: deps.session } : {},
  );

  if (!document) {
    throw new ValidationError('Failed to create task');
  }

  const taskId = document._id.toString();

  await writeAuditAndActivity(
    {
      taskId,
      actorId,
      action: 'task.create',
      previousValue: null,
      newValue: {
        projectId: input.projectId,
        title: input.title,
        assignedUserId: input.assignedUserId,
        assignedJobRoleId: input.assignedJobRoleId,
        approvalRequired: input.approvalRequired,
        approverId: input.approverId,
      },
    },
    deps,
  );

  const created = await TaskModel.findById(document._id)
    .session(deps.session ?? null)
    .lean();

  if (!created) {
    throw new NotFoundError('Task');
  }

  return toTaskSummary(created as TaskDocShape);
}

export interface UpdateTaskPatch {
  title?: string;
  description?: string | null;
  assignedJobRoleId?: string | null;
  dueAt?: string | null;
  priority?: UpdateTaskInput['priority'];
  approvalRequired?: boolean;
  approverId?: string | null;
  autoAssign?: boolean;
}

/** Edit task fields (status and assignee have dedicated flows). */
export async function updateTaskRecord(
  id: string,
  input: UpdateTaskPatch,
  actorId: string,
  deps: TaskServiceDeps,
  expectedVersion?: number,
): Promise<TaskSummary> {
  void resolveConnection(deps);

  const taskId = assertObjectId(id, 'task');
  const document = await TaskModel.findById(taskId);

  if (!document) {
    throw new NotFoundError('Task');
  }

  if (expectedVersion !== undefined && document.__v !== expectedVersion) {
    throw new ConcurrentModificationError();
  }

  const clientId = await resolveProjectClientId(document.projectId.toString());

  if (document.status === 'awaiting_approval') {
    if (input.approvalRequired === false || input.approverId !== undefined) {
      throw new ValidationError('Resolve the pending approval before changing approval settings');
    }
  }

  if (input.assignedJobRoleId !== undefined && input.assignedJobRoleId !== null) {
    await assertJobRoleExists(input.assignedJobRoleId);

    if (document.assignedUserId) {
      await resolveAssignableEmployee(
        deps.directory,
        document.assignedUserId.toString(),
        input.assignedJobRoleId,
      );
    }
  }

  if (input.approverId !== undefined && input.approverId !== null) {
    await validateTaskApprover(deps.directory, clientId, input.approverId);
  }

  const nextApprovalRequired = input.approvalRequired ?? document.approvalRequired;
  const nextApprover =
    input.approverId !== undefined ? input.approverId : (document.approverId?.toString() ?? null);

  if (nextApprovalRequired && nextApprover === null) {
    throw new ValidationError('Select a designated approver when approval is required');
  }

  const previous = {
    title: document.title,
    description: document.description,
    assignedJobRoleId: document.assignedJobRoleId?.toString() ?? null,
    dueAt: document.dueAt?.toISOString() ?? null,
    priority: document.priority,
    approvalRequired: document.approvalRequired,
    approverId: document.approverId?.toString() ?? null,
    sopUrl: document.sopUrl,
    referenceUrl: document.referenceUrl,
    autoAssign: document.autoAssign,
  };

  if (input.title !== undefined) document.title = input.title;
  if (input.description !== undefined) document.description = input.description;
  if (input.assignedJobRoleId !== undefined) {
    document.assignedJobRoleId = input.assignedJobRoleId
      ? new mongoose.Types.ObjectId(input.assignedJobRoleId)
      : null;
  }
  if (input.dueAt !== undefined) document.dueAt = toDate(input.dueAt, 'due date');
  if (input.priority !== undefined) document.priority = input.priority;
  if (input.approvalRequired !== undefined) document.approvalRequired = input.approvalRequired;
  if (input.autoAssign !== undefined) document.autoAssign = input.autoAssign;
  if (input.approverId !== undefined) {
    document.approverId = input.approverId ? new mongoose.Types.ObjectId(input.approverId) : null;
  }
  document.updatedBy = new mongoose.Types.ObjectId(assertObjectId(actorId, 'actor'));

  try {
    await document.save({ session: deps.session ?? undefined });
  } catch (error) {
    if (error instanceof Error && error.name === 'VersionError') {
      throw new ConcurrentModificationError();
    }

    throw error;
  }

  const updated = await TaskModel.findById(taskId)
    .session(deps.session ?? null)
    .lean();

  if (!updated) {
    throw new NotFoundError('Task');
  }

  const summary = toTaskSummary(updated as TaskDocShape);

  await writeAuditAndActivity(
    {
      taskId,
      actorId,
      action: 'task.update',
      previousValue: previous,
      newValue: {
        title: summary.title,
        description: summary.description,
        assignedJobRoleId: summary.assignedJobRoleId,
        dueAt: summary.dueAt,
        priority: summary.priority,
        approvalRequired: summary.approvalRequired,
        approverId: summary.approverId,
        autoAssign: summary.autoAssign,
      },
    },
    deps,
  );

  return summary;
}

export interface AssignTaskPatch {
  assignedUserId: string | null;
  assignedJobRoleId: string | null;
}

/** Assign or reassign a task (eligibility re-validated every time). */
export async function assignTaskRecord(
  id: string,
  input: AssignTaskPatch,
  actorId: string,
  deps: TaskServiceDeps,
  expectedVersion?: number,
  source: AssignmentSource = 'manual',
): Promise<TaskSummary> {
  void resolveConnection(deps);

  const taskId = assertObjectId(id, 'task');
  const document = await TaskModel.findById(taskId);

  if (!document) {
    throw new NotFoundError('Task');
  }

  if (expectedVersion !== undefined && document.__v !== expectedVersion) {
    throw new ConcurrentModificationError();
  }

  const clientId = await resolveProjectClientId(document.projectId.toString());

  await validateTaskAssignee(
    deps.directory,
    clientId,
    input.assignedUserId,
    input.assignedJobRoleId,
  );

  const previous = {
    assignedUserId: document.assignedUserId?.toString() ?? null,
    assignedJobRoleId: document.assignedJobRoleId?.toString() ?? null,
  };

  document.assignedUserId = input.assignedUserId
    ? new mongoose.Types.ObjectId(input.assignedUserId)
    : null;
  document.assignedJobRoleId = input.assignedJobRoleId
    ? new mongoose.Types.ObjectId(input.assignedJobRoleId)
    : null;
  document.assignmentSource = input.assignedUserId ? source : null;
  document.updatedBy = new mongoose.Types.ObjectId(assertObjectId(actorId, 'actor'));

  try {
    await document.save({ session: deps.session ?? undefined });
  } catch (error) {
    if (error instanceof Error && error.name === 'VersionError') {
      throw new ConcurrentModificationError();
    }

    throw error;
  }

  await writeAuditAndActivity(
    {
      taskId,
      actorId,
      action: 'task.assign',
      previousValue: previous,
      newValue: {
        assignedUserId: input.assignedUserId,
        assignedJobRoleId: input.assignedJobRoleId,
        source,
      },
    },
    deps,
  );

  const updated = await TaskModel.findById(taskId)
    .session(deps.session ?? null)
    .lean();

  if (!updated) {
    throw new NotFoundError('Task');
  }

  return toTaskSummary(updated as TaskDocShape);
}

type TaskFilter = {
  projectId?: mongoose.Types.ObjectId | { $in: mongoose.Types.ObjectId[] };
  parentTaskId?: mongoose.Types.ObjectId | null;
  status?: TaskStatus | { $nin: TaskStatus[] };
  priority?: TaskPriority;
  assignedUserId?: mongoose.Types.ObjectId | null;
  assignedJobRoleId?: mongoose.Types.ObjectId;
  approverId?: mongoose.Types.ObjectId;
  approvalRequired?: boolean;
  dueAt?: { $lt?: Date; $gte?: Date; $gt?: Date; $lte?: Date };
  title?: { $regex: string; $options: string };
  _id?: { $in?: mongoose.Types.ObjectId[]; $gt?: mongoose.Types.ObjectId };
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function utcDayBounds(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { start, end };
}

/** List tasks with filters, scope filtering and `_id` cursor pagination. */
export async function listTasks(
  query: TaskListQuery,
  scope: TaskScope,
  options: TaskServiceOptions = {},
): Promise<TaskListResult> {
  void resolveConnection(options);

  const filter: TaskFilter = {};

  if (query.status) filter.status = query.status;
  if (query.priority) filter.priority = query.priority;
  if (query.approvalRequired !== undefined) filter.approvalRequired = query.approvalRequired;

  if (query.projectId) {
    filter.projectId = new mongoose.Types.ObjectId(assertObjectId(query.projectId, 'project'));
  }

  if (query.assignedUserId) {
    filter.assignedUserId = new mongoose.Types.ObjectId(
      assertObjectId(query.assignedUserId, 'employee'),
    );
  }

  if (query.assignedJobRoleId) {
    filter.assignedJobRoleId = new mongoose.Types.ObjectId(
      assertObjectId(query.assignedJobRoleId, 'job role'),
    );
  }

  if (query.approverId) {
    filter.approverId = new mongoose.Types.ObjectId(assertObjectId(query.approverId, 'approver'));
  }

  if (query.search && query.search.length > 0) {
    filter.title = { $regex: escapeRegExp(query.search), $options: 'i' };
  }

  if (query.unassignedOnly === true) {
    filter.assignedUserId = null;
    filter.status = { $nin: ['done', 'cancelled'] };
  }

  if (scope.kind === 'member' || query.clientId) {
    let clientIds: string[] = [];

    if (scope.kind === 'member') {
      clientIds = await listActiveClientIdsForUser(scope.userId, options);
    }

    if (query.clientId) {
      const requested = assertObjectId(query.clientId, 'client');

      if (scope.kind === 'member' && !clientIds.includes(requested)) {
        return { data: [], nextCursor: null };
      }

      clientIds = [requested];
    }

    if (clientIds.length === 0) {
      return { data: [], nextCursor: null };
    }

    const projectIds = (await ProjectModel.distinct('_id', {
      clientId: { $in: clientIds.map((id) => new mongoose.Types.ObjectId(id)) },
    })) as mongoose.Types.ObjectId[];

    if (projectIds.length === 0) {
      return { data: [], nextCursor: null };
    }

    const allowed = projectIds.map((id) => new mongoose.Types.ObjectId(id.toString()));

    if (filter.projectId instanceof mongoose.Types.ObjectId) {
      if (!allowed.some((id) => id.equals(filter.projectId as mongoose.Types.ObjectId))) {
        return { data: [], nextCursor: null };
      }
    } else {
      filter.projectId = { $in: allowed };
    }
  }

  if (scope.kind === 'assignee') {
    filter.assignedUserId = new mongoose.Types.ObjectId(assertObjectId(scope.userId, 'user'));
  }

  if (query.due) {
    const { start, end } = utcDayBounds();
    const now = new Date();

    if (query.due === 'overdue') {
      filter.dueAt = { $lt: now };
    } else if (query.due === 'today') {
      filter.dueAt = { $gte: start, $lte: end };
    } else {
      filter.dueAt = { $gt: end };
    }

    // Due views only make sense for actionable work unless a status is pinned.
    if (!query.status) {
      filter.status = { $nin: ['done', 'cancelled'] };
    }
  }

  if (query.cursor) {
    filter._id = { ...filter._id, $gt: new mongoose.Types.ObjectId(query.cursor) };
  }

  const documents = await TaskModel.find(filter)
    .sort({ _id: 1 })
    .limit(query.limit + 1)
    .lean();

  const hasMore = documents.length > query.limit;
  const page = hasMore ? documents.slice(0, query.limit) : documents;

  return {
    data: page.map((doc) => toTaskSummary(doc as TaskDocShape)),
    nextCursor: hasMore && page.length > 0 ? (page[page.length - 1]?._id.toString() ?? null) : null,
  };
}

/** Find a single task, or `null` when the id is malformed or unknown. */ export async function findTask(
  id: string,
  options: TaskServiceOptions = {},
): Promise<TaskSummary | null> {
  void resolveConnection(options);

  let objectId: mongoose.Types.ObjectId;

  try {
    objectId = new mongoose.Types.ObjectId(assertObjectId(id, 'task'));
  } catch {
    return null;
  }

  const doc = await TaskModel.findById(objectId).lean();

  if (!doc) {
    return null;
  }

  return toTaskSummary(doc as TaskDocShape);
}

export interface TaskProgressResult {
  total: number;
  completed: number;
  percent: number;
}

/**
 * Leaf progress for one parent task (Step 9 rule).
 *
 * Completed non-cancelled children / total non-cancelled children. A parent
 * with no active children reports its own completion (Done = 100).
 */
export async function computeTaskProgress(
  taskId: string,
  options: TaskServiceOptions = {},
): Promise<TaskProgressResult> {
  void resolveConnection(options);

  const objectId = new mongoose.Types.ObjectId(assertObjectId(taskId, 'task'));

  const children = await TaskModel.find({ parentTaskId: objectId, status: { $ne: 'cancelled' } })
    .select({ status: 1 })
    .lean();

  if (children.length === 0) {
    const self = await TaskModel.findById(objectId).select({ status: 1 }).lean();
    const done = self?.status === 'done' ? 1 : 0;
    return { total: 1, completed: done, percent: done === 1 ? 100 : 0 };
  }

  const completed = children.filter((child) => child.status === 'done').length;

  return {
    total: children.length,
    completed,
    percent: Math.round((completed / children.length) * 100),
  };
}

/**
 * Whether a user may read one task: assigned to it, or assigned to one of
 * its subtasks (limited parent context). Project/client scope is checked by
 * the caller on top of this.
 */
export async function canReadTask(
  taskId: string,
  userId: string,
  options: TaskServiceOptions = {},
): Promise<boolean> {
  void resolveConnection(options);

  const objectId = new mongoose.Types.ObjectId(assertObjectId(taskId, 'task'));
  const userObjectId = new mongoose.Types.ObjectId(assertObjectId(userId, 'user'));

  const direct = await TaskModel.findOne({ _id: objectId, assignedUserId: userObjectId })
    .select({ _id: 1 })
    .lean();

  if (direct) {
    return true;
  }

  const viaChild = await TaskModel.findOne({ parentTaskId: objectId, assignedUserId: userObjectId })
    .select({ _id: 1 })
    .lean();

  return viaChild !== null;
}

/** Task detail with parent context and leaf progress. */
export async function findTaskDetail(
  id: string,
  options: TaskServiceOptions = {},
): Promise<TaskDetail | null> {
  const summary = await findTask(id, options);

  if (!summary) {
    return null;
  }

  let parent: TaskDetail['parent'] = null;

  if (summary.parentTaskId) {
    const parentDoc = await TaskModel.findById(summary.parentTaskId)
      .select({ title: 1, status: 1 })
      .lean();

    if (parentDoc) {
      parent = { id: parentDoc._id.toString(), title: parentDoc.title, status: parentDoc.status };
    }
  }

  const progress = await computeTaskProgress(summary.id, options);

  return { ...summary, parent, progress };
}

/** List a parent's subtasks. */
export async function listSubtasks(
  parentId: string,
  options: TaskServiceOptions = {},
): Promise<TaskSummary[]> {
  void resolveConnection(options);

  const objectId = new mongoose.Types.ObjectId(assertObjectId(parentId, 'parent task'));
  const parent = await TaskModel.findById(objectId).select({ _id: 1 }).lean();

  if (!parent) {
    throw new NotFoundError('Parent task');
  }

  const children = await TaskModel.find({ parentTaskId: objectId }).sort({ _id: 1 }).lean();

  return children.map((doc) => toTaskSummary(doc as TaskDocShape));
}

/** Durable activity entries for one task, newest first. */
export async function listTaskActivity(
  taskId: string,
  options: TaskServiceOptions = {},
): Promise<
  Array<{
    id: string;
    taskId: string;
    actorId: string | null;
    action: string;
    previousValue: unknown;
    newValue: unknown;
    notes: string | null;
    createdAt: string;
  }>
> {
  void resolveConnection(options);

  const objectId = new mongoose.Types.ObjectId(assertObjectId(taskId, 'task'));

  const documents = await TaskActivityModel.find({ taskId: objectId })
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();

  return documents.map((doc) => ({
    id: doc._id.toString(),
    taskId: doc.taskId.toString(),
    actorId: doc.actorId ? doc.actorId.toString() : null,
    action: doc.action,
    previousValue: doc.previousValue ?? null,
    newValue: doc.newValue ?? null,
    notes: doc.notes ?? null,
    createdAt:
      doc.createdAt instanceof Date ? doc.createdAt.toISOString() : new Date(0).toISOString(),
  }));
}

export interface EnrichedTaskRow {
  task: TaskSummary;
  projectName: string;
  clientName: string;
  clientId: string;
  parentTitle: string | null;
  reviewOpen: boolean;
}

async function enrichTasks(
  summaries: TaskSummary[],
  options: TaskServiceOptions,
): Promise<EnrichedTaskRow[]> {
  void resolveConnection(options);

  const projectIds = [...new Set(summaries.map((task) => task.projectId))];
  const parentIds = [
    ...new Set(summaries.map((task) => task.parentTaskId).filter(Boolean)),
  ] as string[];

  const [projects, parents] = await Promise.all([
    ProjectModel.find({ _id: { $in: projectIds } })
      .select({ name: 1, clientId: 1 })
      .lean(),
    parentIds.length > 0
      ? TaskModel.find({ _id: { $in: parentIds } })
          .select({ title: 1 })
          .lean()
      : Promise.resolve([]),
  ]);

  const clientIds = [...new Set(projects.map((project) => project.clientId.toString()))];
  const clients = await ClientModel.find({ _id: { $in: clientIds } })
    .select({ name: 1 })
    .lean();

  const projectById = new Map(projects.map((project) => [project._id.toString(), project]));
  const clientById = new Map(clients.map((client) => [client._id.toString(), client]));
  const parentById = new Map(parents.map((parent) => [parent._id.toString(), parent]));

  const reviewTaskIds = new Set(
    (
      await DependencyReviewModel.find({
        taskId: { $in: summaries.map((task) => new mongoose.Types.ObjectId(task.id)) },
        status: 'open',
      })
        .select({ taskId: 1 })
        .lean()
    ).map((review) => review.taskId.toString()),
  );

  return summaries.map((task) => {
    const project = projectById.get(task.projectId);
    const client = project ? clientById.get(project.clientId.toString()) : undefined;
    const parent = task.parentTaskId ? parentById.get(task.parentTaskId) : undefined;

    return {
      task,
      projectName: project?.name ?? 'Unknown project',
      clientName: client?.name ?? 'Unknown client',
      clientId: project?.clientId.toString() ?? '',
      parentTitle: parent?.title ?? null,
      reviewOpen: reviewTaskIds.has(task.id),
    };
  });
}

/**
 * My Tasks rows for one user with view filters (Step 11 screens).
 *
 * Always scoped to the user's own assignments; the caller adds no further
 * scope. Enriched with project/client/parent names for table display.
 */
export async function listMyTasks(
  userId: string,
  filters: {
    status?: TaskStatus;
    clientId?: string;
    projectId?: string;
    priority?: TaskPriority;
    due?: 'overdue' | 'today' | 'upcoming';
    search?: string;
    limit: number;
    cursor?: string;
  },
  options: TaskServiceOptions = {},
): Promise<{ data: EnrichedTaskRow[]; nextCursor: string | null }> {
  const page = await listTasks(
    {
      limit: filters.limit,
      cursor: filters.cursor,
      status: filters.status,
      clientId: filters.clientId,
      projectId: filters.projectId,
      priority: filters.priority,
      due: filters.due,
      search: filters.search,
    },
    { kind: 'assignee', userId },
    options,
  );

  return { data: await enrichTasks(page.data, options), nextCursor: page.nextCursor };
}

/**
 * Approval queue rows: tasks awaiting approval where the user is the
 * designated approver, restricted to member clients unless `scopeAll`.
 */
export async function listApprovalQueue(
  userId: string,
  scopeAll: boolean,
  memberClientIds: string[],
  limit: number,
  options: TaskServiceOptions = {},
): Promise<{ data: EnrichedTaskRow[]; nextCursor: string | null }> {
  void resolveConnection(options);

  const filter: TaskFilter = {
    status: 'awaiting_approval',
    approverId: new mongoose.Types.ObjectId(assertObjectId(userId, 'user')),
  };

  if (!scopeAll) {
    if (memberClientIds.length === 0) {
      return { data: [], nextCursor: null };
    }

    const projectIds = (await ProjectModel.distinct('_id', {
      clientId: { $in: memberClientIds.map((id) => new mongoose.Types.ObjectId(id)) },
    })) as mongoose.Types.ObjectId[];

    if (projectIds.length === 0) {
      return { data: [], nextCursor: null };
    }

    filter.projectId = { $in: projectIds.map((id) => new mongoose.Types.ObjectId(id.toString())) };
  }

  const documents = await TaskModel.find(filter)
    .sort({ _id: 1 })
    .limit(limit + 1)
    .lean();
  const hasMore = documents.length > limit;
  const page = hasMore ? documents.slice(0, limit) : documents;

  return {
    data: await enrichTasks(
      page.map((doc) => toTaskSummary(doc as TaskDocShape)),
      options,
    ),
    nextCursor: hasMore && page.length > 0 ? (page[page.length - 1]?._id.toString() ?? null) : null,
  };
}

export interface SubtaskCreationResult {
  readonly task: TaskSummary;
  readonly warnings: string[];
}

/**
 * Deadline warning when a subtask runs past its parent (surfaced, never
 * silent; the caller decides whether to proceed).
 */
export function subtaskDeadlineWarnings(
  parentDueAt: Date | null,
  childDueAt: Date | null,
): string[] {
  if (parentDueAt instanceof Date && childDueAt instanceof Date && childDueAt > parentDueAt) {
    return [
      `Subtask due ${childDueAt.toISOString()} exceeds the parent deadline ${parentDueAt.toISOString()}.`,
    ];
  }

  return [];
}

/**
 * Create a real subtask under a parent task (Step 9).
 *
 * Rules, all server-side:
 * - the parent must exist and must itself be a top-level task (one level);
 * - the subtask inherits the parent's project (cross-project parenting is
 *   impossible because the project id never comes from the caller);
 * - a subtask of a Done/Cancelled parent requires explicit confirmation;
 * - assignee, role, approver and approval rules match top-level tasks.
 */
export async function createSubtaskRecord(
  parentId: string,
  input: CreateSubtaskInput,
  actorId: string,
  deps: TaskServiceDeps,
): Promise<SubtaskCreationResult> {
  void resolveConnection(deps);

  const parentObjectId = new mongoose.Types.ObjectId(assertObjectId(parentId, 'parent task'));
  const parent = await TaskModel.findById(parentObjectId);

  if (!parent) {
    throw new NotFoundError('Parent task');
  }

  if (parent.parentTaskId !== null && parent.parentTaskId !== undefined) {
    throw new ValidationError('Subtasks cannot contain further subtasks');
  }

  if (
    (parent.status === 'done' || parent.status === 'cancelled') &&
    input.confirmCompletedParent !== true
  ) {
    throw new ValidationError(
      'This parent is completed. Reopen it or confirm explicitly to add a subtask.',
    );
  }

  const clientId = await resolveProjectClientId(parent.projectId.toString());

  await validateTaskAssignee(
    deps.directory,
    clientId,
    input.assignedUserId,
    input.assignedJobRoleId,
  );

  if (input.approverId !== null) {
    await validateTaskApprover(deps.directory, clientId, input.approverId);
  }

  if (input.approvalRequired && input.approverId === null) {
    throw new ValidationError('Select a designated approver when approval is required');
  }

  const childDueAt = toDate(input.dueAt, 'due date');
  const warnings = subtaskDeadlineWarnings(parent.dueAt ?? null, childDueAt);

  const [document] = await TaskModel.create(
    [
      {
        projectId: parent.projectId,
        parentTaskId: parent._id,
        title: input.title,
        description: input.description,
        assignedUserId: input.assignedUserId,
        assignedJobRoleId: input.assignedJobRoleId,
        dueAt: childDueAt,
        priority: input.priority,
        status: 'todo',
        approvalRequired: input.approvalRequired,
        approverId: input.approverId,
        sopUrl: input.sopUrl,
        referenceUrl: input.referenceUrl,
        sourceMeetingId: input.sourceMeetingId,
        autoAssign: input.autoAssign,
        assignmentSource: input.assignedUserId ? 'manual' : null,
        createdBy: new mongoose.Types.ObjectId(assertObjectId(actorId, 'actor')),
        updatedBy: new mongoose.Types.ObjectId(assertObjectId(actorId, 'actor')),
      },
    ],
    deps.session ? { session: deps.session } : {},
  );

  if (!document) {
    throw new ValidationError('Failed to create subtask');
  }

  const taskId = document._id.toString();

  await writeAuditAndActivity(
    {
      taskId,
      actorId,
      action: 'task.create',
      previousValue: null,
      newValue: {
        projectId: parent.projectId.toString(),
        parentTaskId: parent._id.toString(),
        title: input.title,
        assignedUserId: input.assignedUserId,
        assignedJobRoleId: input.assignedJobRoleId,
      },
      notes: warnings.length > 0 ? warnings.join(' ') : null,
    },
    deps,
  );

  const created = await TaskModel.findById(document._id)
    .session(deps.session ?? null)
    .lean();

  if (!created) {
    throw new NotFoundError('Task');
  }

  return { task: toTaskSummary(created as TaskDocShape), warnings };
}

/**
 * Parent completion guard (Steps 9–10).
 *
 * Throws when any required (non-cancelled) subtask is unfinished, naming the
 * blockers. Cancelled subtasks never block. The transition engine calls this
 * before completing or approving a parent.
 */
export async function assertParentCanComplete(
  parentId: string,
  options: TaskServiceOptions = {},
): Promise<void> {
  void resolveConnection(options);

  const objectId = new mongoose.Types.ObjectId(assertObjectId(parentId, 'parent task'));

  const unfinished = (await TaskModel.find({
    parentTaskId: objectId,
    status: { $nin: ['done', 'cancelled'] },
  })
    .select({ title: 1, status: 1 })
    .lean()) as Array<{ _id: mongoose.Types.ObjectId; title: string; status: string }>;

  if (unfinished.length === 0) {
    return;
  }

  const names = unfinished
    .slice(0, 5)
    .map((child) => `"${child.title}" (${child.status})`)
    .join(', ');
  const remainder = unfinished.length > 5 ? ` and ${unfinished.length - 5} more` : '';

  throw new ValidationError(
    `The parent cannot be completed while ${unfinished.length} subtask(s) are unfinished: ${names}${remainder}.`,
  );
}
