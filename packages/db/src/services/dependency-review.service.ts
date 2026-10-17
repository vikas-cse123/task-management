import type { DependencyReview } from '@interscale/shared';
import mongoose from 'mongoose';
import type { ClientSession, Connection } from 'mongoose';
import { getConnection } from '../connection';
import { assertObjectId } from '../lib/object-id';
import { NotFoundError, ValidationError } from '../lib/errors';
import { DependencyReviewModel } from '../models/dependency-review';
import { TaskModel } from '../models/task';
import { recordAudit } from './audit.service';

/**
 * Downstream impact review flags (Step 16).
 *
 * When upstream work changes under in-flight or completed successors, the
 * successor is flagged "Dependency Review Required" instead of being
 * silently rewritten. Resolution records an explicit Manager/Admin decision;
 * it never bypasses dependency or approval guards (those still apply).
 */

export interface DependencyReviewOptions {
  connection?: Connection;
  session?: ClientSession;
}

function toView(doc: {
  _id: mongoose.Types.ObjectId;
  taskId: mongoose.Types.ObjectId;
  upstreamTaskId: mongoose.Types.ObjectId;
  reason: string;
  status: 'open' | 'resolved';
  resolvedBy?: mongoose.Types.ObjectId | null;
  resolvedAt?: Date | null;
  resolutionNote?: string | null;
  createdAt: Date;
  updatedAt: Date;
}): DependencyReview {
  return {
    id: doc._id.toString(),
    taskId: doc.taskId.toString(),
    upstreamTaskId: doc.upstreamTaskId.toString(),
    reason: doc.reason,
    status: doc.status,
    resolvedBy: doc.resolvedBy ? doc.resolvedBy.toString() : null,
    resolvedAt: doc.resolvedAt instanceof Date ? doc.resolvedAt.toISOString() : null,
    resolutionNote: typeof doc.resolutionNote === 'string' ? doc.resolutionNote : null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

/**
 * Flag a successor for review (idempotent per open task/upstream pair).
 *
 * Returns the open review (existing or newly created). Never touches task
 * statuses — callers decide blocking separately.
 */
export async function flagDependencyReview(
  taskId: string,
  upstreamTaskId: string,
  reason: string,
  actorId: string | null,
  options: DependencyReviewOptions = {},
): Promise<DependencyReview> {
  void (options.connection ?? getConnection());

  const taskObjectId = new mongoose.Types.ObjectId(assertObjectId(taskId, 'task'));
  const upstreamObjectId = new mongoose.Types.ObjectId(
    assertObjectId(upstreamTaskId, 'upstream task'),
  );

  const existing = await DependencyReviewModel.findOne({
    taskId: taskObjectId,
    upstreamTaskId: upstreamObjectId,
    status: 'open',
  }).session(options.session ?? null);

  if (existing) {
    return toView({
      _id: existing._id,
      taskId: existing.taskId,
      upstreamTaskId: existing.upstreamTaskId,
      reason: existing.reason,
      status: existing.status,
      resolvedBy: existing.resolvedBy,
      resolvedAt: existing.resolvedAt,
      resolutionNote: existing.resolutionNote,
      createdAt: existing.createdAt,
      updatedAt: existing.updatedAt,
    });
  }

  try {
    const [created] = await DependencyReviewModel.create(
      [
        {
          taskId: taskObjectId,
          upstreamTaskId: upstreamObjectId,
          reason: reason.trim(),
          status: 'open',
        },
      ],
      options.session ? { session: options.session } : {},
    );

    if (!created) {
      throw new ValidationError('Failed to record dependency review');
    }

    await recordAudit({
      actorId,
      action: 'dependency.review.create',
      entityType: 'dependency_review',
      entityId: created._id.toString(),
      previousValue: null,
      newValue: { taskId, upstreamTaskId, reason: reason.trim() },
      notes: null,
      session: options.session,
    });

    return toView({
      _id: created._id,
      taskId: created.taskId,
      upstreamTaskId: created.upstreamTaskId,
      reason: created.reason,
      status: created.status,
      resolvedBy: created.resolvedBy,
      resolvedAt: created.resolvedAt,
      resolutionNote: created.resolutionNote,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    });
  } catch (error) {
    // A concurrent flag won the partial unique index: return the winner.
    if (
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: unknown }).code === 11000
    ) {
      const winner = await DependencyReviewModel.findOne({
        taskId: taskObjectId,
        upstreamTaskId: upstreamObjectId,
        status: 'open',
      }).session(options.session ?? null);

      if (winner) {
        return toView({
          _id: winner._id,
          taskId: winner.taskId,
          upstreamTaskId: winner.upstreamTaskId,
          reason: winner.reason,
          status: winner.status,
          resolvedBy: winner.resolvedBy,
          resolvedAt: winner.resolvedAt,
          resolutionNote: winner.resolutionNote,
          createdAt: winner.createdAt,
          updatedAt: winner.updatedAt,
        });
      }
    }

    throw error;
  }
}

/** List every review flag on a task (open first, then newest). */ export async function listDependencyReviews(
  taskId: string,
  options: DependencyReviewOptions = {},
): Promise<DependencyReview[]> {
  void (options.connection ?? getConnection());

  const objectId = new mongoose.Types.ObjectId(assertObjectId(taskId, 'task'));

  const documents = await DependencyReviewModel.find({ taskId: objectId })
    .sort({ status: 1, updatedAt: -1 })
    .session(options.session ?? null)
    .lean();

  return documents.map((doc) =>
    toView({
      _id: doc._id,
      taskId: doc.taskId,
      upstreamTaskId: doc.upstreamTaskId,
      reason: doc.reason,
      status: doc.status,
      resolvedBy: doc.resolvedBy,
      resolvedAt: doc.resolvedAt,
      resolutionNote: doc.resolutionNote,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    }),
  );
}

/**
 * Resolve a review flag with an explicit decision (Manager/Admin; enforced
 * by callers). Closing the flag never changes task status or satisfies
 * prerequisites — guards still apply everywhere.
 */
export async function resolveDependencyReview(
  reviewId: string,
  actorId: string,
  note: string,
  options: DependencyReviewOptions = {},
): Promise<DependencyReview> {
  void (options.connection ?? getConnection());

  if (!note || note.trim().length === 0) {
    throw new ValidationError('A resolution note is required');
  }

  const document = await DependencyReviewModel.findById(assertObjectId(reviewId, 'review')).session(
    options.session ?? null,
  );

  if (!document) {
    throw new NotFoundError('Dependency review');
  }

  if (document.status === 'resolved') {
    throw new ValidationError('This review is already resolved');
  }

  document.status = 'resolved';
  document.resolvedBy = new mongoose.Types.ObjectId(assertObjectId(actorId, 'actor'));
  document.resolvedAt = new Date();
  document.resolutionNote = note.trim();
  await document.save({ session: options.session ?? undefined });

  await recordAudit({
    actorId,
    action: 'dependency.review.resolve',
    entityType: 'dependency_review',
    entityId: document._id.toString(),
    previousValue: { status: 'open' },
    newValue: { status: 'resolved', resolutionNote: note.trim() },
    notes: null,
    session: options.session,
  });

  return toView({
    _id: document._id,
    taskId: document.taskId,
    upstreamTaskId: document.upstreamTaskId,
    reason: document.reason,
    status: document.status,
    resolvedBy: document.resolvedBy,
    resolvedAt: document.resolvedAt,
    resolutionNote: document.resolutionNote,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  });
}

/**
 * Open review flags across one project (powers project counts/screens).
 *
 * Callers enforce project scope before reading.
 */
export async function listProjectReviews(
  projectId: string,
  options: DependencyReviewOptions = {},
): Promise<DependencyReview[]> {
  void (options.connection ?? getConnection());

  const taskIds = (await TaskModel.distinct('_id', {
    projectId: new mongoose.Types.ObjectId(assertObjectId(projectId, 'project')),
  })) as mongoose.Types.ObjectId[];

  if (taskIds.length === 0) {
    return [];
  }

  const documents = await DependencyReviewModel.find({
    taskId: { $in: taskIds },
    status: 'open',
  })
    .sort({ updatedAt: -1 })
    .limit(100)
    .session(options.session ?? null)
    .lean();

  return documents.map((doc) =>
    toView({
      _id: doc._id,
      taskId: doc.taskId,
      upstreamTaskId: doc.upstreamTaskId,
      reason: doc.reason,
      status: doc.status,
      resolvedBy: doc.resolvedBy,
      resolvedAt: doc.resolvedAt,
      resolutionNote: doc.resolutionNote,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    }),
  );
}
