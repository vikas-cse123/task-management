import {
  DEFAULT_DUE_SOON_LEAD_HOURS,
  DEFAULT_ESCALATION_AFTER_HOURS,
  DEFAULT_REVIEW_INTERVAL_DAYS,
  NOTIFICATION_EVENT_LABELS,
  NOTIFICATION_EVENT_TEMPLATE,
  NOTIFICATION_EVENT_TYPES,
  renderFallbackText,
  getTemplateDefinition,
  type NotificationCategory,
  type NotificationCenterQuery,
  type NotificationDeliveryStats,
  type NotificationEventType,
  type NotificationLogEntry,
  type NotificationLogQuery,
  type NotificationRecipientRole,
  type NotificationSuppressionReason,
  type NotificationTemplateMapping,
  type TemplateParameterValues,
  type UpdateNotificationSettingsInput,
  type UpdateNotificationTemplateMappingsInput,
} from '@interscale/shared';
import mongoose from 'mongoose';
import type { ClientSession, Connection } from 'mongoose';
import { getConnection } from '../connection';
import { BETTER_AUTH_USER_COLLECTION } from '../identity';
import { assertObjectId } from '../lib/object-id';
import { NotificationAttemptLogModel } from '../models/notification-attempt-log';
import { NotificationInboxModel } from '../models/notification-inbox';
import { NotificationOutboxModel } from '../models/notification-outbox';
import {
  NOTIFICATION_SETTING_SINGLETON_KEY,
  NotificationSettingModel,
  type NotificationTemplateMapping as NotificationTemplateMappingDoc,
} from '../models/notification-setting';
import { recordAudit } from './audit.service';

export interface NotificationServiceOptions {
  connection?: Connection;
  session?: ClientSession;
}

function sessionOption(options: NotificationServiceOptions): { session?: ClientSession } {
  return options.session ? { session: options.session } : {};
}

function connectionFor(options: NotificationServiceOptions): Connection {
  return options.connection ?? getConnection();
}

/**
 * Automatic deadline-reminder event types.
 *
 * These are the only events invalidated when a task reaches a terminal state
 * or its deadline changes.
 */
export const DEADLINE_EVENT_TYPES: readonly NotificationEventType[] = [
  'task.due_soon',
  'task.overdue',
  'task.overdue_escalation',
];

export interface ResolvedNotificationSettings {
  enabled: boolean;
  dueSoonLeadHours: number;
  escalationAfterHours: number;
  reviewIntervalDays: number;
  activatedAt: Date | null;
  templateMappings: NotificationTemplateMapping[];
  updatedBy: string | null;
  updatedAt: Date | null;
}

export function buildDefaultTemplateMappings(): NotificationTemplateMapping[] {
  return NOTIFICATION_EVENT_TYPES.map((eventType) => {
    const templateKey = NOTIFICATION_EVENT_TEMPLATE[eventType];
    const definition = getTemplateDefinition(templateKey);

    return {
      eventType,
      templateKey,
      templateName: definition.name,
      language: definition.language,
      enabled: true,
    };
  });
}

function toTemplateMapping(doc: NotificationTemplateMappingDoc): NotificationTemplateMapping {
  const definition = getTemplateDefinition(doc.templateKey);

  return {
    eventType: doc.eventType,
    templateKey: doc.templateKey,
    templateName: definition.name,
    language: definition.language,
    enabled: doc.enabled,
  };
}

function defaults(): ResolvedNotificationSettings {
  return {
    enabled: false,
    dueSoonLeadHours: DEFAULT_DUE_SOON_LEAD_HOURS,
    escalationAfterHours: DEFAULT_ESCALATION_AFTER_HOURS,
    reviewIntervalDays: DEFAULT_REVIEW_INTERVAL_DAYS,
    activatedAt: null,
    templateMappings: buildDefaultTemplateMappings(),
    updatedBy: null,
    updatedAt: null,
  };
}

/**
 * Read the singleton settings document, falling back to defaults.
 *
 * Never writes; a missing document is equivalent to "channel disabled with
 * default thresholds and the canonical template mappings".
 */
export async function getNotificationSettings(
  options: NotificationServiceOptions = {},
): Promise<ResolvedNotificationSettings> {
  const document = await NotificationSettingModel.findOne({
    key: NOTIFICATION_SETTING_SINGLETON_KEY,
  })
    .session(options.session ?? null)
    .lean();

  if (!document) {
    return defaults();
  }

  const mappings =
    document.templateMappings.length > 0
      ? document.templateMappings.map(toTemplateMapping)
      : buildDefaultTemplateMappings();

  return {
    enabled: document.enabled,
    dueSoonLeadHours: document.dueSoonLeadHours,
    escalationAfterHours: document.escalationAfterHours,
    reviewIntervalDays: document.reviewIntervalDays,
    activatedAt: document.activatedAt ?? null,
    templateMappings: mappings,
    updatedBy: document.updatedBy ? document.updatedBy.toString() : null,
    updatedAt: document.updatedAt instanceof Date ? document.updatedAt : null,
  };
}

/** Upsert the singleton settings document with defaults when absent. */
export async function ensureNotificationSettings(
  options: NotificationServiceOptions = {},
): Promise<ResolvedNotificationSettings> {
  await NotificationSettingModel.updateOne(
    { key: NOTIFICATION_SETTING_SINGLETON_KEY },
    {
      $setOnInsert: {
        key: NOTIFICATION_SETTING_SINGLETON_KEY,
        enabled: false,
        dueSoonLeadHours: DEFAULT_DUE_SOON_LEAD_HOURS,
        escalationAfterHours: DEFAULT_ESCALATION_AFTER_HOURS,
        reviewIntervalDays: DEFAULT_REVIEW_INTERVAL_DAYS,
        templateMappings: buildDefaultTemplateMappings(),
      },
    },
    { upsert: true, ...sessionOption(options) },
  );

  return getNotificationSettings(options);
}

export async function updateNotificationSettings(
  input: UpdateNotificationSettingsInput,
  actorId: string,
  options: NotificationServiceOptions = {},
): Promise<ResolvedNotificationSettings> {
  const actor = assertObjectId(actorId, 'actor');
  const current = await ensureNotificationSettings(options);

  const set: Record<string, unknown> = { updatedBy: actor };

  if (input.enabled !== undefined) {
    set.enabled = input.enabled;

    if (input.enabled && current.activatedAt === null) {
      set.activatedAt = new Date();
    }
  }

  if (input.dueSoonLeadHours !== undefined) {
    set.dueSoonLeadHours = input.dueSoonLeadHours;
  }

  if (input.escalationAfterHours !== undefined) {
    set.escalationAfterHours = input.escalationAfterHours;
  }

  if (input.reviewIntervalDays !== undefined) {
    set.reviewIntervalDays = input.reviewIntervalDays;
  }

  await NotificationSettingModel.updateOne(
    { key: NOTIFICATION_SETTING_SINGLETON_KEY },
    { $set: set },
    sessionOption(options),
  );

  await recordAudit({
    actorId: actor,
    action: 'notification.settings.update',
    entityType: 'notification_setting',
    entityId: new mongoose.Types.ObjectId().toString(),
    previousValue: {
      enabled: current.enabled,
      dueSoonLeadHours: current.dueSoonLeadHours,
      escalationAfterHours: current.escalationAfterHours,
      reviewIntervalDays: current.reviewIntervalDays,
    },
    newValue: input,
    notes: null,
    session: options.session,
  });

  return getNotificationSettings(options);
}

export async function updateNotificationTemplateMappings(
  input: UpdateNotificationTemplateMappingsInput,
  actorId: string,
  options: NotificationServiceOptions = {},
): Promise<ResolvedNotificationSettings> {
  const actor = assertObjectId(actorId, 'actor');
  const current = await ensureNotificationSettings(options);
  const byEvent = new Map(current.templateMappings.map((mapping) => [mapping.eventType, mapping]));

  for (const requested of input.mappings) {
    const definition = getTemplateDefinition(requested.templateKey);

    byEvent.set(requested.eventType, {
      eventType: requested.eventType,
      templateKey: requested.templateKey,
      templateName: definition.name,
      language: definition.language,
      enabled: requested.enabled,
    });
  }

  const templateMappings = [...byEvent.values()];

  await NotificationSettingModel.updateOne(
    { key: NOTIFICATION_SETTING_SINGLETON_KEY },
    { $set: { templateMappings, updatedBy: actor } },
    sessionOption(options),
  );

  await recordAudit({
    actorId: actor,
    action: 'notification.template_mapping.update',
    entityType: 'notification_template_mapping',
    entityId: new mongoose.Types.ObjectId().toString(),
    previousValue: { mappings: current.templateMappings },
    newValue: { mappings: templateMappings },
    notes: null,
    session: options.session,
  });

  return getNotificationSettings(options);
}

export interface WhatsAppContact {
  readonly phone: string | null;
  readonly optIn: boolean;
  readonly optInAt: Date | null;
  /** False only when the account is explicitly marked inactive (Phase 6, Step 34). */
  readonly active: boolean;
}

/**
 * Read the live WhatsApp contact for a user.
 *
 * Called at dispatch time so opt-out, number changes and deactivation take
 * effect immediately, even for a notification recorded earlier.
 */
export async function getUserWhatsAppContact(
  userId: string,
  options: NotificationServiceOptions = {},
): Promise<WhatsAppContact> {
  const id = assertObjectId(userId, 'user');

  const document = await connectionFor(options)
    .collection(BETTER_AUTH_USER_COLLECTION)
    .findOne(
      { _id: new mongoose.Types.ObjectId(id) },
      { projection: { whatsappNumber: 1, whatsappOptIn: 1, whatsappOptInAt: 1, status: 1 } },
    );

  if (!document) {
    return { phone: null, optIn: false, optInAt: null, active: false };
  }

  const phone = typeof document.whatsappNumber === 'string' ? document.whatsappNumber : null;
  const optIn = document.whatsappOptIn === true;
  const optInAt = document.whatsappOptInAt instanceof Date ? document.whatsappOptInAt : null;
  const active = document.status !== 'inactive';

  return { phone, optIn, optInAt, active };
}

export interface NotificationPayloadContext {
  /** ISO timestamp of the deadline a reminder refers to (deadline events). */
  readonly deadlineAt?: Date | null;
  /** Assignee snapshot used to revalidate assignment events. */
  readonly assignedUserId?: string | null;
  /** Meeting a `meeting.*` intent refers to, plus its revalidation snapshot. */
  readonly meetingId?: string | null;
  readonly meetingScheduleVersion?: number | null;
  readonly meetingStartsAt?: Date | null;
  readonly meetingOwnerUserId?: string | null;
}

export interface EnqueueNotificationInput extends NotificationPayloadContext {
  readonly eventKey: string;
  readonly eventType: NotificationEventType;
  readonly category: NotificationCategory;
  readonly recipientUserId: string;
  readonly recipientRole: NotificationRecipientRole;
  readonly recipientPhone?: string | null;
  readonly taskId?: string | null;
  readonly projectId?: string | null;
  readonly clientId?: string | null;
  readonly templateValues: TemplateParameterValues;
  readonly url?: string | null;
  readonly scheduledAt?: Date;
}

export interface EnqueueNotificationResult {
  readonly inboxId: string | null;
  readonly outboxId: string | null;
  readonly whatsappQueued: boolean;
  /** True when a new in-app notification row was created (false on duplicate). */
  readonly created: boolean;
}

function optionalObjectId(
  value: string | null | undefined,
  label: string,
): mongoose.Types.ObjectId | null {
  if (value === null || value === undefined) {
    return null;
  }

  return new mongoose.Types.ObjectId(assertObjectId(value, label));
}

/**
 * Record a notification intent durably.
 *
 * The in-app copy is always written. The WhatsApp outbox record is written only
 * when the channel is enabled and the event is mapped to an enabled template —
 * so a disabled channel never accrues a suppressed backlog. Both writes join
 * the caller's transaction and are idempotent through their unique indexes.
 */
export async function enqueueNotification(
  input: EnqueueNotificationInput,
  options: NotificationServiceOptions = {},
): Promise<EnqueueNotificationResult> {
  const recipientUserId = assertObjectId(input.recipientUserId, 'recipient');
  const definition = getTemplateDefinition(NOTIFICATION_EVENT_TEMPLATE[input.eventType]);
  const title = NOTIFICATION_EVENT_LABELS[input.eventType];
  const body = renderFallbackText(definition, input.templateValues);
  const url = input.url ?? null;
  const taskId = optionalObjectId(input.taskId, 'task');
  const projectId = optionalObjectId(input.projectId, 'project');
  const clientId = optionalObjectId(input.clientId, 'client');
  const meetingId = optionalObjectId(input.meetingId, 'meeting');
  const recipient = new mongoose.Types.ObjectId(recipientUserId);
  const createOptions = options.session ? { session: options.session } : {};

  const inbox = await upsertInbox({
    recipientUserId: recipient,
    eventKey: input.eventKey,
    eventType: input.eventType,
    category: input.category,
    title,
    body,
    url,
    taskId,
    projectId,
    clientId,
    createOptions,
    session: options.session,
  });

  const settings = await getNotificationSettings(options);
  const mapping = settings.templateMappings.find((entry) => entry.eventType === input.eventType);
  const whatsappEnabled = settings.enabled && (mapping?.enabled ?? true);

  if (!whatsappEnabled) {
    return { inboxId: inbox.id, outboxId: null, whatsappQueued: false, created: inbox.created };
  }

  const outboxId = await insertOutbox({
    eventKey: input.eventKey,
    eventType: input.eventType,
    category: input.category,
    recipientUserId: recipient,
    recipientRole: input.recipientRole,
    recipientPhone: input.recipientPhone ?? null,
    taskId,
    projectId,
    clientId,
    meetingId,
    payload: {
      values: input.templateValues,
      deadlineAt: input.deadlineAt ? input.deadlineAt.toISOString() : null,
      assignedUserId: input.assignedUserId ?? null,
      meetingId: input.meetingId ?? null,
      meetingScheduleVersion: input.meetingScheduleVersion ?? null,
      meetingStartsAt: input.meetingStartsAt ? input.meetingStartsAt.toISOString() : null,
      meetingOwnerUserId: input.meetingOwnerUserId ?? null,
    },
    scheduledAt: input.scheduledAt ?? new Date(),
    createOptions,
  });

  return { inboxId: inbox.id, outboxId, whatsappQueued: outboxId !== null, created: inbox.created };
}

async function upsertInbox(input: {
  recipientUserId: mongoose.Types.ObjectId;
  eventKey: string;
  eventType: NotificationEventType;
  category: NotificationCategory;
  title: string;
  body: string;
  url: string | null;
  taskId: mongoose.Types.ObjectId | null;
  projectId: mongoose.Types.ObjectId | null;
  clientId: mongoose.Types.ObjectId | null;
  createOptions: { session?: ClientSession };
  session: ClientSession | undefined;
}): Promise<{ id: string | null; created: boolean }> {
  try {
    const [created] = await NotificationInboxModel.create(
      [
        {
          recipientUserId: input.recipientUserId,
          eventKey: input.eventKey,
          eventType: input.eventType,
          category: input.category,
          title: input.title,
          body: input.body,
          url: input.url,
          taskId: input.taskId,
          projectId: input.projectId,
          clientId: input.clientId,
          readAt: null,
        },
      ],
      input.createOptions,
    );

    return { id: created ? created._id.toString() : null, created: created !== undefined };
  } catch (error) {
    if (isDuplicateKey(error)) {
      const existing = await NotificationInboxModel.findOne({
        recipientUserId: input.recipientUserId,
        eventKey: input.eventKey,
      })
        .session(input.session ?? null)
        .lean();

      return { id: existing ? existing._id.toString() : null, created: false };
    }

    throw error;
  }
}

async function insertOutbox(input: {
  eventKey: string;
  eventType: NotificationEventType;
  category: NotificationCategory;
  recipientUserId: mongoose.Types.ObjectId;
  recipientRole: NotificationRecipientRole;
  recipientPhone: string | null;
  taskId: mongoose.Types.ObjectId | null;
  projectId: mongoose.Types.ObjectId | null;
  clientId: mongoose.Types.ObjectId | null;
  meetingId: mongoose.Types.ObjectId | null;
  payload: Record<string, unknown>;
  scheduledAt: Date;
  createOptions: { session?: ClientSession };
}): Promise<string | null> {
  try {
    const [created] = await NotificationOutboxModel.create(
      [
        {
          eventKey: input.eventKey,
          eventType: input.eventType,
          channel: 'whatsapp',
          status: 'pending',
          category: input.category,
          recipientUserId: input.recipientUserId,
          recipientRole: input.recipientRole,
          recipientPhone: input.recipientPhone,
          taskId: input.taskId,
          projectId: input.projectId,
          clientId: input.clientId,
          meetingId: input.meetingId,
          payload: input.payload,
          scheduledAt: input.scheduledAt,
        },
      ],
      input.createOptions,
    );

    return created ? created._id.toString() : null;
  } catch (error) {
    if (isDuplicateKey(error)) {
      return null;
    }

    throw error;
  }
}

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 11000
  );
}

export function buildTaskAssignmentEventKey(
  eventType: NotificationEventType,
  taskId: string,
  version: number,
  recipientUserId: string,
): string {
  return `${eventType}:${taskId}:v${version}:${recipientUserId}`;
}

export function buildTaskDeadlineEventKey(
  eventType: NotificationEventType,
  taskId: string,
  deadlineAt: Date,
  recipientUserId: string,
): string {
  return `${eventType}:${taskId}:d${deadlineAt.getTime()}:${recipientUserId}`;
}

export function buildCampaignReviewEventKey(
  projectId: string,
  periodKey: string,
  recipientUserId: string,
): string {
  return `campaign.review_due:${projectId}:${periodKey}:${recipientUserId}`;
}

/**
 * Idempotency key for a meeting lifecycle event (Phase 6, Step 34).
 *
 * Keyed by the meeting's `scheduleVersion`, so a reschedule (which increments
 * the version) yields a fresh intent while a repeated create/update at the same
 * version de-duplicates.
 */
export function buildMeetingEventKey(
  eventType: NotificationEventType,
  meetingId: string,
  scheduleVersion: number,
  recipientUserId: string,
): string {
  return `${eventType}:${meetingId}:v${scheduleVersion}:${recipientUserId}`;
}

/**
 * Idempotency key for a one-hour meeting reminder.
 *
 * Includes both the schedule version and the start instant so a reminder can
 * never be replayed across a reschedule, and a repeated sweep cannot duplicate
 * the current version's reminder.
 */
export function buildMeetingReminderEventKey(
  meetingId: string,
  scheduleVersion: number,
  startsAt: Date,
  recipientUserId: string,
): string {
  return `meeting.reminder:${meetingId}:v${scheduleVersion}:s${startsAt.getTime()}:${recipientUserId}`;
}

/**
 * Suppress pending WhatsApp notifications for a task.
 *
 * When `eventTypes` is omitted every pending assignment reminder is included;
 * callers pass `DEADLINE_EVENT_TYPES` to invalidate only reminders.
 */
export async function suppressTaskNotifications(
  taskId: string,
  reason: NotificationSuppressionReason,
  eventTypes: readonly NotificationEventType[] | null,
  options: NotificationServiceOptions = {},
): Promise<number> {
  const filter: Record<string, unknown> = {
    taskId: new mongoose.Types.ObjectId(assertObjectId(taskId, 'task')),
    status: { $in: ['pending', 'retry_scheduled'] },
  };

  if (eventTypes && eventTypes.length > 0) {
    filter.eventType = { $in: [...eventTypes] };
  }

  const result = await NotificationOutboxModel.updateMany(
    filter,
    { $set: { status: 'suppressed', suppressionReason: reason, nextAttemptAt: null } },
    sessionOption(options),
  );

  return result.modifiedCount ?? 0;
}

/** Suppress pending deadline reminders for a terminal or re-deadlined task. */
export async function suppressTaskDeadlineNotifications(
  taskId: string,
  reason: NotificationSuppressionReason = 'task_no_longer_actionable',
  options: NotificationServiceOptions = {},
): Promise<number> {
  return suppressTaskNotifications(taskId, reason, DEADLINE_EVENT_TYPES, options);
}

/**
 * Suppress pending WhatsApp notifications for a meeting (Phase 6, Step 34).
 *
 * Called when a meeting is rescheduled, cancelled, completed or reassigned so a
 * stale reminder can never be delivered. Delivered/audited history is preserved;
 * only `pending` and `retry_scheduled` records are touched. When `eventTypes` is
 * omitted every outstanding meeting intent is included.
 */
export async function suppressMeetingNotifications(
  meetingId: string,
  reason: NotificationSuppressionReason,
  eventTypes: readonly NotificationEventType[] | null,
  options: NotificationServiceOptions = {},
): Promise<number> {
  const filter: Record<string, unknown> = {
    meetingId: new mongoose.Types.ObjectId(assertObjectId(meetingId, 'meeting')),
    status: { $in: ['pending', 'retry_scheduled'] },
  };

  if (eventTypes && eventTypes.length > 0) {
    filter.eventType = { $in: [...eventTypes] };
  }

  const result = await NotificationOutboxModel.updateMany(
    filter,
    { $set: { status: 'suppressed', suppressionReason: reason, nextAttemptAt: null } },
    sessionOption(options),
  );

  return result.modifiedCount ?? 0;
}

export interface InAppNotificationView {
  readonly id: string;
  readonly eventType: NotificationEventType;
  readonly category: NotificationCategory;
  readonly title: string;
  readonly body: string;
  readonly url: string | null;
  readonly taskId: string | null;
  readonly projectId: string | null;
  readonly clientId: string | null;
  readonly readAt: string | null;
  readonly createdAt: string;
}

export interface InAppNotificationPage {
  readonly data: InAppNotificationView[];
  readonly nextCursor: string | null;
}

function toInAppView(doc: {
  _id: mongoose.Types.ObjectId;
  eventType: NotificationEventType;
  category: NotificationCategory;
  title: string;
  body: string;
  url: string | null;
  taskId: mongoose.Types.ObjectId | null;
  projectId: mongoose.Types.ObjectId | null;
  clientId: mongoose.Types.ObjectId | null;
  readAt: Date | null;
  createdAt: Date;
}): InAppNotificationView {
  return {
    id: doc._id.toString(),
    eventType: doc.eventType,
    category: doc.category,
    title: doc.title,
    body: doc.body,
    url: doc.url ?? null,
    taskId: doc.taskId ? doc.taskId.toString() : null,
    projectId: doc.projectId ? doc.projectId.toString() : null,
    clientId: doc.clientId ? doc.clientId.toString() : null,
    readAt: doc.readAt instanceof Date ? doc.readAt.toISOString() : null,
    createdAt:
      doc.createdAt instanceof Date ? doc.createdAt.toISOString() : new Date(0).toISOString(),
  };
}

export async function listInAppNotifications(
  userId: string,
  query: NotificationCenterQuery,
  options: NotificationServiceOptions = {},
): Promise<InAppNotificationPage> {
  const recipientUserId = new mongoose.Types.ObjectId(assertObjectId(userId, 'user'));
  const filter: Record<string, unknown> = { recipientUserId };

  if (query.unreadOnly) {
    filter.readAt = null;
  }

  if (query.category) {
    filter.category = query.category;
  }

  if (query.eventType) {
    filter.eventType = query.eventType;
  }

  if (query.cursor) {
    filter._id = { $lt: new mongoose.Types.ObjectId(query.cursor) };
  }

  const documents = await NotificationInboxModel.find(filter)
    .sort({ _id: -1 })
    .limit(query.limit + 1)
    .session(options.session ?? null)
    .lean();

  const hasMore = documents.length > query.limit;
  const page = hasMore ? documents.slice(0, query.limit) : documents;
  const last = page[page.length - 1];

  return {
    data: page.map((doc) => toInAppView(doc as unknown as Parameters<typeof toInAppView>[0])),
    nextCursor: hasMore && last ? last._id.toString() : null,
  };
}

export async function getUnreadInAppCount(
  userId: string,
  options: NotificationServiceOptions = {},
): Promise<number> {
  return NotificationInboxModel.countDocuments({
    recipientUserId: new mongoose.Types.ObjectId(assertObjectId(userId, 'user')),
    readAt: null,
  }).session(options.session ?? null);
}

export async function markInAppNotificationRead(
  userId: string,
  notificationId: string,
  options: NotificationServiceOptions = {},
): Promise<boolean> {
  const result = await NotificationInboxModel.updateOne(
    {
      _id: new mongoose.Types.ObjectId(assertObjectId(notificationId, 'notification')),
      recipientUserId: new mongoose.Types.ObjectId(assertObjectId(userId, 'user')),
    },
    { $set: { readAt: new Date() } },
    sessionOption(options),
  );

  return (result.modifiedCount ?? 0) > 0;
}

export async function markAllInAppNotificationsRead(
  userId: string,
  options: NotificationServiceOptions = {},
): Promise<number> {
  const result = await NotificationInboxModel.updateMany(
    { recipientUserId: new mongoose.Types.ObjectId(assertObjectId(userId, 'user')), readAt: null },
    { $set: { readAt: new Date() } },
    sessionOption(options),
  );

  return result.modifiedCount ?? 0;
}

export interface NotificationLogPage {
  readonly data: NotificationLogEntry[];
  readonly nextCursor: string | null;
}

function toLogEntry(doc: {
  _id: mongoose.Types.ObjectId;
  eventType: NotificationEventType;
  channel: NotificationLogEntry['channel'];
  status: NotificationLogEntry['status'];
  recipientRole: NotificationRecipientRole;
  recipientUserId: mongoose.Types.ObjectId | null;
  taskId: mongoose.Types.ObjectId | null;
  projectId: mongoose.Types.ObjectId | null;
  clientId: mongoose.Types.ObjectId | null;
  attemptCount: number;
  providerMessageId: string | null;
  suppressionReason: NotificationSuppressionReason | null;
  lastError: string | null;
  scheduledAt: Date;
  sentAt: Date | null;
  deliveredAt: Date | null;
  readAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): NotificationLogEntry {
  const iso = (value: Date | null): string | null =>
    value instanceof Date ? value.toISOString() : null;

  return {
    id: doc._id.toString(),
    eventType: doc.eventType,
    channel: doc.channel,
    status: doc.status,
    recipientRole: doc.recipientRole,
    recipientUserId: doc.recipientUserId ? doc.recipientUserId.toString() : null,
    taskId: doc.taskId ? doc.taskId.toString() : null,
    projectId: doc.projectId ? doc.projectId.toString() : null,
    clientId: doc.clientId ? doc.clientId.toString() : null,
    attemptCount: doc.attemptCount,
    providerMessageId: doc.providerMessageId ?? null,
    suppressionReason: doc.suppressionReason ?? null,
    lastError: doc.lastError ?? null,
    scheduledAt: iso(doc.scheduledAt) ?? new Date(0).toISOString(),
    sentAt: iso(doc.sentAt),
    deliveredAt: iso(doc.deliveredAt),
    readAt: iso(doc.readAt),
    createdAt: iso(doc.createdAt) ?? new Date(0).toISOString(),
    updatedAt: iso(doc.updatedAt) ?? new Date(0).toISOString(),
  };
}

export async function listNotificationLog(
  query: NotificationLogQuery,
  options: NotificationServiceOptions = {},
): Promise<NotificationLogPage> {
  const filter: Record<string, unknown> = {};

  if (query.status) {
    filter.status = query.status;
  }

  if (query.eventType) {
    filter.eventType = query.eventType;
  }

  if (query.channel) {
    filter.channel = query.channel;
  }

  if (query.clientId) {
    filter.clientId = new mongoose.Types.ObjectId(query.clientId);
  }

  if (query.projectId) {
    filter.projectId = new mongoose.Types.ObjectId(query.projectId);
  }

  if (query.recipientUserId) {
    filter.recipientUserId = new mongoose.Types.ObjectId(query.recipientUserId);
  }

  if (query.cursor) {
    filter._id = { $lt: new mongoose.Types.ObjectId(query.cursor) };
  }

  const documents = await NotificationOutboxModel.find(filter)
    .sort({ _id: -1 })
    .limit(query.limit + 1)
    .session(options.session ?? null)
    .lean();

  const hasMore = documents.length > query.limit;
  const page = hasMore ? documents.slice(0, query.limit) : documents;
  const last = page[page.length - 1];

  return {
    data: page.map((doc) => toLogEntry(doc as unknown as Parameters<typeof toLogEntry>[0])),
    nextCursor: hasMore && last ? last._id.toString() : null,
  };
}

export async function notificationDeliveryStats(
  options: NotificationServiceOptions = {},
): Promise<NotificationDeliveryStats> {
  const session = options.session ?? null;
  const counts = await NotificationOutboxModel.aggregate<{ _id: string; count: number }>([
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]).session(session);

  const byStatus = new Map(counts.map((entry) => [entry._id, entry.count]));
  const unreadInApp = await NotificationInboxModel.countDocuments({ readAt: null }).session(
    session,
  );

  return {
    pending: byStatus.get('pending') ?? 0,
    processing: byStatus.get('processing') ?? 0,
    sent: byStatus.get('sent') ?? 0,
    delivered: byStatus.get('delivered') ?? 0,
    read: byStatus.get('read') ?? 0,
    retryScheduled: byStatus.get('retry_scheduled') ?? 0,
    failed: byStatus.get('failed') ?? 0,
    suppressed: byStatus.get('suppressed') ?? 0,
    unreadInApp,
  };
}

export interface NotificationAttemptInput {
  outboxId: string;
  eventKey: string;
  channel: NotificationLogEntry['channel'];
  status: NotificationLogEntry['status'];
  attempt: number;
  providerMessageId?: string | null;
  error?: string | null;
  workerId?: string | null;
}

export async function recordNotificationAttempt(
  input: NotificationAttemptInput,
  options: NotificationServiceOptions = {},
): Promise<void> {
  await NotificationAttemptLogModel.create(
    [
      {
        outboxId: new mongoose.Types.ObjectId(assertObjectId(input.outboxId, 'outbox')),
        eventKey: input.eventKey,
        channel: input.channel,
        status: input.status,
        attempt: input.attempt,
        providerMessageId: input.providerMessageId ?? null,
        error: input.error ? input.error.slice(0, 500) : null,
        workerId: input.workerId ?? null,
      },
    ],
    sessionOption(options),
  );
}

/** Whether a template key is one of the approved templates. */
export function isApprovedTemplateKey(value: string): boolean {
  return Object.values(NOTIFICATION_EVENT_TEMPLATE).includes(value as never);
}
