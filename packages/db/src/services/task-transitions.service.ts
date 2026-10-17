import type { AuditAction, TaskStatus, TaskSummary } from '@interscale/shared';
import mongoose from 'mongoose';
import type { ClientSession, Connection } from 'mongoose';
import { withTransaction } from '../connection';
import { assertObjectId } from '../lib/object-id';
import { ConcurrentModificationError, NotFoundError, ValidationError } from '../lib/errors';
import { TaskModel, type TaskDocument } from '../models/task';
import { recordAudit } from './audit.service';
import { assertParentCanComplete, recordTaskActivity, toTaskSummary } from './task.service';
import type { EmployeeDirectory } from './employee-directory';
import {
  notifyTaskRevisionRequested,
  suppressTaskOutstandingNotifications,
} from './task-notifications.service';
import { evaluateSuccessors, propagateDowngrade, reevaluateTask } from './workflow.service';

/**
 * Formal task state-transition engine (Step 10).
 *
 * The ONLY way to change a task status. Every operation validates the current
 * state, the actor's relationship to the task, parent completion guards and
 * approval rules, then writes the task change plus audit and activity records
 * atomically (transaction + optimistic concurrency: concurrent approvers
 * cannot produce duplicate transitions).
 *
 * Role checks (assignee vs editor vs approver) are enforced by the API layer;
 * this engine enforces state law, approver identity, self-approval bans and
 * data integrity.
 */

export interface TransitionOptions {
  connection?: Connection;
  session?: ClientSession;
  expectedVersion?: number;
  reason?: string | null;
  note?: string | null;
  /** Employee directory for workflow evaluation (auto-assignment checks). */
  directory?: EmployeeDirectory;
}

async function runAtomic<T>(
  options: TransitionOptions,
  work: (session: ClientSession | undefined) => Promise<T>,
): Promise<T> {
  if (options.session) {
    return work(options.session);
  }

  return withTransaction(
    async (session) => work(session),
    options.connection ? { connection: options.connection } : {},
  );
}

async function loadTask(id: string, session: ClientSession | undefined): Promise<TaskDocument> {
  const document = await TaskModel.findById(assertObjectId(id, 'task')).session(session ?? null);

  if (!document) {
    throw new NotFoundError('Task');
  }

  return document;
}

function checkVersion(document: TaskDocument, expectedVersion: number | undefined): void {
  if (expectedVersion !== undefined && document.__v !== expectedVersion) {
    throw new ConcurrentModificationError();
  }
}

async function saveChecked(
  document: TaskDocument,
  session: ClientSession | undefined,
): Promise<void> {
  try {
    await document.save({ session: session ?? undefined });
  } catch (error) {
    if (error instanceof Error && error.name === 'VersionError') {
      throw new ConcurrentModificationError();
    }

    throw error;
  }
}

interface TransitionResult {
  summary: TaskSummary;
}

async function applyTransition(
  id: string,
  actorId: string,
  action: AuditAction,
  mutate: (document: TaskDocument) => void | Promise<void>,
  newValue: Record<string, unknown>,
  options: TransitionOptions,
  notes: string | null = null,
  afterSave?: (document: TaskDocument, session: ClientSession | undefined) => Promise<void>,
): Promise<TransitionResult> {
  return runAtomic(options, async (session) => {
    const document = await loadTask(id, session);
    checkVersion(document, options.expectedVersion);

    const previous = { status: document.status };
    await mutate(document);

    // The manual block reason only lives on Blocked tasks; any transition
    // away clears it (dependency blocking never sets it).
    if (document.status !== 'blocked') {
      document.manualBlockReason = null;
    }

    await saveChecked(document, session);

    if (afterSave) {
      await afterSave(document, session);
    }

    const taskId = document._id.toString();

    await recordAudit({
      actorId,
      action,
      entityType: 'task',
      entityId: taskId,
      previousValue: previous,
      newValue,
      notes,
      session,
    });

    await recordTaskActivity(taskId, actorId, action, previous, newValue, notes, {
      session,
    });

    const refreshed = await TaskModel.findById(document._id)
      .session(session ?? null)
      .lean();

    if (!refreshed) {
      throw new NotFoundError('Task');
    }

    return { summary: toTaskSummary(refreshed as Parameters<typeof toTaskSummary>[0]) };
  });
}

function requireAssignee(document: TaskDocument, operation: string): void {
  if (document.assignedUserId === null || document.assignedUserId === undefined) {
    throw new ValidationError(`Assign this task before ${operation}`);
  }
}

function requireStatus(document: TaskDocument, allowed: TaskStatus[], operation: string): void {
  if (!allowed.includes(document.status)) {
    throw new ValidationError(`Cannot ${operation} while the task is ${document.status}`);
  }
}

async function requireChildrenComplete(
  document: TaskDocument,
  session: ClientSession | undefined,
): Promise<void> {
  const childCount = await TaskModel.countDocuments({
    parentTaskId: document._id,
    status: { $ne: 'cancelled' },
  }).session(session ?? null);

  if (childCount > 0) {
    await assertParentCanComplete(document._id.toString(), { session });
  }
}

/** Start work: To Do → In Progress. Blocked and terminal tasks cannot start. */
export async function startTask(
  id: string,
  actorId: string,
  options: TransitionOptions = {},
): Promise<TaskSummary> {
  const { summary } = await applyTransition(
    id,
    actorId,
    'task.status.update',
    (document) => {
      requireStatus(document, ['todo'], 'start work');
      requireAssignee(document, 'starting work');
      document.status = 'in_progress';
      document.updatedBy = new mongoose.Types.ObjectId(assertObjectId(actorId, 'actor'));
    },
    { status: 'in_progress' },
    options,
  );

  return summary;
}

/** Submit work for approval: In Progress → Awaiting Approval. */
export async function submitTask(
  id: string,
  actorId: string,
  options: TransitionOptions = {},
): Promise<TaskSummary> {
  const { summary } = await applyTransition(
    id,
    actorId,
    'task.submit',
    (document) => {
      requireStatus(document, ['in_progress'], 'submit work for approval');
      requireAssignee(document, 'submitting work');

      if (!document.approvalRequired) {
        throw new ValidationError('This task does not require approval; complete it directly');
      }

      document.status = 'awaiting_approval';
      document.submittedBy = new mongoose.Types.ObjectId(assertObjectId(actorId, 'actor'));
      document.submittedAt = new Date();
      document.updatedBy = new mongoose.Types.ObjectId(assertObjectId(actorId, 'actor'));
    },
    { status: 'awaiting_approval' },
    options,
    options.note ?? null,
  );

  return summary;
}

/**
 * Approve submitted work: Awaiting Approval → Done.
 *
 * Only the designated approver, never the assignee (no self-approval), with
 * parent completion guards for parents.
 */
export async function approveTask(
  id: string,
  actorId: string,
  options: TransitionOptions = {},
): Promise<TaskSummary> {
  const { summary } = await applyTransition(
    id,
    actorId,
    'task.approve',
    async (document) => {
      requireStatus(document, ['awaiting_approval'], 'approve this task');

      if (!document.approverId || document.approverId.toString() !== actorId) {
        throw new ValidationError('Only the designated approver can approve this task');
      }

      if (document.assignedUserId && document.assignedUserId.toString() === actorId) {
        throw new ValidationError('You cannot approve your own work');
      }

      await requireChildrenComplete(document, options.session);

      const now = new Date();
      document.status = 'done';
      document.approvedBy = new mongoose.Types.ObjectId(assertObjectId(actorId, 'actor'));
      document.approvedAt = now;
      document.completedAt = now;
      document.updatedBy = new mongoose.Types.ObjectId(assertObjectId(actorId, 'actor'));
    },
    { status: 'done' },
    options,
    options.note ?? null,
    async (saved, session) => {
      await evaluateSuccessors(
        saved._id.toString(),
        { actorId, directory: options.directory },
        { session, connection: options.connection },
      );

      // The task is done: no reminder or escalation is actionable any more.
      await suppressTaskOutstandingNotifications(saved._id.toString(), { session });
    },
  );

  return summary;
}

/** Request revision: Awaiting Approval → In Progress (reason mandatory). */
export async function reviseTask(
  id: string,
  actorId: string,
  reason: string,
  options: TransitionOptions = {},
): Promise<TaskSummary> {
  if (!reason || reason.trim().length === 0) {
    throw new ValidationError('A revision reason is required');
  }

  const { summary } = await applyTransition(
    id,
    actorId,
    'task.revise',
    (document) => {
      requireStatus(document, ['awaiting_approval'], 'request revisions');

      if (!document.approverId || document.approverId.toString() !== actorId) {
        throw new ValidationError('Only the designated approver can request revisions');
      }

      document.status = 'in_progress';
      document.submittedBy = null;
      document.submittedAt = null;
      document.revisionCount += 1;
      document.updatedBy = new mongoose.Types.ObjectId(assertObjectId(actorId, 'actor'));
    },
    { status: 'in_progress' },
    options,
    reason.trim(),
    async (saved, session) => {
      if (saved.assignedUserId) {
        await notifyTaskRevisionRequested(
          saved._id.toString(),
          saved.assignedUserId.toString(),
          reason.trim(),
          { session },
        );
      }
    },
  );

  return summary;
}

/**
 * Complete work without approval: In Progress → Done.
 *
 * Forbidden when approval is required (submit instead). Parent completion
 * guards apply.
 */
export async function completeTask(
  id: string,
  actorId: string,
  options: TransitionOptions = {},
): Promise<TaskSummary> {
  const { summary } = await applyTransition(
    id,
    actorId,
    'task.complete',
    async (document) => {
      requireStatus(document, ['in_progress'], 'complete this task');
      requireAssignee(document, 'completing work');

      if (document.approvalRequired) {
        throw new ValidationError('This task requires approval; submit it for approval instead');
      }

      await requireChildrenComplete(document, options.session);

      document.status = 'done';
      document.completedAt = new Date();
      document.updatedBy = new mongoose.Types.ObjectId(assertObjectId(actorId, 'actor'));
    },
    { status: 'done' },
    options,
    options.note ?? null,
    async (saved, session) => {
      await evaluateSuccessors(
        saved._id.toString(),
        { actorId, directory: options.directory },
        { session, connection: options.connection },
      );

      await suppressTaskOutstandingNotifications(saved._id.toString(), { session });
    },
  );

  return summary;
}

/** Cancel work from any actionable state (reason mandatory). */
export async function cancelTask(
  id: string,
  actorId: string,
  reason: string,
  options: TransitionOptions = {},
): Promise<TaskSummary> {
  if (!reason || reason.trim().length === 0) {
    throw new ValidationError('A cancellation reason is required');
  }

  const { summary } = await applyTransition(
    id,
    actorId,
    'task.cancel',
    (document) => {
      requireStatus(
        document,
        ['todo', 'in_progress', 'blocked', 'awaiting_approval'],
        'cancel this task',
      );
      document.status = 'cancelled';
      document.updatedBy = new mongoose.Types.ObjectId(assertObjectId(actorId, 'actor'));
    },
    { status: 'cancelled' },
    options,
    reason.trim(),
    async (saved, session) => {
      // A cancelled prerequisite never satisfies dependents: propagate the
      // impact so nothing unlocks on cancelled work.
      await propagateDowngrade(
        saved._id.toString(),
        `Prerequisite cancelled: ${reason.trim()}`,
        { actorId, directory: options.directory },
        { session, connection: options.connection },
      );

      await suppressTaskOutstandingNotifications(saved._id.toString(), { session });
    },
  );

  return summary;
}

/** Mark work blocked: To Do / In Progress → Blocked (reason mandatory). */
export async function blockTask(
  id: string,
  actorId: string,
  reason: string,
  options: TransitionOptions = {},
): Promise<TaskSummary> {
  if (!reason || reason.trim().length === 0) {
    throw new ValidationError('A reason is required to block a task');
  }

  const { summary } = await applyTransition(
    id,
    actorId,
    'task.block',
    (document) => {
      // A manual hold may layer on top of dependency blocking: the status
      // stays Blocked and only the reason is recorded.
      requireStatus(document, ['todo', 'in_progress', 'blocked'], 'block this task');
      document.status = 'blocked';
      document.manualBlockReason = reason.trim();
      document.updatedBy = new mongoose.Types.ObjectId(assertObjectId(actorId, 'actor'));
    },
    { status: 'blocked' },
    options,
    reason.trim(),
  );

  return summary;
}

/** Unblock work: Blocked → To Do (reason mandatory). */
export async function unblockTask(
  id: string,
  actorId: string,
  reason: string,
  options: TransitionOptions = {},
): Promise<TaskSummary> {
  if (!reason || reason.trim().length === 0) {
    throw new ValidationError('A reason is required to unblock a task');
  }

  const { summary } = await applyTransition(
    id,
    actorId,
    'task.unblock',
    (document) => {
      requireStatus(document, ['blocked'], 'unblock this task');
      document.status = 'todo';
      document.updatedBy = new mongoose.Types.ObjectId(assertObjectId(actorId, 'actor'));
    },
    { status: 'todo' },
    options,
    reason.trim(),
    async (saved, session) => {
      // Unblocking never bypasses dependencies: reevaluate immediately so a
      // task with unfinished prerequisites stays dependency-blocked.
      await reevaluateTask(
        saved._id.toString(),
        { actorId, directory: options.directory },
        { session, connection: options.connection },
      );
    },
  );

  return summary;
}

/**
 * Reopen completed or cancelled work: Done/Cancelled → In Progress.
 *
 * Resets completion state (previous approvals stay in history). Authorization
 * (Manager/Admin) is enforced by the API layer.
 */
export async function reopenTask(
  id: string,
  actorId: string,
  reason: string,
  options: TransitionOptions = {},
): Promise<TaskSummary> {
  if (!reason || reason.trim().length === 0) {
    throw new ValidationError('A reason is required to reopen a task');
  }

  const { summary } = await applyTransition(
    id,
    actorId,
    'task.reopen',
    (document) => {
      requireStatus(document, ['done', 'cancelled'], 'reopen this task');
      document.status = 'in_progress';
      document.submittedBy = null;
      document.submittedAt = null;
      document.approvedBy = null;
      document.approvedAt = null;
      document.completedAt = null;
      document.updatedBy = new mongoose.Types.ObjectId(assertObjectId(actorId, 'actor'));
    },
    { status: 'in_progress' },
    options,
    reason.trim(),
    async (saved, session) => {
      // Reopening a prerequisite invalidates downstream readiness: detect
      // impacted successors without touching their state or history.
      await propagateDowngrade(
        saved._id.toString(),
        `Prerequisite reopened: ${reason.trim()}`,
        { actorId, directory: options.directory },
        { session, connection: options.connection },
      );
    },
  );

  return summary;
}
