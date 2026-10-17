import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_EVENT_TYPES,
  NOTIFICATION_OUTBOX_STATUSES,
  NOTIFICATION_RECIPIENT_ROLES,
  NOTIFICATION_SUPPRESSION_REASONS,
  type NotificationCategory,
  type NotificationChannel,
  type NotificationEventType,
  type NotificationOutboxStatus,
  type NotificationRecipientRole,
  type NotificationSuppressionReason,
} from '@interscale/shared';
import mongoose from 'mongoose';
import type { HydratedDocument, Model, Types } from 'mongoose';
import { BETTER_AUTH_USER_MODEL } from '../identity';

const { Schema, model, models } = mongoose;

/**
 * Transactional outbox for notification intents (Phase 5).
 *
 * A record is written in the *same transaction* as the business change that
 * produced it, so an event and its notification can never diverge. Delivery is
 * performed later by the worker. The unique `eventKey` makes enqueue idempotent
 * — concurrent approvals on the same task version cannot double-notify.
 *
 * `payload` holds the template parameter values captured at enqueue time plus
 * the stable context (task/project/client ids); it never holds secrets.
 */
export interface NotificationOutbox {
  eventKey: string;
  eventType: NotificationEventType;
  channel: NotificationChannel;
  status: NotificationOutboxStatus;
  category: NotificationCategory;
  recipientUserId: Types.ObjectId | null;
  recipientRole: NotificationRecipientRole;
  /** E.164 snapshot; the live consent and number are re-read at dispatch. */
  recipientPhone: string | null;
  taskId: Types.ObjectId | null;
  projectId: Types.ObjectId | null;
  clientId: Types.ObjectId | null;
  /** Meeting a `meeting.*` intent refers to (Phase 6, Step 34). */
  meetingId: Types.ObjectId | null;
  payload: Record<string, unknown>;
  scheduledAt: Date;
  attemptCount: number;
  nextAttemptAt: Date | null;
  claimedAt: Date | null;
  claimedBy: string | null;
  providerMessageId: string | null;
  sentAt: Date | null;
  deliveredAt: Date | null;
  readAt: Date | null;
  failedAt: Date | null;
  suppressionReason: NotificationSuppressionReason | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type NotificationOutboxDocument = HydratedDocument<NotificationOutbox>;

export const notificationOutboxSchema = new Schema<NotificationOutbox>(
  {
    eventKey: { type: String, required: true, trim: true, maxlength: 300 },
    eventType: { type: String, required: true, enum: [...NOTIFICATION_EVENT_TYPES] },
    channel: { type: String, required: true, enum: [...NOTIFICATION_CHANNELS] },
    status: {
      type: String,
      required: true,
      enum: [...NOTIFICATION_OUTBOX_STATUSES],
      default: 'pending',
    },
    category: { type: String, required: true, enum: [...NOTIFICATION_CATEGORIES] },
    recipientUserId: { type: Schema.Types.ObjectId, ref: BETTER_AUTH_USER_MODEL, default: null },
    recipientRole: { type: String, required: true, enum: [...NOTIFICATION_RECIPIENT_ROLES] },
    recipientPhone: { type: String, trim: true, default: null },
    taskId: { type: Schema.Types.ObjectId, ref: 'Task', default: null },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', default: null },
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', default: null },
    meetingId: { type: Schema.Types.ObjectId, ref: 'Meeting', default: null },
    payload: { type: Schema.Types.Mixed, default: {} },
    scheduledAt: { type: Date, required: true, default: () => new Date() },
    attemptCount: { type: Number, required: true, default: 0, min: 0 },
    nextAttemptAt: { type: Date, default: null },
    claimedAt: { type: Date, default: null },
    claimedBy: { type: String, trim: true, default: null },
    providerMessageId: { type: String, trim: true, default: null },
    sentAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
    readAt: { type: Date, default: null },
    failedAt: { type: Date, default: null },
    suppressionReason: {
      type: String,
      enum: [...NOTIFICATION_SUPPRESSION_REASONS],
      default: null,
    },
    lastError: { type: String, trim: true, default: null, maxlength: 500 },
  },
  { timestamps: true },
);

notificationOutboxSchema.index({ eventKey: 1 }, { unique: true, name: 'uniq_notification_event' });
notificationOutboxSchema.index({ status: 1, scheduledAt: 1 });
notificationOutboxSchema.index({ status: 1, nextAttemptAt: 1 });
notificationOutboxSchema.index({ taskId: 1, status: 1 });
notificationOutboxSchema.index({ meetingId: 1, status: 1 });
notificationOutboxSchema.index({ recipientUserId: 1, status: 1 });
notificationOutboxSchema.index({ providerMessageId: 1 }, { sparse: true });
notificationOutboxSchema.index({ createdAt: -1 });

export const NotificationOutboxModel: Model<NotificationOutbox> =
  (models['NotificationOutbox'] as Model<NotificationOutbox> | undefined) ??
  model<NotificationOutbox>('NotificationOutbox', notificationOutboxSchema);
