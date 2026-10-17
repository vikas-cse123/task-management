import mongoose from 'mongoose';
import type { HydratedDocument, Model, Types } from 'mongoose';
import { BETTER_AUTH_USER_MODEL } from '../identity';

const { Schema, model, models } = mongoose;

/**
 * A dependency edge: the successor cannot begin until the prerequisite
 * (predecessor) is Done.
 *
 * Edges are structural only — readiness is always derived from current task
 * statuses, never stored on the edge. All edges stay inside one project.
 */
export interface TaskDependency {
  projectId: Types.ObjectId;
  predecessorTaskId: Types.ObjectId;
  successorTaskId: Types.ObjectId;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type TaskDependencyDocument = HydratedDocument<TaskDependency>;

export const taskDependencySchema = new Schema<TaskDependency>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    predecessorTaskId: { type: Schema.Types.ObjectId, ref: 'Task', required: true },
    successorTaskId: { type: Schema.Types.ObjectId, ref: 'Task', required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: BETTER_AUTH_USER_MODEL, required: true },
  },
  { timestamps: true },
);

taskDependencySchema.index(
  { predecessorTaskId: 1, successorTaskId: 1 },
  { unique: true, name: 'uniq_dependency_edge' },
);
taskDependencySchema.index({ projectId: 1, predecessorTaskId: 1 });
taskDependencySchema.index({ projectId: 1, successorTaskId: 1 });

export const TaskDependencyModel: Model<TaskDependency> =
  (models['TaskDependency'] as Model<TaskDependency> | undefined) ??
  model<TaskDependency>('TaskDependency', taskDependencySchema);
