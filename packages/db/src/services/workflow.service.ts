import mongoose from 'mongoose';
import type { ClientSession, Connection } from 'mongoose';
import { getConnection } from '../connection';
import { assertObjectId } from '../lib/object-id';
import { NotFoundError } from '../lib/errors';
import { ProjectModel } from '../models/project';
import { TaskDependencyModel } from '../models/task-dependency';
import { TaskModel } from '../models/task';
import { WorkflowEventModel } from '../models/workflow-event';
import { recordAudit } from './audit.service';
import { applyAutoAssignment, resolveTaskAssignee } from './assignment.service';
import { evaluatePrerequisites } from './dependency.service';
import { flagDependencyReview } from './dependency-review.service';
import type { EmployeeDirectory } from './employee-directory';
import { recordTaskActivity } from './task.service';
import { notifyTaskReady } from './task-notifications.service';

/**
 * Automatic workflow progression (Step 14).
 *
 * When a prerequisite reaches Done, every dependent is reevaluated: eligible
 * successors (all active prerequisites Done, no manual block) transition
 * Blocked → To Do with auto-assignment when opted in, and a durable,
 * deduplicated `task.ready` event is recorded for Phase 5. Manual blocks are
 * never overridden; unassigned tasks surface Needs Assignment instead of a
 * silent skip.
 *
 * All writes accept the caller's transaction session so completion and
 * reevaluation stay atomic (transitions engine passes its session through).
 */

export interface WorkflowOptions {
  connection?: Connection;
  session?: ClientSession;
  directory?: EmployeeDirectory;
}

export interface WorkflowContext {
  /** Human actor whose action triggered the evaluation (audited). */
  actorId: string;
  /**
   * Employee directory for auto-assignment checks. When absent, readiness
   * still transitions Blocked → To Do but no automatic assignment is
   * attempted (the API layer always supplies it).
   */
  directory?: EmployeeDirectory;
}

export type ReevaluationAction =
  'unlocked' | 'assigned_unlocked' | 'blocked' | 'assigned' | 'manual_block_kept' | 'none';

export interface ReevaluationOutcome {
  readonly taskId: string;
  readonly action: ReevaluationAction;
  readonly eventId: string | null;
}

function optionsFor(options: WorkflowOptions): Connection {
  return options.connection ?? getConnection();
}

/**
 * Record a readiness event exactly once per task version.
 *
 * The unique `{ taskId, version, type }` index makes duplicate emission
 * impossible, including retries and concurrent approvals racing on the same
 * transition: losers read back the winner's event.
 */
export async function recordReadyEvent(
  taskId: string,
  projectId: string,
  clientId: string,
  assignedUserId: string | null,
  version: number,
  actorId: string | null,
  options: WorkflowOptions = {},
): Promise<string> {
  void optionsFor(options);

  try {
    const [event] = await WorkflowEventModel.create(
      [
        {
          taskId: new mongoose.Types.ObjectId(assertObjectId(taskId, 'task')),
          projectId: new mongoose.Types.ObjectId(assertObjectId(projectId, 'project')),
          clientId: new mongoose.Types.ObjectId(assertObjectId(clientId, 'client')),
          assignedUserId: assignedUserId
            ? new mongoose.Types.ObjectId(assertObjectId(assignedUserId, 'employee'))
            : null,
          version,
          type: 'task.ready',
          actorId: actorId ? new mongoose.Types.ObjectId(assertObjectId(actorId, 'actor')) : null,
        },
      ],
      options.session ? { session: options.session } : {},
    );

    if (!event) {
      throw new NotFoundError('Workflow event');
    }

    return event._id.toString();
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: unknown }).code === 11000
    ) {
      const existing = await WorkflowEventModel.findOne({
        taskId: new mongoose.Types.ObjectId(assertObjectId(taskId, 'task')),
        version,
        type: 'task.ready',
      })
        .session(options.session ?? null)
        .lean();

      if (existing) {
        return existing._id.toString();
      }
    }

    throw error;
  }
}

/**
 * Reevaluate one task's readiness.
 *
 * - Terminal tasks: nothing to do.
 * - Unsatisfied prerequisites + To Do status: dependency-block it.
 * - Satisfied + Blocked + no manual block: auto-assign when opted in, then
 *   transition to To Do with a readiness event (both audited).
 * - Satisfied + manual block: assignment may proceed, the block stands.
 */
export async function reevaluateTask(
  taskId: string,
  context: WorkflowContext,
  options: WorkflowOptions = {},
): Promise<ReevaluationOutcome> {
  const connection = optionsFor(options);
  void connection;

  const objectId = new mongoose.Types.ObjectId(assertObjectId(taskId, 'task'));
  let document = await TaskModel.findById(objectId).session(options.session ?? null);

  if (!document) {
    throw new NotFoundError('Task');
  }

  if (document.status === 'done' || document.status === 'cancelled') {
    return { taskId, action: 'none', eventId: null };
  }

  const evaluation = await evaluatePrerequisites(taskId, { session: options.session });

  if (!evaluation.satisfied) {
    if (document.status === 'todo') {
      document.status = 'blocked';
      await document.save({ session: options.session ?? undefined });

      await recordAudit({
        actorId: context.actorId,
        action: 'task.status.update',
        entityType: 'task',
        entityId: taskId,
        previousValue: { status: 'todo' },
        newValue: { status: 'blocked' },
        notes: 'Blocked by unsatisfied prerequisites',
        session: options.session,
      });
      await recordTaskActivity(
        taskId,
        context.actorId,
        'task.status.update',
        { status: 'todo' },
        { status: 'blocked' },
        'Blocked by unsatisfied prerequisites',
        { session: options.session },
      );

      return { taskId, action: 'blocked', eventId: null };
    }

    return { taskId, action: 'none', eventId: null };
  }

  let assigned = false;

  if (
    (document.assignedUserId === null || document.assignedUserId === undefined) &&
    document.assignedJobRoleId &&
    document.autoAssign === true &&
    context.directory
  ) {
    const resolution = await resolveTaskAssignee(
      {
        clientId: (await resolveClientId(document.projectId.toString())).toString(),
        jobRoleId: document.assignedJobRoleId.toString(),
        existingAssigneeId: null,
        directory: context.directory,
      },
      { session: options.session },
    );

    if (resolution.action === 'assign') {
      await applyAutoAssignment(
        {
          taskId,
          employeeId: resolution.employeeId,
          jobRoleId: document.assignedJobRoleId.toString(),
          actorId: context.actorId,
          directory: context.directory,
        },
        { session: options.session },
      );
      assigned = true;

      // The assignment saved a newer version; reload before transitioning.
      const fresh = await TaskModel.findById(objectId).session(options.session ?? null);

      if (!fresh) {
        throw new NotFoundError('Task');
      }

      document = fresh;
    }
  }

  if (document.status === 'blocked' && !document.manualBlockReason) {
    document.status = 'todo';
    await document.save({ session: options.session ?? undefined });

    const refreshed = await TaskModel.findById(objectId)
      .session(options.session ?? null)
      .lean();

    const version = typeof refreshed?.__v === 'number' ? refreshed.__v : 0;
    const project = await ProjectModel.findById(document.projectId)
      .select({ clientId: 1 })
      .session(options.session ?? null)
      .lean();

    if (!project) {
      throw new NotFoundError('Project');
    }

    const eventId = await recordReadyEvent(
      taskId,
      document.projectId.toString(),
      project.clientId.toString(),
      document.assignedUserId ? document.assignedUserId.toString() : null,
      version,
      context.actorId,
      { session: options.session },
    );

    await recordAudit({
      actorId: context.actorId,
      action: 'task.status.update',
      entityType: 'task',
      entityId: taskId,
      previousValue: { status: 'blocked' },
      newValue: { status: 'todo' },
      notes: 'Prerequisites satisfied; work is ready',
      session: options.session,
    });
    await recordTaskActivity(
      taskId,
      context.actorId,
      'task.status.update',
      { status: 'blocked' },
      { status: 'todo' },
      'Prerequisites satisfied; work is ready',
      { session: options.session },
    );
    await recordAudit({
      actorId: context.actorId,
      action: 'task.ready',
      entityType: 'workflow_event',
      entityId: eventId,
      previousValue: null,
      newValue: { taskId, version },
      notes: null,
      session: options.session,
    });

    if (document.assignedUserId) {
      await notifyTaskReady(taskId, document.assignedUserId.toString(), {
        session: options.session,
      });
    }

    return { taskId, action: assigned ? 'assigned_unlocked' : 'unlocked', eventId };
  }

  if (document.status === 'blocked' && document.manualBlockReason) {
    return { taskId, action: assigned ? 'assigned' : 'manual_block_kept', eventId: null };
  }

  return { taskId, action: assigned ? 'assigned' : 'none', eventId: null };
}

async function resolveClientId(projectId: string): Promise<string> {
  const project = await ProjectModel.findById(assertObjectId(projectId, 'project'))
    .select({ clientId: 1 })
    .lean();

  if (!project) {
    throw new NotFoundError('Project');
  }

  return project.clientId.toString();
}

/**
 * Reevaluate every dependent of a freshly completed prerequisite.
 *
 * Called inside the completing transaction (approve/complete pass their
 * session), so Done + unlocks + assignments + events commit atomically —
 * never a Done prerequisite with a permanently stale dependent.
 */
export async function evaluateSuccessors(
  predecessorId: string,
  context: WorkflowContext,
  options: WorkflowOptions = {},
): Promise<ReevaluationOutcome[]> {
  void optionsFor(options);

  const edges = await TaskDependencyModel.find({
    predecessorTaskId: new mongoose.Types.ObjectId(assertObjectId(predecessorId, 'task')),
  })
    .select({ successorTaskId: 1 })
    .session(options.session ?? null)
    .lean();

  const outcomes: ReevaluationOutcome[] = [];

  for (const edge of edges) {
    outcomes.push(await reevaluateTask(edge.successorTaskId.toString(), context, options));
  }

  return outcomes;
}

export interface DowngradeImpact {
  readonly taskId: string;
  readonly previousStatus: string;
  readonly action: 'blocked' | 'flagged' | 'skipped';
}

/**
 * Propagate a prerequisite downgrade (reopen/cancel) to downstream work.
 *
 * - To Do successors have not started: transition them to Blocked and flag
 *   them, so no new work begins on a broken prerequisite.
 * - In Progress / Awaiting Approval / Done successors keep their state and
 *   history untouched, but gain a "Dependency Review Required" flag.
 * - Cancelled successors are skipped.
 *
 * Runs inside the caller's transaction; review creation is idempotent per
 * open pair, so concurrent downgrades cannot double-flag.
 */
export async function propagateDowngrade(
  upstreamId: string,
  reason: string,
  context: WorkflowContext,
  options: WorkflowOptions = {},
): Promise<DowngradeImpact[]> {
  void optionsFor(options);

  const edges = await TaskDependencyModel.find({
    predecessorTaskId: new mongoose.Types.ObjectId(assertObjectId(upstreamId, 'upstream task')),
  })
    .select({ successorTaskId: 1 })
    .session(options.session ?? null)
    .lean();

  const impacts: DowngradeImpact[] = [];

  for (const edge of edges) {
    const successorId = edge.successorTaskId.toString();
    const document = await TaskModel.findById(edge.successorTaskId).session(
      options.session ?? null,
    );

    if (!document || document.status === 'cancelled') {
      impacts.push({ taskId: successorId, previousStatus: 'cancelled', action: 'skipped' });
      continue;
    }

    const previousStatus = document.status;

    if (document.status === 'todo') {
      document.status = 'blocked';
      await document.save({ session: options.session ?? undefined });

      await recordAudit({
        actorId: context.actorId,
        action: 'task.status.update',
        entityType: 'task',
        entityId: successorId,
        previousValue: { status: previousStatus },
        newValue: { status: 'blocked' },
        notes: reason,
        session: options.session,
      });
      await recordTaskActivity(
        successorId,
        context.actorId,
        'task.status.update',
        { status: previousStatus },
        { status: 'blocked' },
        reason,
        { session: options.session },
      );
      await flagDependencyReview(successorId, upstreamId, reason, context.actorId, {
        session: options.session,
      });

      impacts.push({ taskId: successorId, previousStatus, action: 'blocked' });
      continue;
    }

    await flagDependencyReview(successorId, upstreamId, reason, context.actorId, {
      session: options.session,
    });

    impacts.push({ taskId: successorId, previousStatus, action: 'flagged' });
  }

  return impacts;
}
