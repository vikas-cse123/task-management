import mongoose from 'mongoose';
import type { HydratedDocument, Model, Types } from 'mongoose';
import { BETTER_AUTH_USER_MODEL } from '../identity';

const { Schema, model, models } = mongoose;

/**
 * Durable, deduplicated workflow event (Phase 3 → consumed by Phase 5).
 *
 * Recorded exactly once per task version when a task becomes actionable
 * through the dependency engine. The unique `{ taskId, version, type }` index
 * makes duplicate emission impossible, including under concurrent approvals.
 * This records readiness only — never delivery (no notifications in Phase 3).
 */
export interface WorkflowEvent {
  taskId: Types.ObjectId;
  projectId: Types.ObjectId;
  clientId: Types.ObjectId;
  assignedUserId: Types.ObjectId | null;
  version: number;
  type: 'task.ready';
  actorId: Types.ObjectId | null;
  createdAt: Date;
}

export type WorkflowEventDocument = HydratedDocument<WorkflowEvent>;

export const workflowEventSchema = new Schema<WorkflowEvent>(
  {
    taskId: { type: Schema.Types.ObjectId, ref: 'Task', required: true, index: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    assignedUserId: { type: Schema.Types.ObjectId, ref: BETTER_AUTH_USER_MODEL, default: null },
    version: { type: Number, required: true, min: 0 },
    type: { type: String, required: true, enum: ['task.ready'] },
    actorId: { type: Schema.Types.ObjectId, ref: BETTER_AUTH_USER_MODEL, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

workflowEventSchema.index(
  { taskId: 1, version: 1, type: 1 },
  { unique: true, name: 'uniq_workflow_event' },
);

export const WorkflowEventModel: Model<WorkflowEvent> =
  (models['WorkflowEvent'] as Model<WorkflowEvent> | undefined) ??
  model<WorkflowEvent>('WorkflowEvent', workflowEventSchema);
