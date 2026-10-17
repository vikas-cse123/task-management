import {
  CLIENT_TEAM_ROLES,
  DEFAULT_CLIENT_TEAM_ROLE,
  type ClientListQuery,
  type ClientRoleAssignmentView,
  type ClientStatus,
  type ClientSummary,
  type ClientTeamMemberUpdate,
  type ClientTeamMemberView,
  type ClientTeamRole,
  type CreateClientInput,
  type UpdateClientInput,
} from '@interscale/shared';
import mongoose from 'mongoose';
import type { Connection } from 'mongoose';
import { getConnection } from '../connection';
import { assertObjectId } from '../lib/object-id';
import { ConflictError, NotFoundError, ValidationError } from '../lib/errors';
import { ClientModel } from '../models/client';
import { ClientRoleAssignmentModel } from '../models/client-role-assignment';
import { ClientTeamMemberModel } from '../models/client-team-member';
import { recordAudit } from './audit.service';
import type { EmployeeDirectory } from './employee-directory';

/**
 * Server-side client, client-team and designated-role reads/writes.
 *
 * Listing is scope-filtered: Admins read every client, everyone else reads only
 * clients where they hold an active team membership (docs/03-authorization.md).
 * Designated role assignment itself stays in `client-role-assignment.service`
 * (transactional); this module owns membership lifecycle.
 */

export interface ClientServiceOptions {
  connection?: Connection;
}

export interface ClientServiceDeps extends ClientServiceOptions {
  /** Employee lookup used to validate members and the primary manager. */
  directory: EmployeeDirectory;
}

export type ClientScope = { kind: 'all' } | { kind: 'member'; userId: string };

function resolveConnection(options: ClientServiceOptions): Connection {
  return options.connection ?? getConnection();
}

type ClientFilter = {
  status?: ClientStatus;
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

  if (typeof value === 'string') {
    const parsed = new Date(value);

    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  return new Date(0).toISOString();
}

function toClientSummary(doc: {
  _id: mongoose.Types.ObjectId;
  name: string;
  status: ClientStatus;
  primaryManagerId?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}): ClientSummary {
  return {
    id: doc._id.toString(),
    name: doc.name,
    status: doc.status,
    primaryManagerId: doc.primaryManagerId ? doc.primaryManagerId.toString() : null,
    createdAt: asIso(doc.createdAt),
    updatedAt: asIso(doc.updatedAt),
  };
}

function toTeamMemberView(doc: {
  _id: mongoose.Types.ObjectId;
  clientId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  roleInTeam: ClientTeamRole;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): ClientTeamMemberView {
  return {
    id: doc._id.toString(),
    clientId: doc.clientId.toString(),
    userId: doc.userId.toString(),
    roleInTeam: doc.roleInTeam,
    isActive: doc.isActive,
    createdAt: asIso(doc.createdAt),
    updatedAt: asIso(doc.updatedAt),
  };
}

export interface ClientListResult {
  readonly data: ClientSummary[];
  readonly nextCursor: string | null;
}

/** Client ids where a user holds an active team membership. */
export async function listActiveClientIdsForUser(
  userId: string,
  options: ClientServiceOptions = {},
): Promise<string[]> {
  void resolveConnection(options);

  const rows = (await ClientTeamMemberModel.find({
    userId: new mongoose.Types.ObjectId(assertObjectId(userId, 'user')),
    isActive: true,
  })
    .select({ clientId: 1 })
    .lean()) as Array<{ clientId: mongoose.Types.ObjectId }>;

  return [...new Set(rows.map((row) => row.clientId.toString()))];
}

/** Whether a user holds an active team membership on a client. */
export async function isActiveClientMember(
  clientId: string,
  userId: string,
  options: ClientServiceOptions = {},
): Promise<boolean> {
  void resolveConnection(options);

  const membership = await ClientTeamMemberModel.findOne({
    clientId: new mongoose.Types.ObjectId(assertObjectId(clientId, 'client')),
    userId: new mongoose.Types.ObjectId(assertObjectId(userId, 'user')),
    isActive: true,
  })
    .select({ _id: 1 })
    .lean();

  return membership !== null;
}

/** List clients with filters, scope filtering and `_id`-based cursor pagination. */
export async function listClients(
  query: ClientListQuery,
  scope: ClientScope,
  options: ClientServiceOptions = {},
): Promise<ClientListResult> {
  void resolveConnection(options);

  const filter: ClientFilter = {};

  if (query.status) {
    filter.status = query.status;
  }

  if (query.search && query.search.length > 0) {
    filter.name = { $regex: escapeRegExp(query.search), $options: 'i' };
  }

  if (scope.kind === 'member') {
    const clientIds = await listActiveClientIdsForUser(scope.userId, options);

    if (clientIds.length === 0) {
      return { data: [], nextCursor: null };
    }

    filter._id = { $in: clientIds.map((id) => new mongoose.Types.ObjectId(id)) };
  }

  if (query.cursor) {
    filter._id = { ...filter._id, $gt: new mongoose.Types.ObjectId(query.cursor) };
  }

  const documents = await ClientModel.find(filter)
    .sort({ _id: 1 })
    .limit(query.limit + 1)
    .lean();

  const hasMore = documents.length > query.limit;
  const page = hasMore ? documents.slice(0, query.limit) : documents;

  return {
    data: page.map((doc) =>
      toClientSummary({
        _id: doc._id,
        name: doc.name,
        status: doc.status,
        primaryManagerId: doc.primaryManagerId,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      }),
    ),
    nextCursor: hasMore && page.length > 0 ? (page[page.length - 1]?._id.toString() ?? null) : null,
  };
}

/** Find a single client, or `null` when the id is malformed or unknown. */
export async function findClient(
  id: string,
  options: ClientServiceOptions = {},
): Promise<ClientSummary | null> {
  void resolveConnection(options);

  let objectId: mongoose.Types.ObjectId;

  try {
    objectId = new mongoose.Types.ObjectId(assertObjectId(id, 'client'));
  } catch {
    return null;
  }

  const doc = await ClientModel.findById(objectId).lean();

  if (!doc) {
    return null;
  }

  return toClientSummary({
    _id: doc._id,
    name: doc.name,
    status: doc.status,
    primaryManagerId: doc.primaryManagerId,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  });
}

async function assertActiveEmployee(
  directory: EmployeeDirectory,
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

/**
 * Ensure an active team membership for a user on a client (created with the
 * `manager` team role when missing).
 *
 * Used when assigning a primary manager — and a project manager — so the
 * responsible Manager always has scope visibility of the client
 * (docs/03-authorization.md §6).
 */
export async function ensureActiveMembership(
  clientId: string,
  userId: string,
  actorId: string | null,
  context: string = 'primary manager',
): Promise<void> {
  const existing = await ClientTeamMemberModel.findOne({ clientId, userId });

  if (existing && existing.isActive) {
    return;
  }

  if (existing) {
    existing.isActive = true;
    await existing.save();

    await recordAudit({
      actorId,
      action: 'client.team.activate',
      entityType: 'client_team_member',
      entityId: existing._id.toString(),
      previousValue: { isActive: false },
      newValue: { isActive: true, roleInTeam: existing.roleInTeam },
      notes: `Reactivated when assigned as ${context}`,
    });
    return;
  }

  const [membership] = await ClientTeamMemberModel.create([
    { clientId, userId, roleInTeam: 'manager' satisfies ClientTeamRole, isActive: true },
  ]);

  if (!membership) {
    throw new ValidationError('Failed to create client team membership');
  }

  await recordAudit({
    actorId,
    action: 'client.team.assign',
    entityType: 'client_team_member',
    entityId: membership._id.toString(),
    previousValue: null,
    newValue: { clientId, userId, roleInTeam: 'manager', isActive: true },
    notes: `Created when assigned as ${context}`,
  });
}

/** Create a client (Admin only; enforced by the API layer). */
export async function createClientRecord(
  input: CreateClientInput,
  actorId: string,
  deps: ClientServiceDeps,
): Promise<ClientSummary> {
  void resolveConnection(deps);

  if (input.primaryManagerId !== undefined && input.primaryManagerId !== null) {
    await assertActiveEmployee(deps.directory, input.primaryManagerId, 'primary manager');
  }

  let document;

  try {
    [document] = await ClientModel.create([
      {
        name: input.name,
        status: input.status,
        primaryManagerId: input.primaryManagerId ?? null,
      },
    ]);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 11000) {
      throw new ConflictError('A client with this name already exists');
    }

    throw error;
  }

  if (!document) {
    throw new ValidationError('Failed to create client');
  }

  const clientId = document._id.toString();

  if (input.primaryManagerId !== undefined && input.primaryManagerId !== null) {
    await ensureActiveMembership(clientId, input.primaryManagerId, actorId);
  }

  await recordAudit({
    actorId,
    action: 'client.create',
    entityType: 'client',
    entityId: clientId,
    previousValue: null,
    newValue: {
      name: input.name,
      status: input.status,
      primaryManagerId: input.primaryManagerId ?? null,
    },
    notes: null,
  });

  const created = await ClientModel.findById(document._id).lean();

  if (!created) {
    throw new NotFoundError('Client');
  }

  return toClientSummary({
    _id: created._id,
    name: created.name,
    status: created.status,
    primaryManagerId: created.primaryManagerId,
    createdAt: created.createdAt,
    updatedAt: created.updatedAt,
  });
}

/** Update a client. Callers enforce Admin / `clients.manage` + scope. */
export async function updateClientRecord(
  id: string,
  input: UpdateClientInput,
  actorId: string,
  deps: ClientServiceDeps,
): Promise<ClientSummary> {
  void resolveConnection(deps);

  const clientId = assertObjectId(id, 'client');
  const document = await ClientModel.findById(clientId);

  if (!document) {
    throw new NotFoundError('Client');
  }

  if (input.primaryManagerId !== undefined && input.primaryManagerId !== null) {
    await assertActiveEmployee(deps.directory, input.primaryManagerId, 'primary manager');
  }

  const previous = {
    name: document.name,
    status: document.status,
    primaryManagerId: document.primaryManagerId ? document.primaryManagerId.toString() : null,
  };

  if (input.name !== undefined) document.name = input.name;
  if (input.status !== undefined) document.status = input.status;
  if (input.primaryManagerId !== undefined) {
    document.primaryManagerId = input.primaryManagerId
      ? new mongoose.Types.ObjectId(input.primaryManagerId)
      : null;
  }

  try {
    await document.save();
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 11000) {
      throw new ConflictError('A client with this name already exists');
    }

    throw error;
  }

  if (input.primaryManagerId !== undefined && input.primaryManagerId !== null) {
    await ensureActiveMembership(clientId, input.primaryManagerId, actorId);
  }

  await recordAudit({
    actorId,
    action: 'client.update',
    entityType: 'client',
    entityId: clientId,
    previousValue: previous,
    newValue: {
      name: document.name,
      status: document.status,
      primaryManagerId: document.primaryManagerId ? document.primaryManagerId.toString() : null,
    },
    notes: null,
  });

  return toClientSummary({
    _id: document._id,
    name: document.name,
    status: document.status,
    primaryManagerId: document.primaryManagerId,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  });
}

/** List every team membership on a client (active and inactive). */
export async function listClientTeamMembers(
  clientId: string,
  options: ClientServiceOptions = {},
): Promise<ClientTeamMemberView[]> {
  void resolveConnection(options);

  const objectId = new mongoose.Types.ObjectId(assertObjectId(clientId, 'client'));
  const documents = await ClientTeamMemberModel.find({ clientId: objectId })
    .sort({ _id: 1 })
    .lean();

  return documents.map((doc) =>
    toTeamMemberView({
      _id: doc._id,
      clientId: doc.clientId,
      userId: doc.userId,
      roleInTeam: doc.roleInTeam,
      isActive: doc.isActive,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    }),
  );
}

function assertTeamRole(role: string): ClientTeamRole {
  if (!(CLIENT_TEAM_ROLES as readonly string[]).includes(role)) {
    throw new ValidationError('Unknown client team role');
  }

  return role as ClientTeamRole;
}

/**
 * Add or update a client team member.
 *
 * The employee must exist and be active; inactive employees can never hold an
 * active membership. Callers enforce Admin / `clients.team.manage` + scope.
 */
export async function upsertClientTeamMember(
  actorId: string,
  clientId: string,
  userId: string,
  input: ClientTeamMemberUpdate,
  deps: ClientServiceDeps,
): Promise<ClientTeamMemberView> {
  void resolveConnection(deps);

  const resolvedClientId = assertObjectId(clientId, 'client');
  const resolvedUserId = assertObjectId(userId, 'employee');

  const client = await ClientModel.findById(resolvedClientId).lean();

  if (!client) {
    throw new NotFoundError('Client');
  }

  const existing = await ClientTeamMemberModel.findOne({
    clientId: resolvedClientId,
    userId: resolvedUserId,
  });

  const roleInTeam = input.roleInTeam ?? existing?.roleInTeam ?? DEFAULT_CLIENT_TEAM_ROLE;
  assertTeamRole(roleInTeam);

  const isActive = input.isActive ?? existing?.isActive ?? true;

  await assertActiveEmployee(deps.directory, resolvedUserId, 'employee');

  if (
    !isActive &&
    client.primaryManagerId &&
    client.primaryManagerId.toString() === resolvedUserId
  ) {
    throw new ValidationError('Reassign the primary manager before deactivating this member');
  }

  if (!existing) {
    const [membership] = await ClientTeamMemberModel.create([
      { clientId: resolvedClientId, userId: resolvedUserId, roleInTeam, isActive },
    ]);

    if (!membership) {
      throw new ValidationError('Failed to create client team membership');
    }

    await recordAudit({
      actorId,
      action: 'client.team.assign',
      entityType: 'client_team_member',
      entityId: membership._id.toString(),
      previousValue: null,
      newValue: { clientId: resolvedClientId, userId: resolvedUserId, roleInTeam, isActive },
      notes: null,
    });

    return toTeamMemberView({
      _id: membership._id,
      clientId: membership.clientId,
      userId: membership.userId,
      roleInTeam: membership.roleInTeam,
      isActive: membership.isActive,
      createdAt: membership.createdAt,
      updatedAt: membership.updatedAt,
    });
  }

  const previous = { roleInTeam: existing.roleInTeam, isActive: existing.isActive };
  existing.roleInTeam = roleInTeam;
  existing.isActive = isActive;
  await existing.save();

  const action =
    previous.isActive === false && isActive
      ? 'client.team.activate'
      : previous.isActive && !isActive
        ? 'client.team.deactivate'
        : 'client.team.assign';

  await recordAudit({
    actorId,
    action,
    entityType: 'client_team_member',
    entityId: existing._id.toString(),
    previousValue: previous,
    newValue: { roleInTeam: existing.roleInTeam, isActive: existing.isActive },
    notes: null,
  });

  return toTeamMemberView({
    _id: existing._id,
    clientId: existing.clientId,
    userId: existing.userId,
    roleInTeam: existing.roleInTeam,
    isActive: existing.isActive,
    createdAt: existing.createdAt,
    updatedAt: existing.updatedAt,
  });
}

/**
 * Deactivate a client team member (memberships are never deleted).
 *
 * The member's active designated role assignments are deactivated as well so
 * no active assignment points at an inactive member. Blocked while the member
 * is the client's primary manager.
 */
export async function deactivateClientTeamMember(
  actorId: string,
  clientId: string,
  userId: string,
  options: ClientServiceOptions = {},
): Promise<ClientTeamMemberView> {
  void resolveConnection(options);

  const resolvedClientId = assertObjectId(clientId, 'client');
  const resolvedUserId = assertObjectId(userId, 'employee');

  const client = await ClientModel.findById(resolvedClientId);

  if (!client) {
    throw new NotFoundError('Client');
  }

  if (client.primaryManagerId && client.primaryManagerId.toString() === resolvedUserId) {
    throw new ValidationError('Reassign the primary manager before deactivating this member');
  }

  const membership = await ClientTeamMemberModel.findOne({
    clientId: resolvedClientId,
    userId: resolvedUserId,
  });

  if (!membership) {
    throw new NotFoundError('Client team membership');
  }

  const previous = { isActive: membership.isActive };
  membership.isActive = false;
  await membership.save();

  const assignments = await ClientRoleAssignmentModel.updateMany(
    { clientId: resolvedClientId, userId: resolvedUserId, isActive: true },
    { $set: { isActive: false, isPrimary: false } },
  );

  await recordAudit({
    actorId,
    action: 'client.team.deactivate',
    entityType: 'client_team_member',
    entityId: membership._id.toString(),
    previousValue: previous,
    newValue: { isActive: false, deactivatedAssignments: assignments.modifiedCount },
    notes: null,
  });

  return toTeamMemberView({
    _id: membership._id,
    clientId: membership.clientId,
    userId: membership.userId,
    roleInTeam: membership.roleInTeam,
    isActive: membership.isActive,
    createdAt: membership.createdAt,
    updatedAt: membership.updatedAt,
  });
}

function toRoleAssignmentView(doc: {
  _id: mongoose.Types.ObjectId;
  clientId: mongoose.Types.ObjectId;
  jobRoleId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  isPrimary: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): ClientRoleAssignmentView {
  return {
    id: doc._id.toString(),
    clientId: doc.clientId.toString(),
    jobRoleId: doc.jobRoleId.toString(),
    userId: doc.userId.toString(),
    isPrimary: doc.isPrimary,
    isActive: doc.isActive,
    createdAt: asIso(doc.createdAt),
    updatedAt: asIso(doc.updatedAt),
  };
}

/** List every designated role assignment on a client (active and inactive). */
export async function listClientRoleAssignments(
  clientId: string,
  options: ClientServiceOptions = {},
): Promise<ClientRoleAssignmentView[]> {
  void resolveConnection(options);

  const objectId = new mongoose.Types.ObjectId(assertObjectId(clientId, 'client'));
  const documents = await ClientRoleAssignmentModel.find({ clientId: objectId })
    .sort({ _id: 1 })
    .lean();

  return documents.map((doc) =>
    toRoleAssignmentView({
      _id: doc._id,
      clientId: doc.clientId,
      jobRoleId: doc.jobRoleId,
      userId: doc.userId,
      isPrimary: doc.isPrimary,
      isActive: doc.isActive,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    }),
  );
}

/** Find a single designated role assignment, or `null`. */
export async function findClientRoleAssignment(
  assignmentId: string,
  options: ClientServiceOptions = {},
): Promise<ClientRoleAssignmentView | null> {
  void resolveConnection(options);

  let objectId: mongoose.Types.ObjectId;

  try {
    objectId = new mongoose.Types.ObjectId(assertObjectId(assignmentId, 'client role assignment'));
  } catch {
    return null;
  }

  const doc = await ClientRoleAssignmentModel.findById(objectId).lean();

  if (!doc) {
    return null;
  }

  return toRoleAssignmentView({
    _id: doc._id,
    clientId: doc.clientId,
    jobRoleId: doc.jobRoleId,
    userId: doc.userId,
    isPrimary: doc.isPrimary,
    isActive: doc.isActive,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  });
}
