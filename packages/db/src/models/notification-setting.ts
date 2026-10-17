import {
  DEFAULT_DUE_SOON_LEAD_HOURS,
  DEFAULT_ESCALATION_AFTER_HOURS,
  DEFAULT_REVIEW_INTERVAL_DAYS,
  NOTIFICATION_EVENT_TYPES,
  WHATSAPP_TEMPLATE_KEYS,
  type NotificationEventType,
  type WhatsAppTemplateKey,
} from '@interscale/shared';
import mongoose from 'mongoose';
import type { HydratedDocument, Model, Types } from 'mongoose';
import { BETTER_AUTH_USER_MODEL } from '../identity';

const { Schema, model, models } = mongoose;

export interface NotificationTemplateMapping {
  eventType: NotificationEventType;
  templateKey: WhatsAppTemplateKey;
  enabled: boolean;
}

/**
 * Workspace-level notification settings (a single document).
 *
 * `enabled` gates the WhatsApp channel only; in-app notifications are always
 * recorded. `activatedAt` is set the first time the channel is enabled, so a
 * later activation can never replay events captured before it. Template
 * mappings must only reference approved templates (validated in the service).
 */
export interface NotificationSetting {
  key: 'default';
  enabled: boolean;
  dueSoonLeadHours: number;
  escalationAfterHours: number;
  reviewIntervalDays: number;
  activatedAt: Date | null;
  templateMappings: NotificationTemplateMapping[];
  updatedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export type NotificationSettingDocument = HydratedDocument<NotificationSetting>;

export const NOTIFICATION_SETTING_SINGLETON_KEY = 'default';

const templateMappingSchema = new Schema<NotificationTemplateMapping>(
  {
    eventType: { type: String, required: true, enum: [...NOTIFICATION_EVENT_TYPES] },
    templateKey: { type: String, required: true, enum: [...WHATSAPP_TEMPLATE_KEYS] },
    enabled: { type: Boolean, required: true, default: true },
  },
  { _id: false },
);

export const notificationSettingSchema = new Schema<NotificationSetting>(
  {
    key: {
      type: String,
      required: true,
      enum: [NOTIFICATION_SETTING_SINGLETON_KEY],
      default: NOTIFICATION_SETTING_SINGLETON_KEY,
    },
    enabled: { type: Boolean, required: true, default: false },
    dueSoonLeadHours: {
      type: Number,
      required: true,
      default: DEFAULT_DUE_SOON_LEAD_HOURS,
      min: 1,
      max: 720,
    },
    escalationAfterHours: {
      type: Number,
      required: true,
      default: DEFAULT_ESCALATION_AFTER_HOURS,
      min: 1,
      max: 720,
    },
    reviewIntervalDays: {
      type: Number,
      required: true,
      default: DEFAULT_REVIEW_INTERVAL_DAYS,
      min: 1,
      max: 90,
    },
    activatedAt: { type: Date, default: null },
    templateMappings: { type: [templateMappingSchema], default: [] },
    updatedBy: { type: Schema.Types.ObjectId, ref: BETTER_AUTH_USER_MODEL, default: null },
  },
  { timestamps: true },
);

notificationSettingSchema.index({ key: 1 }, { unique: true, name: 'uniq_notification_setting' });

export const NotificationSettingModel: Model<NotificationSetting> =
  (models['NotificationSetting'] as Model<NotificationSetting> | undefined) ??
  model<NotificationSetting>('NotificationSetting', notificationSettingSchema);
