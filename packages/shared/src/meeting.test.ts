import { describe, expect, it } from 'vitest';
import {
  ACTIVE_MEETING_STATUSES,
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
  DEFAULT_MEETING_ACTION_ITEM_STATUS,
  DEFAULT_MEETING_STATUS,
  MEETING_ACTION_ITEM_STATUSES,
  MEETING_STATUSES,
  cancelMeetingInputSchema,
  convertMeetingActionItemInputSchema,
  createMeetingActionItemInputSchema,
  createMeetingInputSchema,
  formatZonedDate,
  formatZonedDateTime,
  formatZonedTime,
  isActiveMeetingStatus,
  isCalendarDate,
  isValidTimeZone,
  meetingActionItemSchema,
  meetingCalendarQuerySchema,
  meetingListQuerySchema,
  meetingOverlapQuerySchema,
  meetingSummarySchema,
  rescheduleMeetingInputSchema,
  updateMeetingActionItemInputSchema,
  updateMeetingInputSchema,
  zonedDateTimeToUtc,
} from './index';

const CLIENT_ID = '507f1f77bcf86cd799439011';
const OWNER_ID = '507f1f77bcf86cd799439012';
const ATTENDEE_ID = '507f1f77bcf86cd799439013';
const OTHER_ATTENDEE_ID = '507f1f77bcf86cd799439014';
const JOB_ROLE_ID = '507f1f77bcf86cd799439015';
const MEETING_ID = '507f1f77bcf86cd799439016';
const ACTION_ITEM_ID = '507f1f77bcf86cd799439017';
const PROJECT_ID = '507f1f77bcf86cd799439018';

describe('meeting contracts', () => {
  it('defines the four approved meeting statuses', () => {
    expect(MEETING_STATUSES).toEqual(['scheduled', 'rescheduled', 'completed', 'cancelled']);
    expect(DEFAULT_MEETING_STATUS).toBe('scheduled');
  });

  it('treats scheduled and rescheduled as active reminder-eligible statuses', () => {
    expect(ACTIVE_MEETING_STATUSES).toEqual(['scheduled', 'rescheduled']);
    expect(isActiveMeetingStatus('scheduled')).toBe(true);
    expect(isActiveMeetingStatus('rescheduled')).toBe(true);
    expect(isActiveMeetingStatus('completed')).toBe(false);
    expect(isActiveMeetingStatus('cancelled')).toBe(false);
  });

  it('registers meeting audit actions and entity types', () => {
    expect(AUDIT_ACTIONS).toContain('meeting.create');
    expect(AUDIT_ACTIONS).toContain('meeting.reschedule');
    expect(AUDIT_ACTIONS).toContain('meeting.action_item.convert');
    expect(AUDIT_ENTITY_TYPES).toContain('meeting');
    expect(AUDIT_ENTITY_TYPES).toContain('meeting_action_item');
  });

  it('defines the two action-item conversion states', () => {
    expect(MEETING_ACTION_ITEM_STATUSES).toEqual(['pending', 'converted']);
    expect(DEFAULT_MEETING_ACTION_ITEM_STATUS).toBe('pending');
  });
});

describe('meeting date/time helpers', () => {
  it('converts an IST wall-clock time to the correct UTC instant', () => {
    const instant = zonedDateTimeToUtc('2026-10-17', '15:00', 'Asia/Kolkata');

    expect(instant.toISOString()).toBe('2026-10-17T09:30:00.000Z');
  });

  it('formats a UTC instant as DD/MM/YYYY and 12-hour time in IST', () => {
    const iso = '2026-10-17T09:30:00.000Z';

    expect(formatZonedDate(iso)).toBe('17/10/2026');
    expect(formatZonedTime(iso)).toBe('03:00 PM');
    expect(formatZonedDateTime(iso)).toBe('17/10/2026 03:00 PM');
  });

  it('rejects impossible calendar dates and unknown timezones', () => {
    expect(isCalendarDate('2026-02-31')).toBe(false);
    expect(isCalendarDate('2026-02-28')).toBe(true);
    expect(isValidTimeZone('Asia/Kolkata')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
  });

  it('throws when converting an invalid date/time combination', () => {
    expect(() => zonedDateTimeToUtc('2026-02-31', '10:00', 'Asia/Kolkata')).toThrow(RangeError);
    expect(() => zonedDateTimeToUtc('2026-02-28', '25:00', 'Asia/Kolkata')).toThrow(RangeError);
  });
});

describe('meeting input schemas', () => {
  const validCreate = {
    clientId: CLIENT_ID,
    title: 'Kickoff call',
    ownerUserId: OWNER_ID,
    date: '2026-10-17',
    startTime: '15:00',
    endTime: '16:00',
  };

  it('parses a valid create payload and applies defaults', () => {
    const parsed = createMeetingInputSchema.parse(validCreate);

    expect(parsed.timezone).toBe('Asia/Kolkata');
    expect(parsed.projectId).toBeNull();
    expect(parsed.attendeeUserIds).toEqual([]);
    expect(parsed.agenda).toBeNull();
  });

  it('rejects an end time that is not later than the start time', () => {
    expect(createMeetingInputSchema.safeParse({ ...validCreate, endTime: '15:00' }).success).toBe(
      false,
    );
    expect(createMeetingInputSchema.safeParse({ ...validCreate, endTime: '14:00' }).success).toBe(
      false,
    );
  });

  it('rejects an unknown timezone', () => {
    expect(
      createMeetingInputSchema.safeParse({ ...validCreate, timezone: 'Mars/Olympus' }).success,
    ).toBe(false);
  });

  it('rejects duplicate attendees', () => {
    expect(
      createMeetingInputSchema.safeParse({
        ...validCreate,
        attendeeUserIds: [ATTENDEE_ID, ATTENDEE_ID],
      }).success,
    ).toBe(false);
  });

  it('accepts distinct attendees', () => {
    const parsed = createMeetingInputSchema.parse({
      ...validCreate,
      attendeeUserIds: [ATTENDEE_ID, OTHER_ATTENDEE_ID],
    });

    expect(parsed.attendeeUserIds).toEqual([ATTENDEE_ID, OTHER_ATTENDEE_ID]);
  });

  it('requires at least one field to update a meeting', () => {
    expect(updateMeetingInputSchema.safeParse({}).success).toBe(false);
    expect(updateMeetingInputSchema.safeParse({ title: 'Renamed' }).success).toBe(true);
  });

  it('validates a reschedule payload', () => {
    const ok = rescheduleMeetingInputSchema.safeParse({
      date: '2026-10-18',
      startTime: '16:00',
      endTime: '17:00',
    });

    expect(ok.success).toBe(true);
    expect(
      rescheduleMeetingInputSchema.safeParse({
        date: '2026-10-18',
        startTime: '16:00',
        endTime: '15:00',
      }).success,
    ).toBe(false);
  });

  it('requires a cancellation reason', () => {
    expect(cancelMeetingInputSchema.safeParse({}).success).toBe(false);
    expect(cancelMeetingInputSchema.safeParse({ reason: 'Client unavailable' }).success).toBe(true);
  });

  it('validates list query filters', () => {
    const parsed = meetingListQuerySchema.parse({
      limit: '10',
      status: 'scheduled',
      clientId: CLIENT_ID,
    });

    expect(parsed.limit).toBe(10);
    expect(parsed.status).toBe('scheduled');
    expect(parsed.clientId).toBe(CLIENT_ID);
  });

  it('validates a calendar range and rejects an inverted one', () => {
    const ok = meetingCalendarQuerySchema.safeParse({
      from: '2026-10-01T00:00:00.000Z',
      to: '2026-11-01T00:00:00.000Z',
      clientId: CLIENT_ID,
    });
    expect(ok.success).toBe(true);

    expect(
      meetingCalendarQuerySchema.safeParse({
        from: '2026-11-01T00:00:00.000Z',
        to: '2026-10-01T00:00:00.000Z',
      }).success,
    ).toBe(false);
  });

  it('validates an overlap probe and applies the timezone default', () => {
    const parsed = meetingOverlapQuerySchema.parse({
      ownerUserId: OWNER_ID,
      date: '2026-10-17',
      startTime: '15:00',
      endTime: '16:00',
    });

    expect(parsed.timezone).toBe('Asia/Kolkata');

    expect(
      meetingOverlapQuerySchema.safeParse({
        ownerUserId: OWNER_ID,
        date: '2026-10-17',
        startTime: '16:00',
        endTime: '15:00',
      }).success,
    ).toBe(false);
  });

  it('accepts discussion notes and decisions on update', () => {
    const parsed = updateMeetingInputSchema.parse({
      discussionNotes: 'Client asked for a revised quote.',
      decisions: ['Send quote by Friday', 'Book follow-up next week'],
    });

    expect(parsed.discussionNotes).toBe('Client asked for a revised quote.');
    expect(parsed.decisions).toEqual(['Send quote by Friday', 'Book follow-up next week']);
  });

  it('rejects empty decision entries', () => {
    expect(updateMeetingInputSchema.safeParse({ decisions: [''] }).success).toBe(false);
  });
});

describe('meeting action item schemas', () => {
  it('parses a create payload and applies defaults', () => {
    const parsed = createMeetingActionItemInputSchema.parse({
      title: 'Send revised quote',
      responsibleJobRoleId: JOB_ROLE_ID,
    });

    expect(parsed.description).toBeNull();
    expect(parsed.projectId).toBeNull();
    expect(parsed.assignedUserId).toBeNull();
    expect(parsed.dueAt).toBeNull();
    expect(parsed.priority).toBe('medium');
  });

  it('requires a title and responsible job role', () => {
    expect(createMeetingActionItemInputSchema.safeParse({}).success).toBe(false);
    expect(createMeetingActionItemInputSchema.safeParse({ title: 'Do a thing' }).success).toBe(
      false,
    );
  });

  it('requires at least one field to update and rejects converted-only edits', () => {
    expect(updateMeetingActionItemInputSchema.safeParse({}).success).toBe(false);
    expect(updateMeetingActionItemInputSchema.safeParse({ title: 'Renamed' }).success).toBe(true);
  });

  it('defaults a conversion payload to a non-approval task that inherits the assignee', () => {
    const parsed = convertMeetingActionItemInputSchema.parse({});

    expect(parsed.projectId).toBeUndefined();
    expect(parsed.assignedUserId).toBeUndefined();
    expect(parsed.approvalRequired).toBe(false);
    expect(parsed.approverId).toBeNull();
  });

  it('derives needsAssignment only for a pending, unassigned item', () => {
    const base = {
      id: ACTION_ITEM_ID,
      meetingId: MEETING_ID,
      clientId: CLIENT_ID,
      projectId: null,
      title: 'Send revised quote',
      description: null,
      responsibleJobRoleId: JOB_ROLE_ID,
      assignedUserId: null,
      dueAt: null,
      priority: 'medium',
      status: 'pending',
      needsAssignment: true,
      linkedTaskId: null,
      createdBy: null,
      updatedBy: null,
      version: 0,
      createdAt: '2026-10-17T09:30:00.000Z',
      updatedAt: '2026-10-17T09:30:00.000Z',
    };

    expect(meetingActionItemSchema.safeParse(base).success).toBe(true);
    expect(
      meetingActionItemSchema.safeParse({ ...base, status: 'converted', linkedTaskId: PROJECT_ID })
        .success,
    ).toBe(true);
    expect(meetingActionItemSchema.safeParse({ ...base, status: 'bogus' }).success).toBe(false);
  });

  it('exposes a derived needsNotes flag on the meeting summary', () => {
    const summary = {
      id: MEETING_ID,
      clientId: CLIENT_ID,
      projectId: null,
      title: 'Weekly client sync',
      agenda: null,
      startsAt: '2026-10-17T09:30:00.000Z',
      endsAt: '2026-10-17T10:30:00.000Z',
      timezone: 'Asia/Kolkata',
      ownerUserId: OWNER_ID,
      attendeeUserIds: [],
      meetingUrl: null,
      location: null,
      status: 'completed',
      hasNotes: false,
      needsNotes: true,
      scheduleVersion: 1,
      createdBy: null,
      updatedBy: null,
      version: 0,
      createdAt: '2026-10-17T09:30:00.000Z',
      updatedAt: '2026-10-17T09:30:00.000Z',
    };

    expect(meetingSummarySchema.safeParse(summary).success).toBe(true);
    expect(meetingSummarySchema.safeParse({ ...summary, needsNotes: 'yes' }).success).toBe(false);
  });
});
