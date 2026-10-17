import {
  DEFAULT_TASK_PRIORITY,
  DEFAULT_TASK_STATUS,
  TASK_PRIORITIES,
  TASK_STATUSES,
  type TaskPriority,
  type TaskStatus,
} from '@interscale/shared';
import mongoose from 'mongoose';
import type { HydratedDocument, Model, Types } from 'mongoose';
import { BETTER_AUTH_USER_MODEL } from '../identity';

const { Schema, model, models } = mongoose;

/**
 * An individually assignable unit of work.
 *
 * Subtasks reuse this model via `parentTaskId` (one level only, enforced in
 * the service layer). `sourceMeetingId` and dependency edges are reserved
 * for later phases and never acted on in Phase 2.
 */
export interface Task {
  projectId: Types.ObjectId;
  parentTaskId: Types.ObjectId | null;
  title: string;
  description: string | null;
  assignedUserId: Types.ObjectId | null;
  assignedJobRoleId: Types.ObjectId | null;
  dueAt: Date | null;
  priority: TaskPriority;
  status: TaskStatus;
  approvalRequired: boolean;
  approverId: Types.ObjectId | null;
  submittedBy: Types.ObjectId | null;
  submittedAt: Date | null;
  approvedBy: Types.ObjectId | null;
  approvedAt: Date | null;
  completedAt: Date | null;
  revisionCount: number;
  sopUrl: string | null;
  referenceUrl: string | null;
  sourceMeetingId: Types.ObjectId | null;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type TaskDocument = HydratedDocument<Task>;

const nullableUserRef = {
  type: Schema.Types.ObjectId,
  ref: BETTER_AUTH_USER_MODEL,
  default: null,
  index: true,
} as const;

export const taskSchema = new Schema<Task>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    parentTaskId: { type: Schema.Types.ObjectId, ref: 'Task', default: null, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: null, maxlength: 2000 },
    assignedUserId: { ...nullableUserRef },
    assignedJobRoleId: { type: Schema.Types.ObjectId, ref: 'JobRole', default: null, index: true },
    dueAt: { type: Date, default: null, index: true },
    priority: {
      type: String,
      required: true,
      enum: [...TASK_PRIORITIES],
      default: DEFAULT_TASK_PRIORITY,
    },
    status: {
      type: String,
      required: true,
      enum: [...TASK_STATUSES],
      default: DEFAULT_TASK_STATUS,
      index: true,
    },
    approvalRequired: { type: Boolean, required: true, default: false },
    approverId: { ...nullableUserRef },
    submittedBy: { ...nullableUserRef },
    submittedAt: { type: Date, default: null },
    approvedBy: { ...nullableUserRef },
    approvedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    revisionCount: { type: Number, required: true, default: 0, min: 0 },
    sopUrl: { type: String, default: null, maxlength: 2000 },
    referenceUrl: { type: String, default: null, maxlength: 2000 },
    sourceMeetingId: { type: Schema.Types.ObjectId, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: BETTER_AUTH_USER_MODEL, required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: BETTER_AUTH_USER_MODEL, required: true },
  },
  { timestamps: true, optimisticConcurrency: true },
);

taskSchema.index({ projectId: 1, status: 1 });
taskSchema.index({ projectId: 1, parentTaskId: 1 });
taskSchema.index({ assignedUserId: 1, status: 1 });
taskSchema.index({ approverId: 1, status: 1 });
taskSchema.index({ status: 1, dueAt: 1 });

export const TaskModel: Model<Task> =
  (models['Task'] as Model<Task> | undefined) ?? model<Task>('Task', taskSchema);
