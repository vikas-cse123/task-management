import type {
  DependencyEvaluation,
  DependencyLink,
  TaskBlockers,
  TaskDependency as TaskDependencyView,
} from '@interscale/shared';
import mongoose from 'mongoose';
import type { ClientSession, Connection } from 'mongoose';
import { getConnection, withTransaction } from '../connection';
import { assertObjectId } from '../lib/object-id';
import { ConflictError, NotFoundError, ValidationError } from '../lib/errors';
import { DependencyReviewModel } from '../models/dependency-review';
import { ProjectModel } from '../models/project';
import { TaskDependencyModel } from '../models/task-dependency';
import { TaskModel } from '../models/task';
import { recordAudit } from './audit.service';
import { flagDependencyReview } from './dependency-review.service';
import { recordTaskActivity } from './task.service';

/**
 * Task dependency graph (Step 13).
 *
 * Edges are structural only: readiness is always derived from live task
 * statuses, never stored. All validation (same project, self/duplicate/
 * cycle/parent-child rules) runs server-side inside the mutation
 * transaction. Concurrent graph edits serialize through the project's
 * `dependencyVersion` optimistic-concurrency counter: simultaneous
 * conflicting writes resolve to exactly one winner (the loser retries once,
 * then surfaces 409 or a validation error).
 */

export interface DependencyServiceOptions {
  connection?: Connection;
  session?: ClientSession;
}

export interface DependencyServiceDeps extends DependencyServiceOptions {
  actorId?: string | null;
}

function resolveConnection(options: DependencyServiceOptions): Connection {
  return options.connection ?? getConnection();
}

function toView(doc: {
  _id: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  predecessorTaskId: mongoose.Types.ObjectId;
  successorTaskId: mongoose.Types.ObjectId;
  createdBy?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}): TaskDependencyView {
  return {
    id: doc._id.toString(),
    projectId: doc.projectId.toString(),
    predecessorTaskId: doc.predecessorTaskId.toString(),
    successorTaskId: doc.successorTaskId.toString(),
    createdBy: doc.createdBy ? doc.createdBy.toString() : null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

interface TaskRef {
  _id: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  parentTaskId?: mongoose.Types.ObjectId | null;
  title: string;
  status: string;
  assignedUserId?: mongoose.Types.ObjectId | null;
}

async function loadTaskRef(
  id: string,
  label: string,
  session: ClientSession | undefined,
): Promise<TaskRef> {
  const doc = (await TaskModel.findById(assertObjectId(id, label))
    .session(session ?? null)
    .select({ projectId: 1, parentTaskId: 1, title: 1, status: 1, assignedUserId: 1 })
    .lean()) as TaskRef | null;

  if (!doc) {
    throw new NotFoundError(label === 'predecessor' ? 'Prerequisite task' : 'Task');
  }

  return doc;
}

/**
 * Whether adding predecessor → successor would close a dependency cycle.
 *
 * A cycle exists when the predecessor already transitively depends on the
 * successor (depth-first search over the project's prerequisite adjacency).
 */
export async function wouldCreateCycle(
  projectId: string,
  predecessorId: string,
  successorId: string,
  options: DependencyServiceOptions = {},
): Promise<boolean> {
  void resolveConnection(options);

  const edges = await TaskDependencyModel.find({
    projectId: new mongoose.Types.ObjectId(assertObjectId(projectId, 'project')),
  })
    .select({ predecessorTaskId: 1, successorTaskId: 1 })
    .session(options.session ?? null)
    .lean();

  const prerequisites = new Map<string, string[]>();

  for (const edge of edges) {
    const key = edge.successorTaskId.toString();
    const list = prerequisites.get(key) ?? [];
    list.push(edge.predecessorTaskId.toString());
    prerequisites.set(key, list);
  }

  const visited = new Set<string>();
  const stack = [predecessorId];

  while (stack.length > 0) {
    const current = stack.pop() as string;

    if (current === successorId) {
      return true;
    }

    if (visited.has(current)) {
      continue;
    }

    visited.add(current);

    for (const next of prerequisites.get(current) ?? []) {
      if (!visited.has(next)) {
        stack.push(next);
      }
    }
  }

  return false;
}

/** Prerequisite satisfaction: every prerequisite Done (approval counts only then). */
export async function evaluatePrerequisites(
  taskId: string,
  options: DependencyServiceOptions = {},
): Promise<DependencyEvaluation> {
  void resolveConnection(options);

  const objectId = new mongoose.Types.ObjectId(assertObjectId(taskId, 'task'));

  const edges = await TaskDependencyModel.find({ successorTaskId: objectId })
    .session(options.session ?? null)
    .lean();

  if (edges.length === 0) {
    return { satisfied: true, pending: [] };
  }

  const predecessors = await TaskModel.find({
    _id: { $in: edges.map((edge) => edge.predecessorTaskId) },
  })
    .select({ title: 1, status: 1 })
    .session(options.session ?? null)
    .lean();

  const pending = predecessors
    .filter((task) => task.status !== 'done')
    .map((task) => ({ id: task._id.toString(), title: task.title, status: task.status }));

  return { satisfied: pending.length === 0, pending };
}

/** Enriched prerequisite links for one task. */
export async function listPrerequisites(
  taskId: string,
  options: DependencyServiceOptions = {},
): Promise<DependencyLink[]> {
  void resolveConnection(options);

  const objectId = new mongoose.Types.ObjectId(assertObjectId(taskId, 'task'));
  const edges = await TaskDependencyModel.find({ successorTaskId: objectId })
    .session(options.session ?? null)
    .lean();

  if (edges.length === 0) {
    return [];
  }

  const tasks = await TaskModel.find({ _id: { $in: edges.map((e) => e.predecessorTaskId) } })
    .select({ title: 1, status: 1, assignedUserId: 1 })
    .session(options.session ?? null)
    .lean();

  const byId = new Map(tasks.map((task) => [task._id.toString(), task]));

  return edges.map((edge) => {
    const task = byId.get(edge.predecessorTaskId.toString());

    return {
      dependencyId: edge._id.toString(),
      taskId: edge.predecessorTaskId.toString(),
      title: task?.title ?? 'Unknown task',
      status: task?.status ?? 'unknown',
      assignedUserId: task?.assignedUserId ? task.assignedUserId.toString() : null,
    };
  });
}

/** Enriched dependent links for one task. */
export async function listDependents(
  taskId: string,
  options: DependencyServiceOptions = {},
): Promise<DependencyLink[]> {
  void resolveConnection(options);

  const objectId = new mongoose.Types.ObjectId(assertObjectId(taskId, 'task'));
  const edges = await TaskDependencyModel.find({ predecessorTaskId: objectId })
    .session(options.session ?? null)
    .lean();

  if (edges.length === 0) {
    return [];
  }

  const tasks = await TaskModel.find({ _id: { $in: edges.map((e) => e.successorTaskId) } })
    .select({ title: 1, status: 1, assignedUserId: 1 })
    .session(options.session ?? null)
    .lean();

  const byId = new Map(tasks.map((task) => [task._id.toString(), task]));

  return edges.map((edge) => {
    const task = byId.get(edge.successorTaskId.toString());

    return {
      dependencyId: edge._id.toString(),
      taskId: edge.successorTaskId.toString(),
      title: task?.title ?? 'Unknown task',
      status: task?.status ?? 'unknown',
      assignedUserId: task?.assignedUserId ? task.assignedUserId.toString() : null,
    };
  });
}

/**
 * Derived blocker model for one task (no seventh status).
 *
 * Combines the manual block reason, unsatisfied prerequisites, assignment
 * state and open dependency reviews into one user-friendly payload.
 */
export async function getBlockers(
  taskId: string,
  options: DependencyServiceOptions = {},
): Promise<TaskBlockers> {
  void resolveConnection(options);

  const objectId = new mongoose.Types.ObjectId(assertObjectId(taskId, 'task'));
  const document = await TaskModel.findById(objectId)
    .select({ status: 1, manualBlockReason: 1, assignedUserId: 1 })
    .session(options.session ?? null)
    .lean();

  if (!document) {
    throw new NotFoundError('Task');
  }

  const evaluation = await evaluatePrerequisites(taskId, options);
  const openReviews = await DependencyReviewModel.countDocuments({
    taskId: objectId,
    status: 'open',
  }).session(options.session ?? null);

  const needsAssignment =
    (document.assignedUserId === null || document.assignedUserId === undefined) &&
    document.status !== 'done' &&
    document.status !== 'cancelled';

  return {
    isBlocked:
      document.status === 'blocked' ||
      evaluation.pending.length > 0 ||
      needsAssignment ||
      openReviews > 0,
    manualReason:
      typeof document.manualBlockReason === 'string' ? document.manualBlockReason : null,
    waitingOn: evaluation.pending,
    needsAssignment,
    reviewOpen: openReviews > 0,
  };
}

function isRetryableGraphError(error: unknown): boolean {
  if (error instanceof Error && error.name === 'VersionError') {
    return true;
  }

  if (typeof error === 'object' && error !== null) {
    const record = error as { code?: unknown; errorLabels?: unknown };
    if (record.code === 112) {
      return true;
    }

    if (
      Array.isArray(record.errorLabels) &&
      record.errorLabels.includes('TransientTransactionError')
    ) {
      return true;
    }
  }

  return false;
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 11000
  );
}

export interface AddDependencyInput {
  predecessorId: string;
  successorId: string;
  actorId: string;
  confirmCompletedDependent?: boolean;
}

/**
 * Add a dependency edge (Admin / in-scope Manager; enforced by callers).
 *
 * Validates same-project, self, duplicate (unique index), cycles and the
 * child→parent deadlock, then applies dependency blocking to a To Do
 * successor — all inside one transaction with a project graph-version bump
 * so concurrent edits serialize (one retry on version conflict).
 */
export async function addDependency(
  input: AddDependencyInput,
  options: DependencyServiceOptions = {},
): Promise<TaskDependencyView> {
  const connection = resolveConnection(options);
  const predecessorId = assertObjectId(input.predecessorId, 'prerequisite');
  const successorId = assertObjectId(input.successorId, 'task');
  const actorId = assertObjectId(input.actorId, 'actor');

  if (predecessorId === successorId) {
    throw new ValidationError('A task cannot depend on itself');
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await withTransaction(
        async (session) => {
          const predecessor = await loadTaskRef(predecessorId, 'predecessor', session);
          const successor = await loadTaskRef(successorId, 'successor', session);

          if (predecessor.projectId.toString() !== successor.projectId.toString()) {
            throw new ValidationError('Dependencies must stay inside the same project');
          }

          if (
            (successor.status === 'done' || successor.status === 'cancelled') &&
            input.confirmCompletedDependent !== true
          ) {
            throw new ValidationError(
              'This work is already completed. Confirm explicitly to add a prerequisite.',
            );
          }

          // Child→parent edges deadlock against the parent-completion rule
          // (the child would wait on the parent while the parent waits on the
          // child), so they are rejected outright. Parent→child edges merely
          // restate the completion rule and are allowed.
          if (successor.parentTaskId && successor.parentTaskId.toString() === predecessorId) {
            throw new ValidationError(
              'A subtask cannot wait on its own parent: neither could ever complete',
            );
          }

          const projectId = successor.projectId.toString();

          if (await wouldCreateCycle(projectId, predecessorId, successorId, { session })) {
            throw new ValidationError('This dependency would create a circular workflow');
          }

          const [edge] = await TaskDependencyModel.create(
            [
              {
                projectId: new mongoose.Types.ObjectId(projectId),
                predecessorTaskId: new mongoose.Types.ObjectId(predecessorId),
                successorTaskId: new mongoose.Types.ObjectId(successorId),
                createdBy: new mongoose.Types.ObjectId(actorId),
              },
            ],
            { session },
          );

          if (!edge) {
            throw new ValidationError('Failed to create dependency');
          }

          const project = await ProjectModel.findById(projectId).session(session);

          if (!project) {
            throw new NotFoundError('Project');
          }

          project.dependencyVersion += 1;
          await project.save({ session });

          // Immediate dependency blocking for actionable successors.
          // In-flight or completed successors keep their state and gain a
          // review flag instead (Step 16).
          if (successor.status === 'todo') {
            const evaluation = await evaluatePrerequisites(successorId, { session });

            if (!evaluation.satisfied) {
              await TaskModel.findByIdAndUpdate(
                successorId,
                { $set: { status: 'blocked' } },
                { session },
              );

              await recordTaskActivity(
                successorId,
                actorId,
                'task.status.update',
                { status: 'todo' },
                { status: 'blocked' },
                'Blocked by unsatisfied prerequisites',
                { session },
              );
            }
          } else if (
            successor.status === 'in_progress' ||
            successor.status === 'awaiting_approval' ||
            successor.status === 'done'
          ) {
            await flagDependencyReview(
              successorId,
              predecessorId,
              `A new prerequisite was added while this work was ${successor.status}`,
              actorId,
              { session },
            );
          }

          await recordAudit({
            actorId,
            action: 'task.dependency.add',
            entityType: 'task_dependency',
            entityId: edge._id.toString(),
            previousValue: null,
            newValue: { predecessorTaskId: predecessorId, successorTaskId: successorId },
            notes: null,
            session,
          });

          return {
            id: edge._id.toString(),
            projectId,
            predecessorTaskId: predecessorId,
            successorTaskId: successorId,
            createdBy: actorId,
            createdAt: edge.createdAt.toISOString(),
            updatedAt: edge.updatedAt.toISOString(),
          };
        },
        { connection },
      );
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ConflictError('This dependency already exists');
      }

      if (isRetryableGraphError(error) && attempt === 0) {
        continue;
      }

      throw error;
    }
  }

  throw new ConflictError('The dependency graph changed concurrently. Reload and try again.');
}

export interface RemoveDependencyInput {
  dependencyId: string;
  actorId: string;
  reason: string;
}

/**
 * Remove a dependency edge.
 *
 * The edge is deleted, the graph version bumps, and the change is audited.
 * Readiness reevaluation (unlocking) is orchestrated by the caller through
 * the workflow service (Step 14) so removal can participate in the full
 * assign-and-notify flow.
 */
export async function removeDependency(
  input: RemoveDependencyInput,
  options: DependencyServiceOptions = {},
): Promise<{ successorId: string }> {
  const connection = resolveConnection(options);
  const dependencyId = assertObjectId(input.dependencyId, 'dependency');
  const actorId = assertObjectId(input.actorId, 'actor');

  if (!input.reason || input.reason.trim().length === 0) {
    throw new ValidationError('A reason is required to remove a dependency');
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await withTransaction(
        async (session) => {
          const edge = await TaskDependencyModel.findById(dependencyId).session(session);

          if (!edge) {
            throw new NotFoundError('Dependency');
          }

          const successorId = edge.successorTaskId.toString();

          await edge.deleteOne({ session });

          const project = await ProjectModel.findById(edge.projectId).session(session);

          if (project) {
            project.dependencyVersion += 1;
            await project.save({ session });
          }

          await recordAudit({
            actorId,
            action: 'task.dependency.remove',
            entityType: 'task_dependency',
            entityId: dependencyId,
            previousValue: {
              predecessorTaskId: edge.predecessorTaskId.toString(),
              successorTaskId: successorId,
            },
            newValue: null,
            notes: input.reason.trim(),
            session,
          });

          return { successorId };
        },
        { connection },
      );
    } catch (error) {
      if (isRetryableGraphError(error) && attempt === 0) {
        continue;
      }

      throw error;
    }
  }

  throw new ConflictError('The dependency graph changed concurrently. Reload and try again.');
}

/** Find one edge, or `null`. */
export async function findDependency(
  id: string,
  options: DependencyServiceOptions = {},
): Promise<TaskDependencyView | null> {
  void resolveConnection(options);

  let objectId: mongoose.Types.ObjectId;

  try {
    objectId = new mongoose.Types.ObjectId(assertObjectId(id, 'dependency'));
  } catch {
    return null;
  }

  const doc = await TaskDependencyModel.findById(objectId)
    .session(options.session ?? null)
    .lean();

  if (!doc) {
    return null;
  }

  return toView({
    _id: doc._id,
    projectId: doc.projectId,
    predecessorTaskId: doc.predecessorTaskId,
    successorTaskId: doc.successorTaskId,
    createdBy: doc.createdBy,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  });
}
