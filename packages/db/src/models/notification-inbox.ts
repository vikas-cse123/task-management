import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_EVENT_TYPES,
  type NotificationCategory,
  type NotificationEventType,
} from '@interscale/shared';
import mongoose from 'mongoose';
import type { HydratedDocument, Model, Types } from 'mongoose';
import { BETTER_AUTH_USER_MODEL } from '../identity';

const { Schema, model, models } = mongoose;

/**
 * Durable in-app notification (the permanent fallback channel).
 *
 * One record is written per event and recipient at enqueue time, in the same
 * transaction as the business change, and is never removed when a WhatsApp
 * message is suppressed or fails. `readAt` powers the unread badge.
 */
export interface NotificationInbox {
  recipientUserId: Types.ObjectId;
  eventKey: string;
  eventType: NotificationEventType;
  category: NotificationCategory;
  title: string;
  body: string;
  url: string | null;
  taskId: Types.ObjectId | null;
  projectId: Types.ObjectId | null;
  clientId: Types.ObjectId | null;
  readAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type NotificationInboxDocument = HydratedDocument<NotificationInbox>;

export const notificationInboxSchema = new Schema<NotificationInbox>(
  {
    recipientUserId: {
      type: Schema.Types.ObjectId,
      ref: BETTER_AUTH_USER_MODEL,
      required: true,
      index: true,
    },
    eventKey: { type: String, required: true, trim: true, maxlength: 300 },
    eventType: { type: String, required: true, enum: [...NOTIFICATION_EVENT_TYPES] },
    category: { type: String, required: true, enum: [...NOTIFICATION_CATEGORIES] },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    body: { type: String, required: true, trim: true, maxlength: 2000 },
    url: { type: String, trim: true, default: null, maxlength: 2000 },
    taskId: { type: Schema.Types.ObjectId, ref: 'Task', default: null },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', default: null },
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', default: null },
    readAt: { type: Date, default: null },
  },
  { timestamps: true },
);

notificationInboxSchema.index(
  { recipientUserId: 1, eventKey: 1 },
  { unique: true, name: 'uniq_notification_inbox' },
);
notificationInboxSchema.index({ recipientUserId: 1, readAt: 1, createdAt: -1 });
notificationInboxSchema.index({ recipientUserId: 1, category: 1, createdAt: -1 });

export const NotificationInboxModel: Model<NotificationInbox> =
  (models['NotificationInbox'] as Model<NotificationInbox> | undefined) ??
  model<NotificationInbox>('NotificationInbox', notificationInboxSchema);
