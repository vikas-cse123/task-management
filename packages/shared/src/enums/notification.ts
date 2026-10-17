/**
 * Notification contracts (Phase 5).
 *
 * The notification engine is a transactional outbox: business changes record
 * durable intents in the same transaction that commits the change, and a
 * background worker dispatches them later. Delivery is *not* part of the
 * business transaction — see `docs/07-development-phases.md` (Phase 5).
 *
 * Exactly the automatic WhatsApp follow-up events from
 * `docs/00-product-requirements.md` are modelled here. In-app notifications
 * are recorded for the same events as a permanent, fallback channel.
 */
export const NOTIFICATION_EVENT_TYPES = [
  'task.assigned',
  'task.reassigned',
  'task.ready',
  'task.revision_requested',
  'task.due_soon',
  'task.overdue',
  'task.overdue_escalation',
  'meeting.assigned',
  'meeting.rescheduled',
  'meeting.reminder',
  'campaign.review_due',
] as const;

export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];

/**
 * Meeting lifecycle events (Phase 6, Step 34).
 *
 * Only the owner (the assigned Project Manager) is notified, and only internal
 * recipients are ever messaged — external client contacts are out of MVP scope.
 */
export const MEETING_NOTIFICATION_EVENT_TYPES: readonly NotificationEventType[] = [
  'meeting.assigned',
  'meeting.rescheduled',
  'meeting.reminder',
];

export const NOTIFICATION_EVENT_LABELS: Record<NotificationEventType, string> = {
  'task.assigned': 'Task assigned',
  'task.reassigned': 'Task reassigned',
  'task.ready': 'Task ready to start',
  'task.revision_requested': 'Revision requested',
  'task.due_soon': 'Task due soon',
  'task.overdue': 'Task overdue',
  'task.overdue_escalation': 'Overdue escalation',
  'meeting.assigned': 'Meeting assigned',
  'meeting.rescheduled': 'Meeting rescheduled',
  'meeting.reminder': 'Meeting reminder',
  'campaign.review_due': 'Campaign review due',
};

export const NOTIFICATION_CHANNELS = ['in_app', 'whatsapp'] as const;

export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_CHANNEL_LABELS: Record<NotificationChannel, string> = {
  in_app: 'In-app',
  whatsapp: 'WhatsApp',
};

export const NOTIFICATION_CATEGORIES = [
  'task',
  'deadline',
  'escalation',
  'meeting',
  'system',
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

/**
 * Outbox lifecycle.
 *
 * `processing` is a transient claim made by the worker under a lease; a crashed
 * worker's stale claims are recovered to `retry_scheduled`. Provider-accepted
 * is `sent` — delivery and read receipts arrive later through the webhook.
 */
export const NOTIFICATION_OUTBOX_STATUSES = [
  'pending',
  'processing',
  'sent',
  'delivered',
  'read',
  'retry_scheduled',
  'failed',
  'suppressed',
  'cancelled',
] as const;

export type NotificationOutboxStatus = (typeof NOTIFICATION_OUTBOX_STATUSES)[number];

/** Statuses a record may still be dispatched from. */
export const DISPATCHABLE_OUTBOX_STATUSES: readonly NotificationOutboxStatus[] = [
  'pending',
  'retry_scheduled',
];

/** Terminal statuses: no further automatic transitions. */
export const TERMINAL_OUTBOX_STATUSES: readonly NotificationOutboxStatus[] = [
  'read',
  'suppressed',
  'cancelled',
];

/** Allowed status transitions. Enforced by `canTransitionOutbox`. */
export const NOTIFICATION_OUTBOX_TRANSITIONS: Record<
  NotificationOutboxStatus,
  readonly NotificationOutboxStatus[]
> = {
  pending: ['processing', 'cancelled', 'suppressed'],
  retry_scheduled: ['processing', 'cancelled', 'suppressed'],
  processing: ['sent', 'retry_scheduled', 'failed', 'suppressed'],
  sent: ['delivered', 'read', 'failed'],
  delivered: ['read'],
  read: [],
  failed: ['retry_scheduled'],
  suppressed: [],
  cancelled: [],
};

export function canTransitionOutbox(
  from: NotificationOutboxStatus,
  to: NotificationOutboxStatus,
): boolean {
  return NOTIFICATION_OUTBOX_TRANSITIONS[from].includes(to);
}

/** Delivery confirmations delivered by the provider webhook, weakest first. */
export const DELIVERY_CONFIRMATION_STATUSES = ['sent', 'delivered', 'read'] as const;

export type DeliveryConfirmationStatus = (typeof DELIVERY_CONFIRMATION_STATUSES)[number];

/**
 * Monotonic rank so an out-of-order `delivered` after `read` never regresses a
 * confirmed read receipt.
 */
export const DELIVERY_STATUS_RANK: Record<DeliveryConfirmationStatus, number> = {
  sent: 1,
  delivered: 2,
  read: 3,
};

export function isDeliveryConfirmationStatus(value: unknown): value is DeliveryConfirmationStatus {
  return (
    typeof value === 'string' &&
    (DELIVERY_CONFIRMATION_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * Why a WhatsApp intent was recorded but not dispatched.
 *
 * Suppression is always explicit and audited; the in-app copy is unaffected.
 */
export const NOTIFICATION_SUPPRESSION_REASONS = [
  'channel_disabled',
  'channel_not_configured',
  'no_consent',
  'invalid_recipient',
  'no_recipient',
  'recipient_inactive',
  'task_no_longer_actionable',
  'deadline_changed',
  'meeting_no_longer_actionable',
  'meeting_schedule_changed',
  'template_missing',
  'duplicate',
  'cancelled_by_user',
] as const;

export type NotificationSuppressionReason = (typeof NOTIFICATION_SUPPRESSION_REASONS)[number];

export const NOTIFICATION_SUPPRESSION_LABELS: Record<NotificationSuppressionReason, string> = {
  channel_disabled: 'WhatsApp notifications are disabled',
  channel_not_configured: 'WhatsApp is not configured',
  no_consent: 'Recipient has not opted in',
  invalid_recipient: 'Recipient number is not a valid WhatsApp number',
  no_recipient: 'No recipient could be resolved',
  recipient_inactive: 'Recipient account is inactive',
  task_no_longer_actionable: 'Task is no longer actionable',
  deadline_changed: 'Deadline changed after the reminder was recorded',
  meeting_no_longer_actionable: 'Meeting is no longer actionable',
  meeting_schedule_changed: 'Meeting schedule changed after the reminder was recorded',
  template_missing: 'No approved template is mapped to this event',
  duplicate: 'A matching notification already exists',
  cancelled_by_user: 'Cancelled by an administrator',
};

/** Recipient roles used when resolving who a notification is for. */
export const NOTIFICATION_RECIPIENT_ROLES = ['assignee', 'manager'] as const;

export type NotificationRecipientRole = (typeof NOTIFICATION_RECIPIENT_ROLES)[number];

/** Default lead time before a deadline for the "due soon" reminder. */
export const DEFAULT_DUE_SOON_LEAD_HOURS = 24;

/** Default delay after a deadline before a manager escalation. */
export const DEFAULT_ESCALATION_AFTER_HOURS = 24;

/** Default weekly campaign-review cadence. */
export const DEFAULT_REVIEW_INTERVAL_DAYS = 7;

/** Lead time before a meeting start for the one-hour reminder (Phase 6, Step 34). */
export const DEFAULT_MEETING_REMINDER_LEAD_MINUTES = 60;

/** Maximum dispatch attempts before an outbox record is failed permanently. */
export const NOTIFICATION_MAX_ATTEMPTS = 5;

/** How long a worker claim is valid before another worker may reclaim it. */
export const NOTIFICATION_CLAIM_LEASE_MS = 5 * 60 * 1000;
