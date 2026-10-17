import { describe, expect, it } from 'vitest';
import {
  canTransitionOutbox,
  DELIVERY_STATUS_RANK,
  isDeliveryConfirmationStatus,
  NOTIFICATION_EVENT_TYPES,
  notificationCenterQuerySchema,
  notificationLogQuerySchema,
  notificationSettingsSchema,
  updateNotificationSettingsInputSchema,
  whatsappConsentInputSchema,
} from './index';

describe('notification lifecycle contracts', () => {
  it('blocks illegal outbox transitions', () => {
    expect(canTransitionOutbox('pending', 'processing')).toBe(true);
    expect(canTransitionOutbox('processing', 'sent')).toBe(true);
    expect(canTransitionOutbox('sent', 'delivered')).toBe(true);
    expect(canTransitionOutbox('delivered', 'read')).toBe(true);
    expect(canTransitionOutbox('read', 'sent')).toBe(false);
    expect(canTransitionOutbox('sent', 'pending')).toBe(false);
    expect(canTransitionOutbox('failed', 'retry_scheduled')).toBe(true);
    expect(canTransitionOutbox('suppressed', 'processing')).toBe(false);
  });

  it('orders delivery confirmations monotonically', () => {
    expect(DELIVERY_STATUS_RANK.sent).toBeLessThan(DELIVERY_STATUS_RANK.delivered);
    expect(DELIVERY_STATUS_RANK.delivered).toBeLessThan(DELIVERY_STATUS_RANK.read);
    expect(isDeliveryConfirmationStatus('delivered')).toBe(true);
    expect(isDeliveryConfirmationStatus('pending')).toBe(false);
  });
});

describe('notification schemas', () => {
  it('decodes boolean query flags explicitly', () => {
    expect(notificationCenterQuerySchema.parse({ unreadOnly: 'false' }).unreadOnly).toBe(false);
    expect(notificationCenterQuerySchema.parse({ unreadOnly: 'true' }).unreadOnly).toBe(true);
    expect(notificationCenterQuerySchema.parse({}).unreadOnly).toBe(false);
  });

  it('validates the consent payload', () => {
    expect(whatsappConsentInputSchema.safeParse({ whatsappOptIn: true }).success).toBe(false);
    expect(
      whatsappConsentInputSchema.safeParse({
        whatsappOptIn: true,
        whatsappNumber: '+919876543210',
      }).success,
    ).toBe(true);
    expect(whatsappConsentInputSchema.safeParse({ whatsappOptIn: false }).success).toBe(true);
    expect(
      whatsappConsentInputSchema.safeParse({ whatsappOptIn: true, whatsappNumber: 'nope' }).success,
    ).toBe(false);
  });

  it('requires a non-empty settings patch', () => {
    expect(updateNotificationSettingsInputSchema.safeParse({}).success).toBe(false);
    expect(updateNotificationSettingsInputSchema.safeParse({ enabled: true }).success).toBe(true);
    expect(updateNotificationSettingsInputSchema.safeParse({ dueSoonLeadHours: 0 }).success).toBe(
      false,
    );
  });

  it('parses a settings document', () => {
    const parsed = notificationSettingsSchema.parse({
      enabled: false,
      dueSoonLeadHours: 24,
      escalationAfterHours: 24,
      reviewIntervalDays: 7,
      activatedAt: null,
      updatedAt: null,
      updatedBy: null,
    });

    expect(parsed.enabled).toBe(false);
  });

  it('filters the admin log query', () => {
    const parsed = notificationLogQuerySchema.parse({ status: 'failed', channel: 'whatsapp' });

    expect(parsed.status).toBe('failed');
    expect(parsed.limit).toBe(50);
  });

  it('lists every modelled event', () => {
    expect(NOTIFICATION_EVENT_TYPES).toContain('task.assigned');
    expect(NOTIFICATION_EVENT_TYPES).toContain('task.due_soon');
    expect(NOTIFICATION_EVENT_TYPES).toContain('task.overdue_escalation');
    expect(NOTIFICATION_EVENT_TYPES).toContain('meeting.assigned');
  });
});
