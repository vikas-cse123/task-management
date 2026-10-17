import { AUDIT_ACTIONS, type AuditAction } from '@interscale/shared';
import mongoose from 'mongoose';
import type { HydratedDocument, Model, Types } from 'mongoose';
import { BETTER_AUTH_USER_MODEL } from '../identity';

const { Schema, model, models } = mongoose;

/**
 * Durable per-task activity history (user-visible).
 *
 * Records creation, assignment, field changes, status transitions and
 * approval events with actor, previous/new state and timestamp. Complements
 * (not replaces) the compliance audit log, which receives parallel entries
 * for critical changes.
 */
export interface TaskActivity {
  taskId: Types.ObjectId;
  actorId: Types.ObjectId | null;
  action: AuditAction;
  previousValue: unknown;
  newValue: unknown;
  notes: string | null;
  createdAt: Date;
}

export type TaskActivityDocument = HydratedDocument<TaskActivity>;

export const taskActivitySchema = new Schema<TaskActivity>(
  {
    taskId: { type: Schema.Types.ObjectId, ref: 'Task', required: true, index: true },
    actorId: { type: Schema.Types.ObjectId, ref: BETTER_AUTH_USER_MODEL, default: null },
    action: { type: String, required: true, enum: [...AUDIT_ACTIONS] },
    previousValue: { type: Schema.Types.Mixed, default: null },
    newValue: { type: Schema.Types.Mixed, default: null },
    notes: { type: String, trim: true, default: null, maxlength: 1000 },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

taskActivitySchema.index({ taskId: 1, createdAt: -1 });

export const TaskActivityModel: Model<TaskActivity> =
  (models['TaskActivity'] as Model<TaskActivity> | undefined) ??
  model<TaskActivity>('TaskActivity', taskActivitySchema);
