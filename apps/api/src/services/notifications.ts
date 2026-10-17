import {
  getNotificationSettings,
  getUnreadInAppCount,
  listInAppNotifications,
  listNotificationLog,
  markAllInAppNotificationsRead,
  markInAppNotificationRead,
  notificationDeliveryStats,
  retryFailedNotification,
  updateNotificationSettings,
  updateNotificationTemplateMappings,
  updateWhatsAppConsent,
  type InAppNotificationPage,
  type NotificationLogPage,
  type ResolvedNotificationSettings,
} from '@interscale/db';
import {
  validateTemplateRegistry,
  type NotificationCenterQuery,
  type NotificationDeliveryStats,
  type NotificationIntegrationStatus,
  type NotificationLogQuery,
  type NotificationSettings,
  type NotificationTemplateMapping,
  type UpdateNotificationSettingsInput,
  type UpdateNotificationTemplateMappingsInput,
  type UserProfile,
  type WhatsAppConsentInput,
} from '@interscale/shared';
import { env } from '../config/env';

/**
 * Notification API service (Phase 5, Step 29).
 *
 * Wraps the database notification engine with the API's authorization shape.
 * Self-service reads/consent are available to every authenticated user; the
 * workspace settings, delivery logs, statistics, and manual retry are
 * Admin-only and are guarded at the router.
 */

export interface NotificationConsentView {
  whatsappNumber: string | null;
  whatsappOptIn: boolean;
  whatsappOptInAt: string | null;
  whatsappOptInSource: string | null;
}

export interface NotificationApiService {
  listCenter(actor: UserProfile, query: NotificationCenterQuery): Promise<InAppNotificationPage>;
  getUnreadCount(actor: UserProfile): Promise<number>;
  markRead(actor: UserProfile, notificationId: string): Promise<boolean>;
  markAllRead(actor: UserProfile): Promise<number>;
  updateConsent(actor: UserProfile, input: WhatsAppConsentInput): Promise<NotificationConsentView>;
  getSettings(): Promise<NotificationSettings>;
  updateSettings(
    actor: UserProfile,
    input: UpdateNotificationSettingsInput,
  ): Promise<NotificationSettings>;
  getTemplateMappings(): Promise<NotificationTemplateMapping[]>;
  updateTemplateMappings(
    actor: UserProfile,
    input: UpdateNotificationTemplateMappingsInput,
  ): Promise<NotificationTemplateMapping[]>;
  listLogs(query: NotificationLogQuery): Promise<NotificationLogPage>;
  getStats(): Promise<NotificationDeliveryStats>;
  getIntegrationStatus(): Promise<NotificationIntegrationStatus>;
  retry(outboxId: string): Promise<boolean>;
}

function toSettingsView(settings: ResolvedNotificationSettings): NotificationSettings {
  return {
    enabled: settings.enabled,
    dueSoonLeadHours: settings.dueSoonLeadHours,
    escalationAfterHours: settings.escalationAfterHours,
    reviewIntervalDays: settings.reviewIntervalDays,
    activatedAt: settings.activatedAt ? settings.activatedAt.toISOString() : null,
    updatedAt: settings.updatedAt ? settings.updatedAt.toISOString() : null,
    updatedBy: settings.updatedBy,
  };
}

export function createNotificationService(): NotificationApiService {
  return {
    async listCenter(actor, query) {
      return listInAppNotifications(actor.id, query);
    },

    async getUnreadCount(actor) {
      return getUnreadInAppCount(actor.id);
    },

    async markRead(actor, notificationId) {
      return markInAppNotificationRead(actor.id, notificationId);
    },

    async markAllRead(actor) {
      return markAllInAppNotificationsRead(actor.id);
    },

    async updateConsent(actor, input) {
      await updateWhatsAppConsent(actor.id, {
        whatsappNumber: input.whatsappNumber,
        whatsappOptIn: input.whatsappOptIn,
      });

      return {
        whatsappNumber: input.whatsappNumber,
        whatsappOptIn: input.whatsappOptIn,
        whatsappOptInAt: input.whatsappOptIn ? new Date().toISOString() : null,
        whatsappOptInSource: input.whatsappOptIn ? 'self_service' : null,
      };
    },

    async getSettings() {
      return toSettingsView(await getNotificationSettings());
    },

    async updateSettings(actor, input) {
      return toSettingsView(await updateNotificationSettings(input, actor.id));
    },

    async getTemplateMappings() {
      return (await getNotificationSettings()).templateMappings;
    },

    async updateTemplateMappings(actor, input) {
      return (await updateNotificationTemplateMappings(input, actor.id)).templateMappings;
    },

    async listLogs(query) {
      return listNotificationLog(query);
    },

    async getStats() {
      return notificationDeliveryStats();
    },

    async getIntegrationStatus() {
      const settings = await getNotificationSettings();
      const providerConfigured =
        env.WHATSAPP_PROVIDER === 'mock' && env.NODE_ENV !== 'production'
          ? true
          : Boolean(env.WHATSAPP_PHONE_NUMBER_ID && env.WHATSAPP_ACCESS_TOKEN);

      const providerKind: NotificationIntegrationStatus['providerKind'] =
        env.WHATSAPP_PROVIDER === 'mock' && env.NODE_ENV !== 'production'
          ? 'mock'
          : env.WHATSAPP_PHONE_NUMBER_ID && env.WHATSAPP_ACCESS_TOKEN
            ? 'cloud'
            : 'disabled';

      const warnings = validateTemplateRegistry();

      if (settings.enabled && !providerConfigured) {
        warnings.push('The WhatsApp channel is enabled but no provider credentials are configured');
      }

      if (!settings.enabled) {
        warnings.push('The WhatsApp channel is currently disabled');
      }

      return {
        channelEnabled: settings.enabled && env.WHATSAPP_NOTIFICATIONS_ENABLED,
        providerConfigured,
        providerKind,
        webhookConfigured: Boolean(env.WHATSAPP_VERIFY_TOKEN && env.WHATSAPP_APP_SECRET),
        templatesValid: warnings.length === 0,
        warnings,
      };
    },

    async retry(outboxId) {
      return retryFailedNotification(outboxId);
    },
  };
}
