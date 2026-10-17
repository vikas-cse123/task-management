import {
  DEFAULT_MEETING_ACTION_ITEM_STATUS,
  DEFAULT_TASK_PRIORITY,
  MEETING_ACTION_ITEM_STATUSES,
  TASK_PRIORITIES,
  type MeetingActionItemStatus,
  type TaskPriority,
} from '@interscale/shared';
import mongoose from 'mongoose';
import type { HydratedDocument, Model, Types } from 'mongoose';
import { BETTER_AUTH_USER_MODEL } from '../identity';

const { Schema, model, models } = mongoose;

/**
 * A meeting action item (Phase 6, Step 33).
 *
 * An action item is a meeting follow-up record — deliberately NOT a task and
 * deliberately without a second, independent workflow lifecycle. It carries a
 * single conversion state (`pending` → `converted`). Converting it uses the
 * existing Task engine and stores the resulting `linkedTaskId`, which makes the
 * conversion idempotent and keeps converted history intact.
 */
export interface MeetingActionItem {
  meetingId: Types.ObjectId;
  clientId: Types.ObjectId;
  projectId: Types.ObjectId | null;
  title: string;
  description: string | null;
  responsibleJobRoleId: Types.ObjectId;
  assignedUserId: Types.ObjectId | null;
  dueAt: Date | null;
  priority: TaskPriority;
  status: MeetingActionItemStatus;
  linkedTaskId: Types.ObjectId | null;
  createdBy: Types.ObjectId | null;
  updatedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export type MeetingActionItemDocument = HydratedDocument<MeetingActionItem>;

export const meetingActionItemSchema = new Schema<MeetingActionItem>(
  {
    meetingId: { type: Schema.Types.ObjectId, ref: 'Meeting', required: true },
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', default: null },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: null, maxlength: 2000 },
    responsibleJobRoleId: { type: Schema.Types.ObjectId, ref: 'JobRole', required: true },
    assignedUserId: { type: Schema.Types.ObjectId, ref: BETTER_AUTH_USER_MODEL, default: null },
    dueAt: { type: Date, default: null },
    priority: {
      type: String,
      required: true,
      enum: [...TASK_PRIORITIES],
      default: DEFAULT_TASK_PRIORITY,
    },
    status: {
      type: String,
      required: true,
      enum: [...MEETING_ACTION_ITEM_STATUSES],
      default: DEFAULT_MEETING_ACTION_ITEM_STATUS,
    },
    linkedTaskId: { type: Schema.Types.ObjectId, ref: 'Task', default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: BETTER_AUTH_USER_MODEL, default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: BETTER_AUTH_USER_MODEL, default: null },
  },
  { timestamps: true, optimisticConcurrency: true },
);

// Query-driven indexes: per-meeting lists and follow-up lookups.
meetingActionItemSchema.index({ meetingId: 1, createdAt: 1 });
meetingActionItemSchema.index({ meetingId: 1, status: 1 });
meetingActionItemSchema.index({ clientId: 1, dueAt: 1 });
meetingActionItemSchema.index({ assignedUserId: 1, status: 1 });

export const MeetingActionItemModel: Model<MeetingActionItem> =
  (models['MeetingActionItem'] as Model<MeetingActionItem> | undefined) ??
  model<MeetingActionItem>('MeetingActionItem', meetingActionItemSchema);
