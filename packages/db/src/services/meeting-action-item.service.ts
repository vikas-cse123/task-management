import {
  type ConvertMeetingActionItemInput,
  type CreateMeetingActionItemInput,
  type MeetingActionItem,
  type MeetingActionItemWithTask,
  type TaskStatus,
  type UpdateMeetingActionItemInput,
} from '@interscale/shared';
import mongoose from 'mongoose';
import type { ClientSession, Connection } from 'mongoose';
import { getConnection, withTransaction } from '../connection';
import { assertObjectId } from '../lib/object-id';
import { ConcurrentModificationError, NotFoundError, ValidationError } from '../lib/errors';
import { MeetingActionItemModel } from '../models/meeting-action-item';
import { MeetingModel } from '../models/meeting';
import { ProjectModel } from '../models/project';
import { TaskModel } from '../models/task';
import { BETTER_AUTH_USER_COLLECTION } from '../identity';
import { recordAudit } from './audit.service';
import type { EmployeeDirectory } from './employee-directory';
import { createTaskRecord, validateTaskAssignee } from './task.service';

/**
 * Meeting action items (Phase 6, Step 33).
 *
 * Action items are meeting follow-up records, not tasks. They never introduce a
 * second task lifecycle: a pending item becomes `converted` exactly once by
 * running the existing Task service, and the resulting `linkedTaskId` makes the
 * conversion idempotent and preserves history. Assignment reuses the Phase 3
 * eligibility rules via `validateTaskAssignee` (active employee, holds the
 * functional role, active client-team member) — never a random or PM fallback.
 */

export interface MeetingActionItemServiceOptions {
  connection?: Connection;
  session?: ClientSession;
}

export interface MeetingActionItemServiceDeps extends MeetingActionItemServiceOptions {
  directory: EmployeeDirectory;
}

interface ActionItemLike {
  _id: mongoose.Types.ObjectId;
  meetingId: mongoose.Types.ObjectId;
  clientId: mongoose.Types.ObjectId;
  projectId?: mongoose.Types.ObjectId | null;
  title: string;
  description?: string | null;
  responsibleJobRoleId: mongoose.Types.ObjectId;
  assignedUserId?: mongoose.Types.ObjectId | null;
  dueAt?: Date | null;
  priority: MeetingActionItem['priority'];
  status: MeetingActionItem['status'];
  linkedTaskId?: mongoose.Types.ObjectId | null;
  createdBy?: mongoose.Types.ObjectId | null;
  updatedBy?: mongoose.Types.ObjectId | null;
  __v?: number;
  createdAt: Date;
  updatedAt: Date;
}

function asIso(value: Date | undefined): string {
  return value instanceof Date ? value.toISOString() : new Date(0).toISOString();
}

function asNullableIso(value: Date | null | undefined): string | null {
  return value instanceof Date ? value.toISOString() : null;
}

function toActionItem(
  doc: ActionItemLike,
  assignedUserName: string | null = null,
): MeetingActionItem {
  const assignedUserId = doc.assignedUserId ? doc.assignedUserId.toString() : null;

  return {
    id: doc._id.toString(),
    meetingId: doc.meetingId.toString(),
    clientId: doc.clientId.toString(),
    projectId: doc.projectId ? doc.projectId.toString() : null,
    title: doc.title,
    description: doc.description ?? null,
    responsibleJobRoleId: doc.responsibleJobRoleId.toString(),
    assignedUserId,
    assignedUserName,
    dueAt: asNullableIso(doc.dueAt),
    priority: doc.priority,
    status: doc.status,
    needsAssignment: doc.status === 'pending' && assignedUserId === null,
    linkedTaskId: doc.linkedTaskId ? doc.linkedTaskId.toString() : null,
    createdBy: doc.createdBy ? doc.createdBy.toString() : null,
    updatedBy: doc.updatedBy ? doc.updatedBy.toString() : null,
    version: typeof doc.__v === 'number' ? doc.__v : 0,
    createdAt: asIso(doc.createdAt),
    updatedAt: asIso(doc.updatedAt),
  };
}

async function assertMeeting(meetingId: string, options: MeetingActionItemServiceOptions) {
  const meeting = await MeetingModel.findById(assertObjectId(meetingId, 'meeting'))
    .session(options.session ?? null)
    .lean();

  if (!meeting) {
    throw new NotFoundError('Meeting');
  }

  return meeting;
}

/** Validate a project reference belongs to the meeting's client. */
async function resolveProjectForClient(
  clientId: string,
  projectId: string,
  options: MeetingActionItemServiceOptions,
): Promise<mongoose.Types.ObjectId> {
  const project = await ProjectModel.findById(assertObjectId(projectId, 'project'))
    .session(options.session ?? null)
    .select({ clientId: 1 })
    .lean();

  if (!project) {
    throw new NotFoundError('Project');
  }

  if (project.clientId.toString() !== clientId) {
    throw new ValidationError('The selected project does not belong to the meeting client');
  }

  return project._id;
}

/** Create an action item on a meeting. */
export async function createMeetingActionItem(
  meetingId: string,
  input: CreateMeetingActionItemInput,
  actorId: string,
  deps: MeetingActionItemServiceDeps,
): Promise<MeetingActionItem> {
  void (deps.connection ?? getConnection());

  const meeting = await assertMeeting(meetingId, deps);
  const clientId = meeting.clientId.toString();

  if (meeting.status === 'cancelled') {
    throw new ValidationError('Cannot add action items to a cancelled meeting');
  }

  const projectId = input.projectId
    ? await resolveProjectForClient(clientId, input.projectId, deps)
    : (meeting.projectId ?? null);

  await validateTaskAssignee(
    deps.directory,
    clientId,
    input.assignedUserId,
    input.responsibleJobRoleId,
  );

  const [document] = await MeetingActionItemModel.create(
    [
      {
        meetingId: meeting._id,
        clientId: meeting.clientId,
        projectId,
        title: input.title,
        description: input.description,
        responsibleJobRoleId: new mongoose.Types.ObjectId(input.responsibleJobRoleId),
        assignedUserId: input.assignedUserId
          ? new mongoose.Types.ObjectId(input.assignedUserId)
          : null,
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
        priority: input.priority,
        status: 'pending',
        linkedTaskId: null,
        createdBy: new mongoose.Types.ObjectId(assertObjectId(actorId, 'actor')),
        updatedBy: new mongoose.Types.ObjectId(assertObjectId(actorId, 'actor')),
      },
    ],
    deps.session ? { session: deps.session } : {},
  );

  if (!document) {
    throw new ValidationError('Failed to create action item');
  }

  await recordAudit({
    actorId,
    action: 'meeting.action_item.create',
    entityType: 'meeting_action_item',
    entityId: document._id.toString(),
    previousValue: null,
    newValue: {
      meetingId,
      title: input.title,
      assignedUserId: input.assignedUserId,
      responsibleJobRoleId: input.responsibleJobRoleId,
      dueAt: input.dueAt,
      priority: input.priority,
    },
    notes: null,
    session: deps.session,
  });

  return toActionItem(document.toObject() as ActionItemLike);
}

async function attachTaskStatuses(
  items: ActionItemLike[],
  options: MeetingActionItemServiceOptions,
): Promise<MeetingActionItemWithTask[]> {
  const taskObjectIds = items
    .map((item) => item.linkedTaskId)
    .filter((value): value is mongoose.Types.ObjectId => Boolean(value));

  const statuses = new Map<string, TaskStatus>();

  if (taskObjectIds.length > 0) {
    const tasks = await TaskModel.find({ _id: { $in: taskObjectIds } })
      .session(options.session ?? null)
      .select({ status: 1 })
      .lean();

    for (const task of tasks) {
      statuses.set(task._id.toString(), task.status);
    }
  }

  const assigneeIds = [
    ...new Set(
      items
        .map((item) => item.assignedUserId)
        .filter((value): value is mongoose.Types.ObjectId => Boolean(value))
        .map((value) => value.toString()),
    ),
  ];
  const assigneeNames = await loadAssigneeNames(assigneeIds, options);

  return items.map((item) => {
    const assigneeId = item.assignedUserId ? item.assignedUserId.toString() : null;

    return {
      ...toActionItem(item, assigneeId ? (assigneeNames.get(assigneeId) ?? null) : null),
      taskStatus: item.linkedTaskId ? (statuses.get(item.linkedTaskId.toString()) ?? null) : null,
    };
  });
}

/** Resolve assignee display names without leaking directory access. */
async function loadAssigneeNames(
  ids: readonly string[],
  options: MeetingActionItemServiceOptions,
): Promise<Map<string, string>> {
  if (ids.length === 0) {
    return new Map();
  }

  const connection = options.connection ?? getConnection();
  const documents = await connection
    .collection(BETTER_AUTH_USER_COLLECTION)
    .find(
      { _id: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) } },
      { projection: { name: 1 } },
    )
    .toArray();

  const names = new Map<string, string>();

  for (const document of documents) {
    if (typeof document.name === 'string') {
      names.set(document._id.toString(), document.name);
    }
  }

  return names;
}

/** List a meeting's action items (oldest first) with linked-task status. */
export async function listMeetingActionItems(
  meetingId: string,
  options: MeetingActionItemServiceOptions = {},
): Promise<MeetingActionItemWithTask[]> {
  const documents = await MeetingActionItemModel.find({
    meetingId: assertObjectId(meetingId, 'meeting'),
  })
    .session(options.session ?? null)
    .sort({ createdAt: 1, _id: 1 })
    .lean();

  return attachTaskStatuses(documents as ActionItemLike[], options);
}

/** Find one action item scoped to its meeting, or `null`. */
export async function findMeetingActionItem(
  meetingId: string,
  actionItemId: string,
  options: MeetingActionItemServiceOptions = {},
): Promise<MeetingActionItem | null> {
  let objectId: mongoose.Types.ObjectId;
  let meetingObjectId: mongoose.Types.ObjectId;

  try {
    objectId = new mongoose.Types.ObjectId(assertObjectId(actionItemId, 'action item'));
    meetingObjectId = new mongoose.Types.ObjectId(assertObjectId(meetingId, 'meeting'));
  } catch {
    return null;
  }

  const document = await MeetingActionItemModel.findOne({
    _id: objectId,
    meetingId: meetingObjectId,
  })
    .session(options.session ?? null)
    .lean();

  return document ? toActionItem(document as ActionItemLike) : null;
}

/** Edit a pending action item. Converted items are immutable (Step 33.10). */
export async function updateMeetingActionItem(
  meetingId: string,
  actionItemId: string,
  input: UpdateMeetingActionItemInput,
  actorId: string,
  deps: MeetingActionItemServiceDeps,
): Promise<MeetingActionItem> {
  void (deps.connection ?? getConnection());

  const document = await MeetingActionItemModel.findOne({
    _id: assertObjectId(actionItemId, 'action item'),
    meetingId: assertObjectId(meetingId, 'meeting'),
  }).session(deps.session ?? null);

  if (!document) {
    throw new NotFoundError('Action item');
  }

  if (document.status === 'converted' || document.linkedTaskId) {
    throw new ValidationError('A converted action item cannot be edited');
  }

  if (input.expectedVersion !== undefined && document.__v !== input.expectedVersion) {
    throw new ConcurrentModificationError();
  }

  const clientId = document.clientId.toString();
  const effectiveRole = input.responsibleJobRoleId ?? document.responsibleJobRoleId.toString();
  const effectiveAssignee =
    input.assignedUserId === undefined
      ? (document.assignedUserId?.toString() ?? null)
      : input.assignedUserId;

  await validateTaskAssignee(deps.directory, clientId, effectiveAssignee, effectiveRole);

  if (input.projectId !== undefined) {
    document.projectId = input.projectId
      ? await resolveProjectForClient(clientId, input.projectId, deps)
      : null;
  }

  if (input.title !== undefined) document.title = input.title;
  if (input.description !== undefined) document.description = input.description;
  if (input.responsibleJobRoleId !== undefined) {
    document.responsibleJobRoleId = new mongoose.Types.ObjectId(input.responsibleJobRoleId);
  }
  if (input.assignedUserId !== undefined) {
    document.assignedUserId = input.assignedUserId
      ? new mongoose.Types.ObjectId(input.assignedUserId)
      : null;
  }
  if (input.dueAt !== undefined) {
    document.dueAt = input.dueAt ? new Date(input.dueAt) : null;
  }
  if (input.priority !== undefined) document.priority = input.priority;

  document.updatedBy = new mongoose.Types.ObjectId(assertObjectId(actorId, 'actor'));

  try {
    await document.save({ session: deps.session ?? undefined });
  } catch (error) {
    if (error instanceof Error && error.name === 'VersionError') {
      throw new ConcurrentModificationError();
    }

    throw error;
  }

  await recordAudit({
    actorId,
    action: 'meeting.action_item.update',
    entityType: 'meeting_action_item',
    entityId: document._id.toString(),
    previousValue: null,
    newValue: {
      meetingId,
      title: document.title,
      assignedUserId: document.assignedUserId?.toString() ?? null,
    },
    notes: null,
    session: deps.session,
  });

  return toActionItem(document.toObject() as ActionItemLike);
}

/** Delete a pending action item. Converted items are preserved (Step 33.13). */
export async function deleteMeetingActionItem(
  meetingId: string,
  actionItemId: string,
  options: MeetingActionItemServiceOptions = {},
): Promise<void> {
  const document = await MeetingActionItemModel.findOne({
    _id: assertObjectId(actionItemId, 'action item'),
    meetingId: assertObjectId(meetingId, 'meeting'),
  }).session(options.session ?? null);

  if (!document) {
    throw new NotFoundError('Action item');
  }

  if (document.status === 'converted' || document.linkedTaskId) {
    throw new ValidationError('A converted action item cannot be deleted');
  }

  await document.deleteOne({ session: options.session ?? undefined });
}

export interface ConvertActionItemResult {
  readonly actionItem: MeetingActionItem;
  readonly taskId: string;
  readonly taskUrl: string;
  readonly created: boolean;
}

function taskUrlFor(taskId: string): string {
  return `/tasks/${taskId}`;
}

/**
 * Convert an action item into a real project task using the existing Task
 * service (Step 33.7), atomically and idempotently (Step 33.9).
 *
 * The whole operation runs in one transaction: the action item is locked by the
 * winner, the task is created through `createTaskRecord` (which writes audit,
 * activity and assignment-notification intents in the same session), and the
 * item is marked converted with its `linkedTaskId`. Replays, double-clicks and
 * concurrent attempts return the existing link instead of creating duplicates.
 */
export async function convertMeetingActionItem(
  meetingId: string,
  actionItemId: string,
  input: ConvertMeetingActionItemInput,
  actorId: string,
  deps: MeetingActionItemServiceDeps,
): Promise<ConvertActionItemResult> {
  const connection = deps.connection ?? getConnection();

  async function conversionWork(session: ClientSession): Promise<ConvertActionItemResult> {
    const meeting = await MeetingModel.findById(assertObjectId(meetingId, 'meeting'))
      .session(session)
      .lean();

    if (!meeting) {
      throw new NotFoundError('Meeting');
    }

    const document = await MeetingActionItemModel.findOne({
      _id: assertObjectId(actionItemId, 'action item'),
      meetingId: meeting._id,
    }).session(session);

    if (!document) {
      throw new NotFoundError('Action item');
    }

    if (document.linkedTaskId) {
      const existing = toActionItem(document.toObject() as ActionItemLike);

      return {
        actionItem: existing,
        taskId: document.linkedTaskId.toString(),
        taskUrl: taskUrlFor(document.linkedTaskId.toString()),
        created: false,
      };
    }

    if (input.expectedVersion !== undefined && document.__v !== input.expectedVersion) {
      throw new ConcurrentModificationError();
    }

    const clientId = meeting.clientId.toString();
    const requestedProjectId = input.projectId ?? meeting.projectId?.toString() ?? null;

    if (!requestedProjectId) {
      throw new ValidationError('Select a project for the new task');
    }

    const projectId = await resolveProjectForClient(clientId, requestedProjectId, { session });

    const assignedUserId =
      input.assignedUserId === undefined
        ? (document.assignedUserId?.toString() ?? null)
        : input.assignedUserId;

    await validateTaskAssignee(
      deps.directory,
      clientId,
      assignedUserId,
      document.responsibleJobRoleId.toString(),
    );

    const task = await createTaskRecord(
      {
        projectId: projectId.toString(),
        parentTaskId: null,
        title: document.title,
        description: document.description ?? null,
        assignedUserId,
        assignedJobRoleId: document.responsibleJobRoleId.toString(),
        dueAt: document.dueAt ? document.dueAt.toISOString() : null,
        priority: document.priority,
        approvalRequired: input.approvalRequired,
        approverId: input.approverId ?? null,
        sopUrl: null,
        referenceUrl: null,
        sourceMeetingId: meetingId,
        autoAssign: false,
        confirmCompletedParent: false,
      },
      actorId,
      { directory: deps.directory, session },
    );

    document.linkedTaskId = new mongoose.Types.ObjectId(task.id);
    document.status = 'converted';
    document.projectId = projectId;
    document.updatedBy = new mongoose.Types.ObjectId(assertObjectId(actorId, 'actor'));

    try {
      await document.save({ session });
    } catch (error) {
      if (error instanceof Error && error.name === 'VersionError') {
        throw new ConcurrentModificationError();
      }

      throw error;
    }

    await recordAudit({
      actorId,
      action: 'meeting.action_item.convert',
      entityType: 'meeting_action_item',
      entityId: document._id.toString(),
      previousValue: { status: 'pending', linkedTaskId: null },
      newValue: { status: 'converted', linkedTaskId: task.id, projectId: projectId.toString() },
      notes: null,
      session,
    });

    return {
      actionItem: toActionItem(document.toObject() as ActionItemLike),
      taskId: task.id,
      taskUrl: taskUrlFor(task.id),
      created: true,
    };
  }

  try {
    return await withTransaction(conversionWork, { connection });
  } catch (error) {
    if (error instanceof ConcurrentModificationError) {
      const current = await findMeetingActionItem(meetingId, actionItemId, { connection });

      if (current?.linkedTaskId) {
        return {
          actionItem: current,
          taskId: current.linkedTaskId,
          taskUrl: taskUrlFor(current.linkedTaskId),
          created: false,
        };
      }
    }

    throw error;
  }
}
