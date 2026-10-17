import { z } from 'zod';
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_EVENT_TYPES,
  NOTIFICATION_OUTBOX_STATUSES,
  NOTIFICATION_RECIPIENT_ROLES,
  NOTIFICATION_SUPPRESSION_REASONS,
} from '../enums/notification';
import { WHATSAPP_TEMPLATE_KEYS } from '../whatsapp/templates';
import { objectIdSchema, phoneE164Schema, zBooleanQuery } from './primitives';
import { paginationQuerySchema } from './pagination';

/** A durable in-app notification for the current user. */
export const inAppNotificationSchema = z.object({
  id: objectIdSchema,
  eventType: z.enum(NOTIFICATION_EVENT_TYPES),
  category: z.enum(NOTIFICATION_CATEGORIES),
  title: z.string(),
  body: z.string(),
  url: z.string().nullable(),
  taskId: objectIdSchema.nullable(),
  projectId: objectIdSchema.nullable(),
  clientId: objectIdSchema.nullable(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});

export type InAppNotification = z.infer<typeof inAppNotificationSchema>;

export const notificationCenterQuerySchema = paginationQuerySchema.extend({
  unreadOnly: zBooleanQuery.default(false),
  category: z.enum(NOTIFICATION_CATEGORIES).optional(),
  eventType: z.enum(NOTIFICATION_EVENT_TYPES).optional(),
});

export type NotificationCenterQuery = z.infer<typeof notificationCenterQuerySchema>;

export const whatsappConsentInputSchema = z
  .object({
    whatsappNumber: phoneE164Schema.nullable().default(null),
    whatsappOptIn: z.boolean().default(false),
  })
  .refine((value) => !value.whatsappOptIn || value.whatsappNumber !== null, {
    message: 'A WhatsApp number is required to opt in',
    path: ['whatsappNumber'],
  });

export type WhatsAppConsentInput = z.infer<typeof whatsappConsentInputSchema>;

/** Workspace-level notification settings (singleton document). */
export const notificationSettingsSchema = z.object({
  enabled: z.boolean(),
  dueSoonLeadHours: z.number().int(),
  escalationAfterHours: z.number().int(),
  reviewIntervalDays: z.number().int(),
  activatedAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
  updatedBy: objectIdSchema.nullable(),
});

export type NotificationSettings = z.infer<typeof notificationSettingsSchema>;

export const updateNotificationSettingsInputSchema = z
  .object({
    enabled: z.boolean().optional(),
    dueSoonLeadHours: z.number().int().min(1).max(720).optional(),
    escalationAfterHours: z.number().int().min(1).max(720).optional(),
    reviewIntervalDays: z.number().int().min(1).max(90).optional(),
  })
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), {
    message: 'Provide at least one setting to update',
  });

export type UpdateNotificationSettingsInput = z.infer<typeof updateNotificationSettingsInputSchema>;

/** Which approved template is used for each automatic event. */
export const notificationTemplateMappingSchema = z.object({
  eventType: z.enum(NOTIFICATION_EVENT_TYPES),
  templateKey: z.enum(WHATSAPP_TEMPLATE_KEYS),
  templateName: z.string(),
  language: z.string(),
  enabled: z.boolean(),
});

export type NotificationTemplateMapping = z.infer<typeof notificationTemplateMappingSchema>;

export const updateNotificationTemplateMappingsInputSchema = z.object({
  mappings: z
    .array(
      z.object({
        eventType: z.enum(NOTIFICATION_EVENT_TYPES),
        templateKey: z.enum(WHATSAPP_TEMPLATE_KEYS),
        enabled: z.boolean().default(true),
      }),
    )
    .min(1)
    .max(NOTIFICATION_EVENT_TYPES.length),
});

export type UpdateNotificationTemplateMappingsInput = z.infer<
  typeof updateNotificationTemplateMappingsInputSchema
>;

/** An outbox / dispatch record for the Admin notification log. */
export const notificationLogEntrySchema = z.object({
  id: objectIdSchema,
  eventType: z.enum(NOTIFICATION_EVENT_TYPES),
  channel: z.enum(NOTIFICATION_CHANNELS),
  status: z.enum(NOTIFICATION_OUTBOX_STATUSES),
  recipientRole: z.enum(NOTIFICATION_RECIPIENT_ROLES),
  recipientUserId: objectIdSchema.nullable(),
  taskId: objectIdSchema.nullable(),
  projectId: objectIdSchema.nullable(),
  clientId: objectIdSchema.nullable(),
  attemptCount: z.number().int(),
  providerMessageId: z.string().nullable(),
  suppressionReason: z.enum(NOTIFICATION_SUPPRESSION_REASONS).nullable(),
  lastError: z.string().nullable(),
  scheduledAt: z.string(),
  sentAt: z.string().nullable(),
  deliveredAt: z.string().nullable(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type NotificationLogEntry = z.infer<typeof notificationLogEntrySchema>;

export const notificationLogQuerySchema = paginationQuerySchema.extend({
  status: z.enum(NOTIFICATION_OUTBOX_STATUSES).optional(),
  eventType: z.enum(NOTIFICATION_EVENT_TYPES).optional(),
  channel: z.enum(NOTIFICATION_CHANNELS).optional(),
  clientId: objectIdSchema.optional(),
  projectId: objectIdSchema.optional(),
  recipientUserId: objectIdSchema.optional(),
});

export type NotificationLogQuery = z.infer<typeof notificationLogQuerySchema>;

/** Aggregate delivery counts plus worker/integration health for Settings. */
export const notificationDeliveryStatsSchema = z.object({
  pending: z.number().int(),
  processing: z.number().int(),
  sent: z.number().int(),
  delivered: z.number().int(),
  read: z.number().int(),
  retryScheduled: z.number().int(),
  failed: z.number().int(),
  suppressed: z.number().int(),
  unreadInApp: z.number().int(),
});

export type NotificationDeliveryStats = z.infer<typeof notificationDeliveryStatsSchema>;

export const notificationIntegrationStatusSchema = z.object({
  channelEnabled: z.boolean(),
  providerConfigured: z.boolean(),
  providerKind: z.enum(['cloud', 'mock', 'disabled']),
  webhookConfigured: z.boolean(),
  templatesValid: z.boolean(),
  warnings: z.array(z.string()),
});

export type NotificationIntegrationStatus = z.infer<typeof notificationIntegrationStatusSchema>;
