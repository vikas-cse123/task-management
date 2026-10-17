import type { AccessLevel, DashboardSummary } from '@interscale/shared';
import mongoose from 'mongoose';
import type { Connection } from 'mongoose';
import { getConnection } from '../connection';
import { assertObjectId } from '../lib/object-id';
import { ClientModel } from '../models/client';
import { JobRoleModel } from '../models/job-role';
import { ProjectModel } from '../models/project';
import { TaskModel } from '../models/task';
import { listActiveClientIdsForUser } from './client.service';
import { BETTER_AUTH_USER_COLLECTION } from '../identity';

/**
 * Role-scoped dashboard aggregates (Step 11).
 *
 * Counts only — no task/client/project bodies cross scope boundaries, so
 * aggregates can never leak unauthorized work. Cancellation never counts as
 * open work; overdue/blocked are derived, never stored.
 */

export interface DashboardOptions {
  connection?: Connection;
}

function utcDayBounds(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1) };
}

interface Scope {
  clientIds: mongoose.Types.ObjectId[] | null;
  projectIds: mongoose.Types.ObjectId[] | null;
  assigneeId: mongoose.Types.ObjectId | null;
}

async function resolveScope(
  userId: string,
  accessLevel: AccessLevel,
  options: DashboardOptions,
): Promise<Scope> {
  void options;

  if (accessLevel === 'Admin') {
    return { clientIds: null, projectIds: null, assigneeId: null };
  }

  const userObjectId = new mongoose.Types.ObjectId(assertObjectId(userId, 'user'));

  if (accessLevel === 'Manager') {
    const clientIds = (await listActiveClientIdsForUser(userId, options)).map(
      (id) => new mongoose.Types.ObjectId(id),
    );

    const projectIds = (await ProjectModel.distinct('_id', {
      clientId: { $in: clientIds },
    })) as mongoose.Types.ObjectId[];

    return {
      clientIds,
      projectIds: projectIds.map((id) => new mongoose.Types.ObjectId(id.toString())),
      assigneeId: userObjectId,
    };
  }

  const projectIds = (await TaskModel.distinct('projectId', {
    assignedUserId: userObjectId,
    status: { $ne: 'cancelled' },
  })) as mongoose.Types.ObjectId[];

  const projects = await ProjectModel.find({
    _id: { $in: projectIds.map((id) => new mongoose.Types.ObjectId(id.toString())) },
  })
    .select({ clientId: 1 })
    .lean();

  return {
    clientIds: [...new Set(projects.map((project) => project.clientId.toString()))].map(
      (id) => new mongoose.Types.ObjectId(id),
    ),
    projectIds: projectIds.map((id) => new mongoose.Types.ObjectId(id.toString())),
    assigneeId: userObjectId,
  };
}

function inList(ids: mongoose.Types.ObjectId[] | null): Record<string, unknown> | undefined {
  return ids ? { $in: ids } : undefined;
}

export async function getDashboardSummary(
  userId: string,
  accessLevel: AccessLevel,
  options: DashboardOptions = {},
): Promise<DashboardSummary> {
  const connection = options.connection ?? getConnection();
  void connection;

  const scope = await resolveScope(userId, accessLevel, options);
  const { start, end } = utcDayBounds();
  const now = new Date();
  const actionableStatus = { $nin: ['done', 'cancelled'] } as const;

  const clientFilter: Record<string, unknown> = scope.clientIds
    ? { _id: inList(scope.clientIds) }
    : {};
  const projectFilter: Record<string, unknown> = scope.projectIds
    ? { _id: inList(scope.projectIds) }
    : {};

  const projectScope = scope.projectIds ? { projectId: { $in: scope.projectIds } } : {};
  const ownScope =
    accessLevel === 'Employee' && scope.assigneeId ? { assignedUserId: scope.assigneeId } : {};
  const taskScope = accessLevel === 'Employee' ? ownScope : projectScope;
  const myId = scope.assigneeId ?? new mongoose.Types.ObjectId(assertObjectId(userId, 'user'));

  const [
    clientTotal,
    clientActive,
    clientWithoutManager,
    projectTotal,
    projectOpen,
    taskTotal,
    taskDueToday,
    taskOverdue,
    taskBlocked,
    taskAwaiting,
    taskDone,
    myDueToday,
    myOverdue,
    myBlocked,
    myAwaiting,
    myDone,
    myTotal,
    approvalsPending,
  ] = await Promise.all([
    ClientModel.countDocuments(clientFilter),
    ClientModel.countDocuments({ ...clientFilter, status: 'active' }),
    ClientModel.countDocuments({ ...clientFilter, primaryManagerId: null }),
    ProjectModel.countDocuments(projectFilter),
    ProjectModel.countDocuments({
      ...projectFilter,
      status: { $nin: ['completed', 'cancelled'] },
    }),
    TaskModel.countDocuments({ ...taskScope, status: { $ne: 'cancelled' } }),
    TaskModel.countDocuments({
      ...taskScope,
      status: actionableStatus,
      dueAt: { $gte: start, $lte: end },
    }),
    TaskModel.countDocuments({ ...taskScope, status: actionableStatus, dueAt: { $lt: now } }),
    TaskModel.countDocuments({ ...taskScope, status: 'blocked' }),
    TaskModel.countDocuments({ ...taskScope, status: 'awaiting_approval' }),
    TaskModel.countDocuments({ ...taskScope, status: 'done' }),
    TaskModel.countDocuments({
      assignedUserId: myId,
      status: actionableStatus,
      dueAt: { $gte: start, $lte: end },
    }),
    TaskModel.countDocuments({
      assignedUserId: myId,
      status: actionableStatus,
      dueAt: { $lt: now },
    }),
    TaskModel.countDocuments({
      assignedUserId: myId,
      status: 'blocked',
    }),
    TaskModel.countDocuments({
      assignedUserId: myId,
      status: 'awaiting_approval',
    }),
    TaskModel.countDocuments({
      assignedUserId: myId,
      status: 'done',
    }),
    TaskModel.countDocuments({
      assignedUserId: myId,
      status: { $ne: 'cancelled' },
    }),
    TaskModel.countDocuments({
      approverId: new mongoose.Types.ObjectId(assertObjectId(userId, 'user')),
      status: 'awaiting_approval',
      ...(accessLevel === 'Admin' ? {} : projectScope),
    }),
  ]);

  // Workload by employee: open + overdue leaf-level counts per assignee.
  const workloadMatch: Record<string, unknown> = {
    assignedUserId: { $ne: null },
    status: { $ne: 'cancelled' },
    ...projectScope,
  };

  if (accessLevel === 'Employee') {
    workloadMatch['assignedUserId'] = scope.assigneeId;
  }

  const workloadRows = (await TaskModel.aggregate([
    { $match: workloadMatch },
    {
      $group: {
        _id: '$assignedUserId',
        open: { $sum: { $cond: [{ $not: [{ $in: ['$status', ['done', 'cancelled']] }] }, 1, 0] } },
        overdue: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $lt: ['$dueAt', now] },
                  { $ne: ['$dueAt', null] },
                  { $not: [{ $in: ['$status', ['done', 'cancelled']] }] },
                ],
              },
              1,
              0,
            ],
          },
        },
      },
    },
    { $sort: { open: -1 } },
    { $limit: 50 },
  ])) as Array<{ _id: mongoose.Types.ObjectId; open: number; overdue: number }>;

  const workloadUserIds = workloadRows.map((row) => row._id.toString());
  const db = connection.db;

  const userDocs = db
    ? ((await db
        .collection(BETTER_AUTH_USER_COLLECTION)
        .find({ _id: { $in: workloadUserIds.map((id) => new mongoose.Types.ObjectId(id)) } })
        .project({ name: 1, email: 1 })
        .toArray()) as Array<{ _id: mongoose.Types.ObjectId; name: string; email: string }>)
    : [];

  const userById = new Map(userDocs.map((user) => [user._id.toString(), user]));

  // Workload by functional job role (task's assigned role, not headcount).
  const roleRows = (await TaskModel.aggregate([
    { $match: { ...workloadMatch, assignedJobRoleId: { $ne: null } } },
    {
      $group: {
        _id: '$assignedJobRoleId',
        open: { $sum: { $cond: [{ $not: [{ $in: ['$status', ['done', 'cancelled']] }] }, 1, 0] } },
        overdue: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $lt: ['$dueAt', now] },
                  { $ne: ['$dueAt', null] },
                  { $not: [{ $in: ['$status', ['done', 'cancelled']] }] },
                ],
              },
              1,
              0,
            ],
          },
        },
      },
    },
    { $sort: { open: -1 } },
  ])) as Array<{ _id: mongoose.Types.ObjectId; open: number; overdue: number }>;

  const roleDocs = await JobRoleModel.find({
    _id: { $in: roleRows.map((row) => row._id) },
  })
    .select({ name: 1 })
    .lean();

  const roleById = new Map(roleDocs.map((role) => [role._id.toString(), role]));

  return {
    clients: { total: clientTotal, active: clientActive, withoutManager: clientWithoutManager },
    projects: { total: projectTotal, open: projectOpen },
    tasks: {
      total: taskTotal,
      dueToday: taskDueToday,
      overdue: taskOverdue,
      blocked: taskBlocked,
      awaitingApproval: taskAwaiting,
      done: taskDone,
    },
    myWork: {
      total: myTotal,
      dueToday: myDueToday,
      overdue: myOverdue,
      blocked: myBlocked,
      awaitingApproval: myAwaiting,
      done: myDone,
    },
    approvalsPending,
    workloadByEmployee: workloadRows.map((row) => ({
      userId: row._id.toString(),
      name: userById.get(row._id.toString())?.name ?? 'Unknown',
      email: userById.get(row._id.toString())?.email ?? '',
      open: row.open,
      overdue: row.overdue,
    })),
    workloadByRole: roleRows.map((row) => ({
      jobRoleId: row._id.toString(),
      name: roleById.get(row._id.toString())?.name ?? 'Unknown role',
      open: row.open,
      overdue: row.overdue,
    })),
  };
}
