import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_OUTBOX_STATUSES,
  type NotificationChannel,
  type NotificationOutboxStatus,
} from '@interscale/shared';
import mongoose from 'mongoose';
import type { HydratedDocument, Model, Types } from 'mongoose';

const { Schema, model, models } = mongoose;

/**
 * Append-only attempt log for the notification dispatcher.
 *
 * One record per dispatch attempt (including suppressions), so the Admin log
 * can show a full delivery history for an outbox record without mutating it.
 * Never stores tokens, full phone numbers, or message bodies.
 */
export interface NotificationAttemptLog {
  outboxId: Types.ObjectId;
  eventKey: string;
  channel: NotificationChannel;
  status: NotificationOutboxStatus;
  attempt: number;
  providerMessageId: string | null;
  error: string | null;
  workerId: string | null;
  createdAt: Date;
}

export type NotificationAttemptLogDocument = HydratedDocument<NotificationAttemptLog>;

export const notificationAttemptLogSchema = new Schema<NotificationAttemptLog>(
  {
    outboxId: { type: Schema.Types.ObjectId, ref: 'NotificationOutbox', required: true },
    eventKey: { type: String, required: true, trim: true, maxlength: 300 },
    channel: { type: String, required: true, enum: [...NOTIFICATION_CHANNELS] },
    status: { type: String, required: true, enum: [...NOTIFICATION_OUTBOX_STATUSES] },
    attempt: { type: Number, required: true, min: 0 },
    providerMessageId: { type: String, trim: true, default: null },
    error: { type: String, trim: true, default: null, maxlength: 500 },
    workerId: { type: String, trim: true, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

notificationAttemptLogSchema.index({ outboxId: 1, createdAt: -1 });
notificationAttemptLogSchema.index({ eventKey: 1, createdAt: -1 });

export const NotificationAttemptLogModel: Model<NotificationAttemptLog> =
  (models['NotificationAttemptLog'] as Model<NotificationAttemptLog> | undefined) ??
  model<NotificationAttemptLog>('NotificationAttemptLog', notificationAttemptLogSchema);
