import {
  API_PREFIX,
  inAppNotificationSchema,
  notificationDeliveryStatsSchema,
  notificationIntegrationStatusSchema,
  notificationLogEntrySchema,
  notificationSettingsSchema,
  notificationTemplateMappingSchema,
  type InAppNotification,
  type NotificationDeliveryStats,
  type NotificationIntegrationStatus,
  type NotificationLogEntry,
  type NotificationSettings,
  type NotificationTemplateMapping,
  type UpdateNotificationSettingsInput,
  type WhatsAppConsentInput,
} from '@interscale/shared';
import { apiRequest } from './api';

/** Notification center, consent, and Admin administration client (Phase 5). */

export interface NotificationConsent {
  whatsappNumber: string | null;
  whatsappOptIn: boolean;
  whatsappOptInAt: string | null;
  whatsappOptInSource: string | null;
}

export interface NotificationCenterFilters {
  unreadOnly?: boolean;
  category?: string;
  limit?: number;
}

export interface NotificationLogFilters {
  status?: string;
  eventType?: string;
  limit?: number;
}

export async function listNotifications(
  query: NotificationCenterFilters = {},
): Promise<InAppNotification[]> {
  const params = new URLSearchParams();

  if (query.unreadOnly) {
    params.set('unreadOnly', 'true');
  }

  if (query.category) {
    params.set('category', query.category);
  }

  if (query.limit) {
    params.set('limit', String(query.limit));
  }

  const suffix = params.toString();
  const data = await apiRequest<unknown>(
    `${API_PREFIX}/notifications${suffix ? `?${suffix}` : ''}`,
  );

  return inAppNotificationSchema.array().parse(data);
}

export async function getUnreadCount(): Promise<number> {
  const data = await apiRequest<{ count: number }>(`${API_PREFIX}/notifications/unread-count`);
  return data.count;
}

export async function markNotificationRead(id: string): Promise<void> {
  await apiRequest<unknown>(`${API_PREFIX}/notifications/${id}/read`, { method: 'POST' });
}

export async function markAllNotificationsRead(): Promise<number> {
  const data = await apiRequest<{ updated: number }>(`${API_PREFIX}/notifications/read-all`, {
    method: 'POST',
  });
  return data.updated;
}

export async function updateConsent(input: WhatsAppConsentInput): Promise<NotificationConsent> {
  return apiRequest<NotificationConsent>(`${API_PREFIX}/me/notification-consent`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function getNotificationSettings(): Promise<NotificationSettings> {
  const data = await apiRequest<unknown>(`${API_PREFIX}/notification-settings`);
  return notificationSettingsSchema.parse(data);
}

export async function updateNotificationSettings(
  input: UpdateNotificationSettingsInput,
): Promise<NotificationSettings> {
  const data = await apiRequest<unknown>(`${API_PREFIX}/notification-settings`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return notificationSettingsSchema.parse(data);
}

export async function getTemplateMappings(): Promise<NotificationTemplateMapping[]> {
  const data = await apiRequest<unknown>(`${API_PREFIX}/notification-settings/templates`);
  return notificationTemplateMappingSchema.array().parse(data);
}

export async function updateTemplateMappings(
  mappings: { eventType: string; templateKey: string; enabled: boolean }[],
): Promise<NotificationTemplateMapping[]> {
  const data = await apiRequest<unknown>(`${API_PREFIX}/notification-settings/templates`, {
    method: 'PATCH',
    body: JSON.stringify({ mappings }),
  });
  return notificationTemplateMappingSchema.array().parse(data);
}

export async function getDeliveryStats(): Promise<NotificationDeliveryStats> {
  const data = await apiRequest<unknown>(`${API_PREFIX}/notification-settings/stats`);
  return notificationDeliveryStatsSchema.parse(data);
}

export async function getIntegrationStatus(): Promise<NotificationIntegrationStatus> {
  const data = await apiRequest<unknown>(`${API_PREFIX}/notification-settings/integration`);
  return notificationIntegrationStatusSchema.parse(data);
}

export async function listNotificationLog(
  query: NotificationLogFilters = {},
): Promise<NotificationLogEntry[]> {
  const params = new URLSearchParams({ limit: String(query.limit ?? 50) });

  if (query.status) {
    params.set('status', query.status);
  }

  if (query.eventType) {
    params.set('eventType', query.eventType);
  }

  const data = await apiRequest<unknown>(`${API_PREFIX}/notification-logs?${params.toString()}`);
  return notificationLogEntrySchema.array().parse(data);
}

export async function retryNotification(outboxId: string): Promise<void> {
  await apiRequest<unknown>(`${API_PREFIX}/notification-outbox/${outboxId}/retry`, {
    method: 'POST',
  });
}
