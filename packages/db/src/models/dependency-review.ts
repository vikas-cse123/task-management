import mongoose from 'mongoose';
import type { HydratedDocument, Model, Types } from 'mongoose';
import { BETTER_AUTH_USER_MODEL } from '../identity';

const { Schema, model, models } = mongoose;

/**
 * Downstream impact review flag (Step 16).
 *
 * Created when upstream work changes under an in-flight or completed
 * successor (reopen, cancellation, added prerequisite). At most one OPEN
 * review per task/upstream pair; resolution records who decided what and why
 * without touching task statuses — guards still apply.
 */
export interface DependencyReview {
  taskId: Types.ObjectId;
  upstreamTaskId: Types.ObjectId;
  reason: string;
  status: 'open' | 'resolved';
  resolvedBy: Types.ObjectId | null;
  resolvedAt: Date | null;
  resolutionNote: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type DependencyReviewDocument = HydratedDocument<DependencyReview>;

export const dependencyReviewSchema = new Schema<DependencyReview>(
  {
    taskId: { type: Schema.Types.ObjectId, ref: 'Task', required: true, index: true },
    upstreamTaskId: { type: Schema.Types.ObjectId, ref: 'Task', required: true },
    reason: { type: String, required: true, trim: true, maxlength: 2000 },
    status: { type: String, required: true, enum: ['open', 'resolved'], default: 'open' },
    resolvedBy: { type: Schema.Types.ObjectId, ref: BETTER_AUTH_USER_MODEL, default: null },
    resolvedAt: { type: Date, default: null },
    resolutionNote: { type: String, default: null, maxlength: 2000 },
  },
  { timestamps: true },
);

dependencyReviewSchema.index(
  { taskId: 1, upstreamTaskId: 1 },
  {
    unique: true,
    name: 'uniq_open_review_per_pair',
    partialFilterExpression: { status: 'open' },
  },
);
dependencyReviewSchema.index({ status: 1, updatedAt: -1 });

export const DependencyReviewModel: Model<DependencyReview> =
  (models['DependencyReview'] as Model<DependencyReview> | undefined) ??
  model<DependencyReview>('DependencyReview', dependencyReviewSchema);
