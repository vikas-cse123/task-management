import {
  buildTemplateMessage,
  canTransitionOutbox,
  E164_PATTERN,
  getTemplateDefinition,
  isActiveMeetingStatus,
  MEETING_NOTIFICATION_EVENT_TYPES,
  NOTIFICATION_CLAIM_LEASE_MS,
  NOTIFICATION_EVENT_TEMPLATE,
  NOTIFICATION_MAX_ATTEMPTS,
  WhatsAppProviderError,
  type NotificationEventType,
  type NotificationOutboxStatus,
  type NotificationSuppressionReason,
  type TemplateParameterValues,
  type WhatsAppProvider,
} from '@interscale/shared';
import type { ClientSession, Connection } from 'mongoose';
import mongoose from 'mongoose';
import { getConnection } from '../connection';
import { MeetingModel } from '../models/meeting';
import { NotificationAttemptLogModel } from '../models/notification-attempt-log';
import { NotificationOutboxModel, type NotificationOutbox } from '../models/notification-outbox';
import { TaskModel } from '../models/task';
import {
  DEADLINE_EVENT_TYPES,
  getUserWhatsAppContact,
  type ResolvedNotificationSettings,
} from './notification.service';

/**
 * Notification dispatcher (Phase 5, Step 28).
 *
 * The worker calls `processDueNotifications` on a recurring Agenda job. Records
 * are claimed atomically (status → processing under a lease), revalidated
 * against live task state and consent, then sent through the WhatsApp provider
 * or suppressed with an explicit reason. Nothing here writes inside a business
 * transaction: an external send must never be rolled back, so the outbox is the
 * single source of truth.
 */

const ASSIGNMENT_EVENT_TYPES: readonly NotificationEventType[] = [
  'task.assigned',
  'task.reassigned',
  'task.ready',
  'task.revision_requested',
];

/** Exponential backoff between retries, capped at 30 minutes. */
export function computeBackoffMs(attempt: number): number {
  const base = 30_000;
  const cap = 30 * 60_000;
  const exponential = base * 2 ** Math.max(0, attempt - 1);

  return Math.min(cap, exponential);
}

export interface NotificationDispatcherOptions {
  connection?: Connection;
  session?: ClientSession;
}

export interface NotificationDispatchDeps extends NotificationDispatcherOptions {
  provider: WhatsAppProvider;
  settings: ResolvedNotificationSettings;
  workerId: string;
  now?: Date;
  limit?: number;
  leaseMs?: number;
}

export interface DispatchSummary {
  readonly recovered: number;
  readonly claimed: number;
  readonly sent: number;
  readonly suppressed: number;
  readonly retried: number;
  readonly failed: number;
}

interface OutboxPayload {
  values?: TemplateParameterValues;
  deadlineAt?: string | null;
  assignedUserId?: string | null;
  meetingId?: string | null;
  meetingScheduleVersion?: number | null;
  meetingStartsAt?: string | null;
  meetingOwnerUserId?: string | null;
}

type OutboxDocument = NotificationOutbox & { _id: mongoose.Types.ObjectId };

interface RevalidationResult {
  readonly action: 'send' | 'suppress';
  readonly reason?: NotificationSuppressionReason;
  readonly phone?: string;
  readonly values?: TemplateParameterValues;
}

/**
 * Return stale `processing` claims to the retry queue.
 *
 * A worker that crashed mid-send leaves a record claimed; after the lease it is
 * eligible again. The attempt count is not incremented here.
 */
export async function recoverStaleClaims(
  options: NotificationDispatcherOptions & { now: Date; leaseMs: number },
): Promise<number> {
  const cutoff = new Date(options.now.getTime() - options.leaseMs);
  const result = await NotificationOutboxModel.updateMany(
    { status: 'processing', claimedAt: { $lte: cutoff } },
    { $set: { status: 'retry_scheduled', claimedAt: null, claimedBy: null } },
    options.session ? { session: options.session } : {},
  );

  return result.modifiedCount ?? 0;
}

/**
 * Atomically claim up to `limit` due records.
 *
 * Each claim is a single `findOneAndUpdate`, so two workers running the same
 * sweep can never claim the same record.
 */
export async function claimDueOutbox(
  options: NotificationDispatcherOptions & { now: Date; limit: number; workerId: string },
): Promise<OutboxDocument[]> {
  const claimed: OutboxDocument[] = [];

  for (let index = 0; index < options.limit; index += 1) {
    const filter: Record<string, unknown> = {
      status: { $in: ['pending', 'retry_scheduled'] },
      scheduledAt: { $lte: options.now },
      $or: [{ nextAttemptAt: null }, { nextAttemptAt: { $lte: options.now } }],
    };

    const document = await NotificationOutboxModel.findOneAndUpdate(
      filter,
      {
        $set: { status: 'processing', claimedAt: options.now, claimedBy: options.workerId },
        $inc: { attemptCount: 1 },
      },
      {
        sort: { scheduledAt: 1, _id: 1 },
        returnDocument: 'after',
        ...(options.session ? { session: options.session } : {}),
      },
    ).lean();

    if (!document) {
      break;
    }

    claimed.push(document as OutboxDocument);
  }

  return claimed;
}

function readPayload(payload: unknown): OutboxPayload {
  if (typeof payload !== 'object' || payload === null) {
    return {};
  }

  return payload as OutboxPayload;
}

function taskAssigneeMismatch(
  assignedUserId: mongoose.Types.ObjectId | null | undefined,
  recipientUserId: string,
): boolean {
  return !assignedUserId || assignedUserId.toString() !== recipientUserId;
}

/**
 * Re-check everything that can have changed since enqueue.
 *
 * Returns whether to send (with the resolved phone and parameter values) or to
 * suppress with a machine-readable reason. In-app notifications are unaffected.
 */
export async function revalidateOutbox(
  record: OutboxDocument,
  settings: ResolvedNotificationSettings,
  options: NotificationDispatcherOptions & { now: Date },
): Promise<RevalidationResult> {
  if (!settings.enabled) {
    return { action: 'suppress', reason: 'channel_disabled' };
  }

  if (settings.activatedAt && record.createdAt < settings.activatedAt) {
    return { action: 'suppress', reason: 'channel_disabled' };
  }

  const mapping = settings.templateMappings.find((entry) => entry.eventType === record.eventType);

  if (!mapping || !mapping.enabled) {
    return { action: 'suppress', reason: 'template_missing' };
  }

  if (!record.recipientUserId) {
    return { action: 'suppress', reason: 'no_recipient' };
  }

  const recipientUserId = record.recipientUserId.toString();
  const contact = await getUserWhatsAppContact(recipientUserId, options);

  if (!contact.optIn) {
    return { action: 'suppress', reason: 'no_consent' };
  }

  if (!contact.phone || !E164_PATTERN.test(contact.phone)) {
    return { action: 'suppress', reason: 'invalid_recipient' };
  }

  if (!contact.active) {
    return { action: 'suppress', reason: 'recipient_inactive' };
  }

  const payload = readPayload(record.payload);
  const values = payload.values;

  if (!values || Object.keys(values).length === 0) {
    return { action: 'suppress', reason: 'template_missing' };
  }

  if (record.taskId) {
    const task = await TaskModel.findById(record.taskId)
      .select({ status: 1, assignedUserId: 1, dueAt: 1 })
      .session(options.session ?? null)
      .lean();

    if (!task || task.status === 'done' || task.status === 'cancelled') {
      return { action: 'suppress', reason: 'task_no_longer_actionable' };
    }

    if (ASSIGNMENT_EVENT_TYPES.includes(record.eventType)) {
      if (taskAssigneeMismatch(task.assignedUserId, recipientUserId)) {
        return { action: 'suppress', reason: 'task_no_longer_actionable' };
      }
    }

    if (DEADLINE_EVENT_TYPES.includes(record.eventType)) {
      if (!task.dueAt) {
        return { action: 'suppress', reason: 'deadline_changed' };
      }

      if (payload.deadlineAt && payload.deadlineAt !== task.dueAt.toISOString()) {
        return { action: 'suppress', reason: 'deadline_changed' };
      }

      if (
        record.eventType !== 'task.overdue_escalation' &&
        taskAssigneeMismatch(task.assignedUserId, recipientUserId)
      ) {
        return { action: 'suppress', reason: 'task_no_longer_actionable' };
      }
    }
  }

  if (MEETING_NOTIFICATION_EVENT_TYPES.includes(record.eventType) || record.meetingId) {
    const meeting = await MeetingModel.findById(record.meetingId)
      .select({ status: 1, ownerUserId: 1, scheduleVersion: 1, startsAt: 1 })
      .session(options.session ?? null)
      .lean();

    if (!meeting || !isActiveMeetingStatus(meeting.status)) {
      return { action: 'suppress', reason: 'meeting_no_longer_actionable' };
    }

    if (meeting.ownerUserId.toString() !== recipientUserId) {
      return { action: 'suppress', reason: 'meeting_no_longer_actionable' };
    }

    if (
      payload.meetingScheduleVersion != null &&
      payload.meetingScheduleVersion !== meeting.scheduleVersion
    ) {
      return { action: 'suppress', reason: 'meeting_schedule_changed' };
    }

    if (
      record.eventType === 'meeting.reminder' &&
      meeting.startsAt.getTime() <= options.now.getTime()
    ) {
      return { action: 'suppress', reason: 'meeting_schedule_changed' };
    }
  }

  return { action: 'send', phone: contact.phone, values };
}

async function applyStatus(
  record: OutboxDocument,
  update: {
    status: NotificationOutboxStatus;
    suppressionReason?: NotificationSuppressionReason | null;
    providerMessageId?: string | null;
    nextAttemptAt?: Date | null;
    lastError?: string | null;
    sentAt?: Date;
    failedAt?: Date;
  },
  options: NotificationDispatcherOptions,
): Promise<void> {
  if (!canTransitionOutbox(record.status, update.status) && record.status !== update.status) {
    // Defensive: never apply an illegal transition.
    return;
  }

  await NotificationOutboxModel.updateOne(
    { _id: record._id },
    {
      $set: {
        status: update.status,
        claimedAt: null,
        claimedBy: null,
        suppressionReason: update.suppressionReason ?? null,
        ...(update.providerMessageId !== undefined
          ? { providerMessageId: update.providerMessageId }
          : {}),
        ...(update.nextAttemptAt !== undefined ? { nextAttemptAt: update.nextAttemptAt } : {}),
        ...(update.lastError !== undefined ? { lastError: update.lastError } : {}),
        ...(update.sentAt ? { sentAt: update.sentAt } : {}),
        ...(update.failedAt ? { failedAt: update.failedAt } : {}),
      },
    },
    options.session ? { session: options.session } : {},
  );

  await NotificationAttemptLogModel.create(
    [
      {
        outboxId: record._id,
        eventKey: record.eventKey,
        channel: record.channel,
        status: update.status,
        attempt: record.attemptCount,
        providerMessageId: update.providerMessageId ?? null,
        error: update.lastError ? update.lastError.slice(0, 500) : null,
        workerId: record.claimedBy ?? null,
      },
    ],
    options.session ? { session: options.session } : {},
  );
}

export interface DispatchOutcome {
  readonly status: NotificationOutboxStatus;
  readonly reason?: NotificationSuppressionReason;
}

/**
 * Dispatch one claimed record: revalidate, then send, retry, fail, or suppress.
 */
export async function dispatchOutboxRecord(
  record: OutboxDocument,
  deps: NotificationDispatchDeps,
): Promise<DispatchOutcome> {
  const now = deps.now ?? new Date();
  const options = { connection: deps.connection, session: deps.session };

  const decision = await revalidateOutbox(record, deps.settings, { ...options, now });

  if (decision.action === 'suppress') {
    const reason = decision.reason ?? 'channel_disabled';
    await applyStatus(
      record,
      { status: 'suppressed', suppressionReason: reason, nextAttemptAt: null },
      options,
    );
    return { status: 'suppressed', reason };
  }

  const definition = getTemplateDefinition(NOTIFICATION_EVENT_TEMPLATE[record.eventType]);
  const to = (decision.phone ?? '').replace(/[^\d]/g, '');

  try {
    const message = buildTemplateMessage(to, definition, decision.values ?? {});
    const result = await deps.provider.send(message);

    await applyStatus(
      record,
      {
        status: 'sent',
        providerMessageId: result.providerMessageId,
        nextAttemptAt: null,
        lastError: null,
        sentAt: result.acceptedAt,
      },
      options,
    );

    return { status: 'sent' };
  } catch (error) {
    const retryable = error instanceof WhatsAppProviderError ? error.retryable : true;
    const message = error instanceof Error ? error.message : 'Unknown dispatch error';

    if (retryable && record.attemptCount < NOTIFICATION_MAX_ATTEMPTS) {
      const nextAttemptAt = new Date(now.getTime() + computeBackoffMs(record.attemptCount));

      await applyStatus(
        record,
        { status: 'retry_scheduled', nextAttemptAt, lastError: message },
        options,
      );

      return { status: 'retry_scheduled' };
    }

    await applyStatus(
      record,
      { status: 'failed', failedAt: now, lastError: message, nextAttemptAt: null },
      options,
    );

    return { status: 'failed' };
  }
}

/** One full dispatch sweep: recover stale claims, claim due records, dispatch. */
export async function processDueNotifications(
  deps: NotificationDispatchDeps,
): Promise<DispatchSummary> {
  const now = deps.now ?? new Date();
  const leaseMs = deps.leaseMs ?? NOTIFICATION_CLAIM_LEASE_MS;
  const limit = deps.limit ?? 50;

  const recovered = await recoverStaleClaims({
    connection: deps.connection,
    session: deps.session,
    now,
    leaseMs,
  });

  const claimed = await claimDueOutbox({
    connection: deps.connection,
    session: deps.session,
    now,
    limit,
    workerId: deps.workerId,
  });

  let sent = 0;
  let suppressed = 0;
  let retried = 0;
  let failed = 0;

  for (const record of claimed) {
    const outcome = await dispatchOutboxRecord(record, deps);

    if (outcome.status === 'sent') {
      sent += 1;
    } else if (outcome.status === 'suppressed') {
      suppressed += 1;
    } else if (outcome.status === 'retry_scheduled') {
      retried += 1;
    } else {
      failed += 1;
    }
  }

  return { recovered, claimed: claimed.length, sent, suppressed, retried, failed };
}

/**
 * Manually requeue a failed record (Admin action).
 *
 * Only a `failed` record may be requeued; the new attempt is due immediately.
 */
export async function retryFailedNotification(
  outboxId: string,
  options: NotificationDispatcherOptions = {},
): Promise<boolean> {
  const id = new mongoose.Types.ObjectId(outboxId);
  const result = await NotificationOutboxModel.updateOne(
    { _id: id, status: 'failed' },
    { $set: { status: 'retry_scheduled', nextAttemptAt: new Date(), lastError: null } },
    options.session ? { session: options.session } : {},
  );

  return (result.modifiedCount ?? 0) > 0;
}

/** Apply a WhatsApp delivery status from a webhook, never regressing newer ones. */
export async function applyDeliveryConfirmation(
  input: {
    providerMessageId: string;
    status: 'sent' | 'delivered' | 'read' | 'failed';
    at: Date;
    errorCode?: string | null;
  },
  options: NotificationDispatcherOptions = {},
): Promise<boolean> {
  const doc = await NotificationOutboxModel.findOne({
    providerMessageId: input.providerMessageId,
  }).lean();

  if (!doc) {
    return false;
  }

  const rank: Record<string, number> = {
    pending: 0,
    processing: 0,
    retry_scheduled: 0,
    sent: 1,
    delivered: 2,
    read: 3,
    failed: 1,
    suppressed: 0,
    cancelled: 0,
  };

  if (input.status === 'failed') {
    if ((rank[doc.status] ?? 0) >= 2) {
      return false;
    }
  } else if ((rank[input.status] ?? 0) <= (rank[doc.status] ?? 0)) {
    return false;
  }

  const set: Record<string, unknown> = {};

  if (input.status === 'sent' && !doc.sentAt) {
    set.sentAt = input.at;
  }

  if (input.status === 'delivered') {
    set.status = 'delivered';
    set.deliveredAt = input.at;
  }

  if (input.status === 'read') {
    set.status = 'read';
    set.deliveredAt = doc.deliveredAt ?? input.at;
    set.readAt = input.at;
  }

  if (input.status === 'failed') {
    set.status = 'failed';
    set.failedAt = input.at;
    set.lastError = input.errorCode
      ? `Delivery failed (${input.errorCode})`.slice(0, 500)
      : 'Delivery failed';
  }

  if (input.status === 'sent') {
    set.status = 'sent';
  }

  await NotificationOutboxModel.updateOne(
    { _id: doc._id },
    { $set: set },
    options.session ? { session: options.session } : {},
  );

  return true;
}

export function resolveNotificationConnection(options: NotificationDispatcherOptions): Connection {
  return options.connection ?? getConnection();
}
