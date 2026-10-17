import {
  DEFAULT_MEETING_REMINDER_LEAD_MINUTES,
  DISPLAY_DATE_TIME_FORMAT,
  formatZonedDateTime,
  type NotificationEventType,
  type TemplateParameterValues,
} from '@interscale/shared';
import mongoose from 'mongoose';
import { getConnection } from '../connection';
import { BETTER_AUTH_USER_COLLECTION } from '../identity';
import { assertObjectId } from '../lib/object-id';
import { MeetingModel } from '../models/meeting';
import {
  buildMeetingEventKey,
  buildMeetingReminderEventKey,
  enqueueNotification,
  suppressMeetingNotifications,
  type EnqueueNotificationResult,
  type NotificationServiceOptions,
} from './notification.service';

/**
 * Meeting notification hooks (Phase 6, Step 34).
 *
 * Meetings reuse the Phase 5 transactional outbox — there is **no** separate
 * WhatsApp sending service. Scheduling a meeting records a `meeting.assigned`
 * intent plus a one-hour `meeting.reminder` intent; rescheduling invalidates the
 * old reminder and records a fresh `meeting.rescheduled` + reminder for the new
 * schedule version; cancellation/completion/reassignment suppress the rest.
 *
 * Every intent carries the meeting's `scheduleVersion` and start instant so the
 * dispatcher can re-check the live state (status, owner, version, start time)
 * before sending and suppress a stale reminder. Only the assigned Project
 * Manager (the owner) is ever a WhatsApp recipient; external client contacts are
 * out of MVP scope, and the in-app copy is always recorded.
 */

const MEETING_EVENT_TYPES: readonly NotificationEventType[] = [
  'meeting.assigned',
  'meeting.rescheduled',
  'meeting.reminder',
];

export type MeetingNotificationOptions = NotificationServiceOptions;

interface MeetingNotificationContext {
  meetingId: string;
  clientId: string;
  projectId: string | null;
  title: string;
  startsAt: Date;
  timezone: string;
  ownerUserId: string;
  scheduleVersion: number;
  status: string;
}

function collectionFor(options: NotificationServiceOptions) {
  return (options.connection ?? getConnection()).collection(BETTER_AUTH_USER_COLLECTION);
}

async function loadUserName(userId: string, options: NotificationServiceOptions): Promise<string> {
  const id = assertObjectId(userId, 'user');

  const document = await collectionFor(options).findOne(
    { _id: new mongoose.Types.ObjectId(id) },
    { projection: { name: 1 } },
  );

  return document && typeof document.name === 'string' ? document.name : '';
}

async function loadMeetingContext(
  meetingId: string,
  options: NotificationServiceOptions,
): Promise<MeetingNotificationContext | null> {
  const session = options.session ?? null;
  const meeting = await MeetingModel.findById(assertObjectId(meetingId, 'meeting'))
    .session(session)
    .lean();

  if (!meeting) {
    return null;
  }

  return {
    meetingId: meeting._id.toString(),
    clientId: meeting.clientId.toString(),
    projectId: meeting.projectId ? meeting.projectId.toString() : null,
    title: meeting.title,
    startsAt: meeting.startsAt,
    timezone: meeting.timezone,
    ownerUserId: meeting.ownerUserId.toString(),
    scheduleVersion: meeting.scheduleVersion,
    status: meeting.status,
  };
}

/** Template parameter values for every meeting event (same shape for all three). */
function meetingValues(
  context: MeetingNotificationContext,
  recipientName: string,
): TemplateParameterValues {
  return {
    employee_name: recipientName,
    meeting_title: context.title,
    meeting_time: formatZonedDateTime(context.startsAt, DISPLAY_DATE_TIME_FORMAT, context.timezone),
    url: `/meetings/${context.meetingId}`,
  };
}

function reminderScheduledAt(startsAt: Date): Date {
  return new Date(startsAt.getTime() - DEFAULT_MEETING_REMINDER_LEAD_MINUTES * 60_000);
}

async function enqueueMeetingEvent(
  context: MeetingNotificationContext,
  eventType: NotificationEventType,
  recipientUserId: string,
  scheduledAt: Date,
  options: MeetingNotificationOptions,
): Promise<EnqueueNotificationResult> {
  const recipientName = await loadUserName(recipientUserId, options);

  return enqueueNotification(
    {
      eventKey: buildMeetingEventKey(
        eventType,
        context.meetingId,
        context.scheduleVersion,
        recipientUserId,
      ),
      eventType,
      category: 'meeting',
      recipientUserId,
      recipientRole: 'manager',
      meetingId: context.meetingId,
      projectId: context.projectId,
      clientId: context.clientId,
      templateValues: meetingValues(context, recipientName),
      url: `/meetings/${context.meetingId}`,
      scheduledAt,
      meetingScheduleVersion: context.scheduleVersion,
      meetingStartsAt: context.startsAt,
      meetingOwnerUserId: context.ownerUserId,
    },
    options,
  );
}

/**
 * Record the assignment intent for a newly scheduled meeting's owner.
 *
 * The `meeting.reminder` intent is recorded separately by
 * {@link notifyMeetingReminder}; this keeps the "assigned now" and "remind an
 * hour before" messages independently cancellable.
 */
export async function notifyMeetingAssigned(
  meetingId: string,
  recipientUserId: string,
  options: MeetingNotificationOptions = {},
): Promise<EnqueueNotificationResult | null> {
  const context = await loadMeetingContext(meetingId, options);

  if (!context) {
    return null;
  }

  return enqueueMeetingEvent(context, 'meeting.assigned', recipientUserId, new Date(), options);
}

/** Record the reschedule intent for the meeting's current owner. */
export async function notifyMeetingRescheduled(
  meetingId: string,
  recipientUserId: string,
  options: MeetingNotificationOptions = {},
): Promise<EnqueueNotificationResult | null> {
  const context = await loadMeetingContext(meetingId, options);

  if (!context) {
    return null;
  }

  return enqueueMeetingEvent(context, 'meeting.rescheduled', recipientUserId, new Date(), options);
}

/**
 * Record the one-hour reminder intent for the meeting's owner.
 *
 * Scheduled for `startsAt - 60 minutes` through the outbox's persisted
 * `scheduledAt`, so the existing dispatch worker delivers it exactly on time and
 * a restart never loses it. Keyed by meeting + schedule version + start + owner
 * so a reschedule produces a new reminder while a repeat remains idempotent.
 */
export async function notifyMeetingReminder(
  meetingId: string,
  recipientUserId: string,
  options: MeetingNotificationOptions = {},
): Promise<EnqueueNotificationResult | null> {
  const context = await loadMeetingContext(meetingId, options);

  if (!context) {
    return null;
  }

  const recipientName = await loadUserName(recipientUserId, options);

  return enqueueNotification(
    {
      eventKey: buildMeetingReminderEventKey(
        context.meetingId,
        context.scheduleVersion,
        context.startsAt,
        recipientUserId,
      ),
      eventType: 'meeting.reminder',
      category: 'meeting',
      recipientUserId,
      recipientRole: 'manager',
      meetingId: context.meetingId,
      projectId: context.projectId,
      clientId: context.clientId,
      templateValues: meetingValues(context, recipientName),
      url: `/meetings/${context.meetingId}`,
      scheduledAt: reminderScheduledAt(context.startsAt),
      meetingScheduleVersion: context.scheduleVersion,
      meetingStartsAt: context.startsAt,
      meetingOwnerUserId: context.ownerUserId,
    },
    options,
  );
}

/** Record both the assignment and the one-hour reminder for a new meeting. */
export async function notifyMeetingScheduled(
  meetingId: string,
  recipientUserId: string,
  options: MeetingNotificationOptions = {},
): Promise<void> {
  await notifyMeetingAssigned(meetingId, recipientUserId, options);
  await notifyMeetingReminder(meetingId, recipientUserId, options);
}

/**
 * Invalidate every pending reminder/reschedule intent and record a fresh pair for
 * the new schedule version. Delivered/audited history is preserved.
 */
export async function notifyMeetingRescheduledWithReminder(
  meetingId: string,
  recipientUserId: string,
  options: MeetingNotificationOptions = {},
): Promise<void> {
  await suppressMeetingNotifications(
    meetingId,
    'meeting_schedule_changed',
    MEETING_EVENT_TYPES,
    options,
  );
  await notifyMeetingRescheduled(meetingId, recipientUserId, options);
  await notifyMeetingReminder(meetingId, recipientUserId, options);
}

/**
 * Suppress every outstanding WhatsApp intent for a meeting (terminal transition).
 *
 * The in-app copies are intentionally preserved: history stays, but reminders
 * that are no longer actionable are suppressed.
 */
export async function suppressMeetingOutstandingNotifications(
  meetingId: string,
  options: MeetingNotificationOptions = {},
): Promise<number> {
  return suppressMeetingNotifications(
    meetingId,
    'meeting_no_longer_actionable',
    MEETING_EVENT_TYPES,
    options,
  );
}
