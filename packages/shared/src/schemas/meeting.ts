import { z } from 'zod';
import { DEFAULT_TIMEZONE } from '../constants';
import {
  CALENDAR_DATE_PATTERN,
  CLOCK_TIME_PATTERN,
  isCalendarDate,
  isClockTime,
  isValidTimeZone,
  zonedDateTimeToUtc,
} from '../datetime';
import { MEETING_ACTION_ITEM_STATUSES, MEETING_STATUSES } from '../enums/meeting';
import { DEFAULT_TASK_PRIORITY, TASK_PRIORITIES } from '../enums/task-priority';
import { TASK_STATUSES } from '../enums/task-status';
import { longTextSchema, objectIdSchema, shortTextSchema } from './primitives';
import { paginationQuerySchema } from './pagination';

/**
 * Meeting contracts (Phase 6, Step 31).
 *
 * A meeting is an independent record: it is never a task. Tasks may be linked
 * later through action items only. Timestamps are submitted as an IST wall-clock
 * `date` (`YYYY-MM-DD`) plus `startTime`/`endTime` (24-hour `HH:mm`), and the
 * service converts them to UTC for storage. The `timezone` defaults to
 * Asia/Kolkata and is not user-selectable (the team is India-based).
 */

const meetingTitleSchema = shortTextSchema.max(200);
const meetingAgendaSchema = z.string().trim().max(5000);
const meetingUrlSchema = z.string().trim().url().max(2000);
const meetingLocationSchema = z.string().trim().max(300);
const decisionTextSchema = z.string().trim().min(1).max(2000);
const actionItemTitleSchema = z.string().trim().min(1).max(200);
const actionItemDescriptionSchema = z.string().trim().max(2000);
const dateTimeSchema = z.string().datetime({ offset: true });
const timeZoneSchema = z.string().trim().min(1).max(64);
const calendarDateSchema = z.string().regex(CALENDAR_DATE_PATTERN, 'Use YYYY-MM-DD');
const clockTimeSchema = z.string().regex(CLOCK_TIME_PATTERN, 'Use 24-hour HH:mm');

/** Reusable schedule fields present on create and reschedule payloads. */
const scheduleFields = {
  date: calendarDateSchema,
  startTime: clockTimeSchema,
  endTime: clockTimeSchema,
  timezone: timeZoneSchema.default(DEFAULT_TIMEZONE),
};

interface ScheduleShape {
  date: string;
  startTime: string;
  endTime: string;
  timezone: string;
}

/** Validate a schedule: real calendar date, known timezone, end after start. */
function refineSchedule(value: ScheduleShape, ctx: z.RefinementCtx): void {
  if (!isValidTimeZone(value.timezone)) {
    ctx.addIssue({ code: 'custom', path: ['timezone'], message: 'Unknown timezone' });
    return;
  }

  if (!isCalendarDate(value.date)) {
    ctx.addIssue({ code: 'custom', path: ['date'], message: 'Not a real calendar date' });
    return;
  }

  if (!isClockTime(value.startTime) || !isClockTime(value.endTime)) {
    return;
  }

  const start = zonedDateTimeToUtc(value.date, value.startTime, value.timezone);
  const end = zonedDateTimeToUtc(value.date, value.endTime, value.timezone);

  if (end.getTime() <= start.getTime()) {
    ctx.addIssue({
      code: 'custom',
      path: ['endTime'],
      message: 'End time must be later than the start time',
    });
  }
}

/** Reject duplicate attendee entries. */
function refineUniqueAttendees(value: { attendeeUserIds?: string[] }, ctx: z.RefinementCtx): void {
  const ids = value.attendeeUserIds;

  if (!ids) {
    return;
  }

  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({
      code: 'custom',
      path: ['attendeeUserIds'],
      message: 'Attendees must be unique',
    });
  }
}

/** Create a meeting (schedule + optional project, attendees, link/location). */
export const createMeetingInputSchema = z
  .object({
    clientId: objectIdSchema,
    projectId: objectIdSchema.nullable().default(null),
    title: meetingTitleSchema,
    agenda: meetingAgendaSchema.nullable().default(null),
    ownerUserId: objectIdSchema,
    attendeeUserIds: z.array(objectIdSchema).max(100).default([]),
    meetingUrl: meetingUrlSchema.nullable().default(null),
    location: meetingLocationSchema.nullable().default(null),
    ...scheduleFields,
  })
  .superRefine((value, ctx) => {
    refineSchedule(value, ctx);
    refineUniqueAttendees(value, ctx);
  });

export type CreateMeetingInput = z.infer<typeof createMeetingInputSchema>;

/**
 * Update meeting content. The schedule is changed only through reschedule, so
 * `date`/`startTime`/`endTime` are intentionally absent here.
 */
export const updateMeetingInputSchema = z
  .object({
    title: meetingTitleSchema.optional(),
    agenda: meetingAgendaSchema.nullable().optional(),
    ownerUserId: objectIdSchema.optional(),
    attendeeUserIds: z.array(objectIdSchema).max(100).optional(),
    meetingUrl: meetingUrlSchema.nullable().optional(),
    location: meetingLocationSchema.nullable().optional(),
    /** Discussion notes (Step 33.2): plain textarea content. */
    discussionNotes: longTextSchema.nullable().optional(),
    /** Explicit decisions (Step 33.3), stored as a clearly separated list. */
    decisions: z.array(decisionTextSchema).max(100).optional(),
    expectedVersion: z.number().int().min(0).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  })
  .superRefine(refineUniqueAttendees);

export type UpdateMeetingInput = z.infer<typeof updateMeetingInputSchema>;

/** Reschedule a meeting: replaces the schedule, retains the meeting identity. */
export const rescheduleMeetingInputSchema = z
  .object({
    ...scheduleFields,
    reason: z.string().trim().max(1000).nullable().default(null),
    expectedVersion: z.number().int().min(0).optional(),
  })
  .superRefine(refineSchedule);

export type RescheduleMeetingInput = z.infer<typeof rescheduleMeetingInputSchema>;

/** Cancel a meeting. A reason is required and recorded in history. */
export const cancelMeetingInputSchema = z.object({
  reason: z.string().trim().min(1).max(1000),
  expectedVersion: z.number().int().min(0).optional(),
});

export type CancelMeetingInput = z.infer<typeof cancelMeetingInputSchema>;

/** Complete a meeting (no content changes; notes/decisions are recorded separately). */
export const completeMeetingInputSchema = z.object({
  expectedVersion: z.number().int().min(0).optional(),
});

export type CompleteMeetingInput = z.infer<typeof completeMeetingInputSchema>;

/** List/filter query for meetings (cursor pagination + filters). */
export const meetingListQuerySchema = paginationQuerySchema.extend({
  clientId: objectIdSchema.optional(),
  projectId: objectIdSchema.optional(),
  ownerUserId: objectIdSchema.optional(),
  status: z.enum(MEETING_STATUSES).optional(),
  /** Inclusive UTC lower bound on `startsAt`. */
  from: z.string().datetime({ offset: true }).optional(),
  /** Exclusive UTC upper bound on `startsAt`. */
  to: z.string().datetime({ offset: true }).optional(),
  /** Convenience filter for a single IST calendar day (`YYYY-MM-DD`). */
  date: calendarDateSchema.optional(),
  search: z.string().trim().max(200).optional(),
});

export type MeetingListQuery = z.infer<typeof meetingListQuerySchema>;

/**
 * Sanitized meeting record returned by the API.
 *
 * `clientName`, `projectName` and `ownerName` are display-only enrichments
 * resolved server-side within the caller's scope. They are always `null` on
 * write responses (which the UI refetches); list/detail reads populate them so
 * non-admin users never need an employee-directory endpoint to resolve names.
 */
export const meetingSummarySchema = z.object({
  id: objectIdSchema,
  clientId: objectIdSchema,
  clientName: z.string().nullable().default(null),
  projectId: objectIdSchema.nullable(),
  projectName: z.string().nullable().default(null),
  title: meetingTitleSchema,
  agenda: z.string().nullable(),
  startsAt: z.string(),
  endsAt: z.string(),
  timezone: z.string(),
  ownerUserId: objectIdSchema,
  ownerName: z.string().nullable().default(null),
  attendeeUserIds: z.array(objectIdSchema),
  meetingUrl: z.string().nullable(),
  location: z.string().nullable(),
  status: z.enum(MEETING_STATUSES),
  hasNotes: z.boolean(),
  /** Derived: completed meeting that still has no discussion notes (Step 33.12). */
  needsNotes: z.boolean(),
  scheduleVersion: z.number().int().min(1),
  createdBy: z.string().nullable(),
  updatedBy: z.string().nullable(),
  version: z.number().int().min(0),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type MeetingSummary = z.infer<typeof meetingSummarySchema>;

/** A resolved meeting participant (owner or attendee) for display. */
export const meetingParticipantSchema = z.object({
  userId: objectIdSchema,
  name: z.string(),
});

export type MeetingParticipant = z.infer<typeof meetingParticipantSchema>;

/** Meeting detail (summary + notes, decisions and lifecycle timestamps). */
export const meetingDetailSchema = meetingSummarySchema.extend({
  discussionNotes: z.string().nullable(),
  decisions: z.array(z.string()),
  /** Resolved names for the owner and every attendee (display only). */
  attendeeNames: z.array(meetingParticipantSchema).default([]),
  completedAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  cancellationReason: z.string().nullable(),
  rescheduledAt: z.string().nullable(),
});

export type MeetingDetail = z.infer<typeof meetingDetailSchema>;

/** Calendar-compatible meeting entry (Step 32 `calendar` view). */
export const meetingCalendarEntrySchema = z.object({
  id: objectIdSchema,
  title: meetingTitleSchema,
  clientId: objectIdSchema,
  clientName: z.string().nullable(),
  projectId: objectIdSchema.nullable(),
  projectName: z.string().nullable(),
  ownerUserId: objectIdSchema,
  ownerName: z.string().nullable(),
  startsAt: z.string(),
  endsAt: z.string(),
  timezone: z.string(),
  status: z.enum(MEETING_STATUSES),
});

export type MeetingCalendarEntry = z.infer<typeof meetingCalendarEntrySchema>;

/** Calendar query: a UTC range plus optional filters (Step 32 `calendar` view). */
export const meetingCalendarQuerySchema = z
  .object({
    from: z.string().datetime({ offset: true }),
    to: z.string().datetime({ offset: true }),
    clientId: objectIdSchema.optional(),
    projectId: objectIdSchema.optional(),
    ownerUserId: objectIdSchema.optional(),
    status: z.enum(MEETING_STATUSES).optional(),
  })
  .refine((value) => new Date(value.to).getTime() > new Date(value.from).getTime(), {
    path: ['to'],
    message: 'The range end must be later than the range start',
  });

export type MeetingCalendarQuery = z.infer<typeof meetingCalendarQuerySchema>;

/**
 * Overlap probe: an owner plus a proposed (IST wall-clock) schedule window.
 *
 * Used to warn — never block — when a Project Manager already has a scheduled
 * meeting during the selected time (Step 32.8).
 */
export const meetingOverlapQuerySchema = z
  .object({
    ownerUserId: objectIdSchema,
    excludeMeetingId: objectIdSchema.optional(),
    ...scheduleFields,
  })
  .superRefine(refineSchedule);

export type MeetingOverlapQuery = z.infer<typeof meetingOverlapQuerySchema>;

/** Schedule history entry (creation plus each reschedule), oldest first. */
export const meetingScheduleHistoryEntrySchema = z.object({
  id: z.string(),
  action: z.enum(['meeting.create', 'meeting.reschedule']),
  actorId: z.string().nullable(),
  previousValue: z.unknown(),
  newValue: z.unknown(),
  notes: z.string().nullable(),
  createdAt: z.string(),
});

export type MeetingScheduleHistoryEntry = z.infer<typeof meetingScheduleHistoryEntrySchema>;

/**
 * Create a meeting action item (Step 33.4) — a follow-up record, not a task.
 *
 * `responsibleJobRoleId` is required because assignment always honours a
 * functional role; `assignedUserId` may be null, which surfaces the derived
 * "Needs Assignment" indicator rather than inventing an owner.
 */
export const createMeetingActionItemInputSchema = z.object({
  title: actionItemTitleSchema,
  description: actionItemDescriptionSchema.nullable().default(null),
  responsibleJobRoleId: objectIdSchema,
  assignedUserId: objectIdSchema.nullable().default(null),
  projectId: objectIdSchema.nullable().default(null),
  dueAt: dateTimeSchema.nullable().default(null),
  priority: z.enum(TASK_PRIORITIES).default(DEFAULT_TASK_PRIORITY),
});

export type CreateMeetingActionItemInput = z.infer<typeof createMeetingActionItemInputSchema>;

/** Edit a pending action item (Step 33.10). Converted items are immutable. */
export const updateMeetingActionItemInputSchema = z
  .object({
    title: actionItemTitleSchema.optional(),
    description: actionItemDescriptionSchema.nullable().optional(),
    responsibleJobRoleId: objectIdSchema.optional(),
    assignedUserId: objectIdSchema.nullable().optional(),
    projectId: objectIdSchema.nullable().optional(),
    dueAt: dateTimeSchema.nullable().optional(),
    priority: z.enum(TASK_PRIORITIES).optional(),
    expectedVersion: z.number().int().min(0).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export type UpdateMeetingActionItemInput = z.infer<typeof updateMeetingActionItemInputSchema>;

/**
 * Convert an action item into a real task (Step 33.7).
 *
 * `projectId` is required only when the meeting is not already linked to a
 * project. Omitting `assignedUserId` inherits the action item's assignee;
 * passing `null` explicitly creates an unassigned task. Approval settings mirror
 * the existing task engine.
 */
export const convertMeetingActionItemInputSchema = z.object({
  projectId: objectIdSchema.nullable().optional(),
  assignedUserId: objectIdSchema.nullable().optional(),
  approvalRequired: z.boolean().default(false),
  approverId: objectIdSchema.nullable().default(null),
  expectedVersion: z.number().int().min(0).optional(),
});

export type ConvertMeetingActionItemInput = z.infer<typeof convertMeetingActionItemInputSchema>;

/** Sanitized action-item record with derived conversion indicators. */
export const meetingActionItemSchema = z.object({
  id: objectIdSchema,
  meetingId: objectIdSchema,
  clientId: objectIdSchema,
  projectId: objectIdSchema.nullable(),
  title: actionItemTitleSchema,
  description: z.string().nullable(),
  responsibleJobRoleId: objectIdSchema,
  assignedUserId: objectIdSchema.nullable(),
  /** Resolved assignee display name (null when unassigned or unresolvable). */
  assignedUserName: z.string().nullable().default(null),
  dueAt: z.string().nullable(),
  priority: z.enum(TASK_PRIORITIES),
  status: z.enum(MEETING_ACTION_ITEM_STATUSES),
  /** Derived: pending and no assignee — highlight "Needs Assignment". */
  needsAssignment: z.boolean(),
  linkedTaskId: objectIdSchema.nullable(),
  createdBy: z.string().nullable(),
  updatedBy: z.string().nullable(),
  version: z.number().int().min(0),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type MeetingActionItem = z.infer<typeof meetingActionItemSchema>;

/** Action-item record enriched with the live linked-task status (Step 33.11). */
export const meetingActionItemWithTaskSchema = meetingActionItemSchema.extend({
  taskStatus: z.enum(TASK_STATUSES).nullable(),
});

export type MeetingActionItemWithTask = z.infer<typeof meetingActionItemWithTaskSchema>;

/** Result of converting an action item: the task id and a deep link. */
export const meetingActionItemConversionSchema = z.object({
  actionItem: meetingActionItemSchema,
  taskId: objectIdSchema,
  taskUrl: z.string(),
  /** False when the item was already converted (idempotent replay). */
  created: z.boolean(),
});

export type MeetingActionItemConversion = z.infer<typeof meetingActionItemConversionSchema>;

/**
 * Role-scoped meeting aggregates for the Overview dashboard (Step 35.11).
 *
 * Every count is computed live inside the caller's scope — nothing is
 * fabricated and unauthorized meetings never leak into a figure. `today` and
 * `upcoming` cover active (scheduled/rescheduled) meetings; `pendingNotes`
 * counts completed meetings whose discussion notes are still empty.
 */
export const meetingDashboardSummarySchema = z.object({
  today: z.number().int().min(0),
  upcoming: z.number().int().min(0),
  completed: z.number().int().min(0),
  cancelled: z.number().int().min(0),
  pendingNotes: z.number().int().min(0),
  openActionItems: z.number().int().min(0),
  convertedActionItems: z.number().int().min(0),
});

export type MeetingDashboardSummary = z.infer<typeof meetingDashboardSummarySchema>;
