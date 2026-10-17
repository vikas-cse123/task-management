import {
  ACTIVE_MEETING_STATUSES,
  isActiveMeetingStatus,
  zonedCalendarDate,
  zonedDateTimeToUtc,
  zonedDayRangeUtc,
  type CancelMeetingInput,
  type CreateMeetingInput,
  type MeetingCalendarEntry,
  type MeetingCalendarQuery,
  type MeetingDashboardSummary,
  type MeetingDetail,
  type MeetingListQuery,
  type MeetingOverlapQuery,
  type MeetingParticipant,
  type MeetingStatus,
  type MeetingSummary,
  type RescheduleMeetingInput,
  type UpdateMeetingInput,
} from '@interscale/shared';
import mongoose from 'mongoose';
import type { Connection } from 'mongoose';
import { getConnection } from '../connection';
import { BETTER_AUTH_USER_COLLECTION } from '../identity';
import { assertObjectId } from '../lib/object-id';
import { ConcurrentModificationError, NotFoundError, ValidationError } from '../lib/errors';
import { ClientModel } from '../models/client';
import { MeetingModel } from '../models/meeting';
import { MeetingActionItemModel } from '../models/meeting-action-item';
import { ProjectModel } from '../models/project';
import { listEntityActivity, recordAudit } from './audit.service';
import { isActiveClientMember, listActiveClientIdsForUser } from './client.service';
import type { EmployeeDirectory } from './employee-directory';
import {
  notifyMeetingAssigned,
  notifyMeetingReminder,
  notifyMeetingRescheduledWithReminder,
  notifyMeetingScheduled,
  suppressMeetingOutstandingNotifications,
} from './meeting-notifications.service';

/**
 * Server-side meeting management (Phase 6, Step 31).
 *
 * Meetings are independent records — never tasks. This module owns creation,
 * content updates, rescheduling, cancellation and completion, plus scoped
 * listing. Authorization (access level, `meetings.manage`, and participation)
 * is enforced by the API-layer service; this module additionally validates that
 * the client/project/owner/attendees are internally consistent.
 *
 * Timestamps are stored in UTC. The submitted IST wall-clock schedule is
 * converted with `zonedDateTimeToUtc` so browser-local drift cannot occur.
 */

export interface MeetingServiceOptions {
  connection?: Connection;
  session?: mongoose.ClientSession;
}

export interface MeetingServiceDeps extends MeetingServiceOptions {
  directory: EmployeeDirectory;
}

/**
 * Row-level scope for listing.
 *
 * - `all` — Admins.
 * - `member` — Managers: meetings for clients they belong to, plus meetings
 *   they own or attend.
 * - `participant` — Employees: only meetings they own or attend.
 */
export type MeetingScope =
  { kind: 'all' } | { kind: 'member'; userId: string } | { kind: 'participant'; userId: string };

export interface MeetingListResult {
  readonly data: MeetingSummary[];
  readonly nextCursor: string | null;
}

function resolveConnection(options: MeetingServiceOptions): Connection {
  return options.connection ?? getConnection();
}

function asIso(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'string') {
    const parsed = new Date(value);

    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  return new Date(0).toISOString();
}

function asNullableIso(value: Date | null | undefined): string | null {
  return value instanceof Date ? value.toISOString() : null;
}

interface MeetingLike {
  _id: mongoose.Types.ObjectId;
  clientId: mongoose.Types.ObjectId;
  projectId?: mongoose.Types.ObjectId | null;
  title: string;
  agenda?: string | null;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  ownerUserId: mongoose.Types.ObjectId;
  attendeeUserIds?: mongoose.Types.ObjectId[];
  meetingUrl?: string | null;
  location?: string | null;
  status: MeetingStatus;
  discussionNotes?: string | null;
  decisions?: string[];
  rescheduledAt?: Date | null;
  completedAt?: Date | null;
  cancelledAt?: Date | null;
  cancellationReason?: string | null;
  scheduleVersion: number;
  createdBy?: mongoose.Types.ObjectId | null;
  updatedBy?: mongoose.Types.ObjectId | null;
  __v?: number;
  createdAt: Date;
  updatedAt: Date;
}

interface SummaryNames {
  readonly clientName?: string | null;
  readonly projectName?: string | null;
  readonly ownerName?: string | null;
}

function toSummary(doc: MeetingLike, names: SummaryNames = {}): MeetingSummary {
  const hasNotes = typeof doc.discussionNotes === 'string' && doc.discussionNotes.trim().length > 0;

  return {
    id: doc._id.toString(),
    clientId: doc.clientId.toString(),
    clientName: names.clientName ?? null,
    projectId: doc.projectId ? doc.projectId.toString() : null,
    projectName: names.projectName ?? null,
    title: doc.title,
    agenda: doc.agenda ?? null,
    startsAt: asIso(doc.startsAt),
    endsAt: asIso(doc.endsAt),
    timezone: doc.timezone,
    ownerUserId: doc.ownerUserId.toString(),
    ownerName: names.ownerName ?? null,
    attendeeUserIds: (doc.attendeeUserIds ?? []).map((id) => id.toString()),
    meetingUrl: doc.meetingUrl ?? null,
    location: doc.location ?? null,
    status: doc.status,
    hasNotes,
    needsNotes: doc.status === 'completed' && !hasNotes,
    scheduleVersion: doc.scheduleVersion,
    createdBy: doc.createdBy ? doc.createdBy.toString() : null,
    updatedBy: doc.updatedBy ? doc.updatedBy.toString() : null,
    version: typeof doc.__v === 'number' ? doc.__v : 0,
    createdAt: asIso(doc.createdAt),
    updatedAt: asIso(doc.updatedAt),
  };
}

function toDetail(
  doc: MeetingLike,
  names: SummaryNames = {},
  attendeeNames: MeetingParticipant[] = [],
): MeetingDetail {
  return {
    ...toSummary(doc, names),
    discussionNotes: doc.discussionNotes ?? null,
    decisions: [...(doc.decisions ?? [])],
    attendeeNames,
    completedAt: asNullableIso(doc.completedAt),
    cancelledAt: asNullableIso(doc.cancelledAt),
    cancellationReason: doc.cancellationReason ?? null,
    rescheduledAt: asNullableIso(doc.rescheduledAt),
  };
}

/**
 * Batch-resolve display names for meeting summaries (Step 35).
 *
 * Names are resolved server-side within the caller's scope so non-admin users
 * never need an employee-directory endpoint. Unknown ids resolve to `null`
 * (or a stable fallback participant) rather than leaking or failing.
 */
async function withSummaryNames(
  docs: MeetingLike[],
  options: MeetingServiceOptions,
): Promise<MeetingSummary[]> {
  if (docs.length === 0) {
    return [];
  }

  const clientIds = [...new Set(docs.map((doc) => doc.clientId.toString()))];
  const projectIds = [
    ...new Set(
      docs
        .map((doc) => doc.projectId)
        .filter((value): value is mongoose.Types.ObjectId => Boolean(value))
        .map((value) => value.toString()),
    ),
  ];
  const ownerIds = [...new Set(docs.map((doc) => doc.ownerUserId.toString()))];

  const [clientNames, projectNames, ownerNames] = await Promise.all([
    loadClientNames(clientIds),
    loadProjectNames(projectIds),
    loadUserNames(ownerIds, options),
  ]);

  return docs.map((doc) =>
    toSummary(doc, {
      clientName: clientNames.get(doc.clientId.toString()) ?? null,
      projectName: doc.projectId ? (projectNames.get(doc.projectId.toString()) ?? null) : null,
      ownerName: ownerNames.get(doc.ownerUserId.toString()) ?? null,
    }),
  );
}

/** Resolve owner + attendee display participants for one meeting detail. */
async function resolveDetailParticipants(
  doc: MeetingLike,
  options: MeetingServiceOptions,
): Promise<MeetingParticipant[]> {
  const ids = [
    ...new Set([
      doc.ownerUserId.toString(),
      ...(doc.attendeeUserIds ?? []).map((id) => id.toString()),
    ]),
  ];
  const names = await loadUserNames(ids, options);

  return ids.map((userId) => ({ userId, name: names.get(userId) ?? 'Unknown member' }));
}

async function assertActiveEmployee(
  directory: EmployeeDirectory,
  userId: string,
  label: string,
): Promise<void> {
  const employee = await directory.findById(assertObjectId(userId, label));

  if (!employee) {
    throw new NotFoundError('Employee');
  }

  if (employee.status !== 'active') {
    throw new ValidationError(`The ${label} is not active`);
  }
}

/**
 * Validate a meeting owner.
 *
 * The owner must be an active employee and be eligible to coordinate the
 * client (an active team member). Ownership never grants application access.
 */
async function assertEligibleOwner(
  directory: EmployeeDirectory,
  clientId: string,
  ownerUserId: string,
  options: MeetingServiceOptions,
): Promise<void> {
  await assertActiveEmployee(directory, ownerUserId, 'meeting owner');

  const isMember = await isActiveClientMember(clientId, ownerUserId, options);

  if (!isMember) {
    throw new ValidationError('The meeting owner is not eligible to coordinate this client');
  }
}

/** Validate attendee employees (active) and reject duplicates defensively. */
async function assertAttendees(
  directory: EmployeeDirectory,
  attendeeUserIds: readonly string[],
): Promise<void> {
  const unique = new Set(attendeeUserIds);

  if (unique.size !== attendeeUserIds.length) {
    throw new ValidationError('Attendees must be unique');
  }

  for (const userId of attendeeUserIds) {
    await assertActiveEmployee(directory, userId, 'attendee');
  }
}

/** Resolve the IST wall-clock schedule to UTC start/end instants. */
function resolveSchedule(input: {
  date: string;
  startTime: string;
  endTime: string;
  timezone: string;
}): { startsAt: Date; endsAt: Date } {
  let startsAt: Date;
  let endsAt: Date;

  try {
    startsAt = zonedDateTimeToUtc(input.date, input.startTime, input.timezone);
    endsAt = zonedDateTimeToUtc(input.date, input.endTime, input.timezone);
  } catch {
    throw new ValidationError('A valid meeting date, time and timezone are required');
  }

  if (endsAt.getTime() <= startsAt.getTime()) {
    throw new ValidationError('The end time must be later than the start time');
  }

  return { startsAt, endsAt };
}

/**
 * Create a meeting.
 *
 * Validates the client, optional project (same client — cross-client project
 * references are rejected), eligible owner, and active attendees.
 */
export async function createMeetingRecord(
  input: CreateMeetingInput,
  actorId: string,
  deps: MeetingServiceDeps,
): Promise<MeetingSummary> {
  void resolveConnection(deps);

  const clientId = assertObjectId(input.clientId, 'client');
  const client = await ClientModel.findById(clientId).select({ _id: 1 }).lean();

  if (!client) {
    throw new NotFoundError('Client');
  }

  let projectId: mongoose.Types.ObjectId | null = null;

  if (input.projectId) {
    const project = await ProjectModel.findById(assertObjectId(input.projectId, 'project'))
      .select({ clientId: 1 })
      .lean();

    if (!project) {
      throw new NotFoundError('Project');
    }

    if (project.clientId.toString() !== clientId) {
      throw new ValidationError('The selected project does not belong to the selected client');
    }

    projectId = project._id;
  }

  await assertEligibleOwner(deps.directory, clientId, input.ownerUserId, deps);
  await assertAttendees(deps.directory, input.attendeeUserIds);

  const { startsAt, endsAt } = resolveSchedule(input);

  const [document] = await MeetingModel.create([
    {
      clientId,
      projectId,
      title: input.title,
      agenda: input.agenda,
      startsAt,
      endsAt,
      timezone: input.timezone,
      ownerUserId: new mongoose.Types.ObjectId(input.ownerUserId),
      attendeeUserIds: input.attendeeUserIds.map((id) => new mongoose.Types.ObjectId(id)),
      meetingUrl: input.meetingUrl,
      location: input.location,
      status: 'scheduled',
      discussionNotes: null,
      decisions: [],
      scheduleVersion: 1,
      createdBy: new mongoose.Types.ObjectId(assertObjectId(actorId, 'actor')),
      updatedBy: new mongoose.Types.ObjectId(assertObjectId(actorId, 'actor')),
    },
  ]);

  if (!document) {
    throw new ValidationError('Failed to create meeting');
  }

  await recordAudit({
    actorId,
    action: 'meeting.create',
    entityType: 'meeting',
    entityId: document._id.toString(),
    previousValue: null,
    newValue: {
      clientId,
      projectId: projectId ? projectId.toString() : null,
      title: document.title,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      timezone: document.timezone,
      ownerUserId: document.ownerUserId.toString(),
    },
    notes: null,
  });

  await notifyMeetingScheduled(document._id.toString(), document.ownerUserId.toString(), deps);

  return toSummary(document.toObject() as MeetingLike);
}

/** Find a single meeting, or `null` when the id is malformed or unknown. */
export async function findMeeting(
  id: string,
  options: MeetingServiceOptions = {},
): Promise<MeetingSummary | null> {
  void resolveConnection(options);

  let objectId: mongoose.Types.ObjectId;

  try {
    objectId = new mongoose.Types.ObjectId(assertObjectId(id, 'meeting'));
  } catch {
    return null;
  }

  const doc = await MeetingModel.findById(objectId)
    .session(options.session ?? null)
    .lean();

  return doc ? toSummary(doc as MeetingLike) : null;
}

/** Find a single meeting's detail, or `null`, with resolved display names. */
export async function findMeetingDetail(
  id: string,
  options: MeetingServiceOptions = {},
): Promise<MeetingDetail | null> {
  let objectId: mongoose.Types.ObjectId;

  try {
    objectId = new mongoose.Types.ObjectId(assertObjectId(id, 'meeting'));
  } catch {
    return null;
  }

  const doc = await MeetingModel.findById(objectId)
    .session(options.session ?? null)
    .lean();

  if (!doc) {
    return null;
  }

  const record = doc as MeetingLike;
  const [summaries, participants] = await Promise.all([
    withSummaryNames([record], options),
    resolveDetailParticipants(record, options),
  ]);
  const names = summaries[0];

  return toDetail(
    record,
    {
      clientName: names?.clientName ?? null,
      projectName: names?.projectName ?? null,
      ownerName: names?.ownerName ?? null,
    },
    participants,
  );
}

/** Build the row-level scope clause for listing. */
async function buildScopeClause(
  scope: MeetingScope,
  options: MeetingServiceOptions,
): Promise<Record<string, unknown> | null> {
  if (scope.kind === 'all') {
    return null;
  }

  const userId = new mongoose.Types.ObjectId(assertObjectId(scope.userId, 'user'));
  const participant = { $or: [{ ownerUserId: userId }, { attendeeUserIds: userId }] };

  if (scope.kind === 'participant') {
    return participant;
  }

  const clientIds = await listActiveClientIdsForUser(scope.userId, options);

  if (clientIds.length === 0) {
    return participant;
  }

  return {
    $or: [
      { clientId: { $in: clientIds.map((id) => new mongoose.Types.ObjectId(id)) } },
      { ownerUserId: userId },
      { attendeeUserIds: userId },
    ],
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** List meetings with filters, scope filtering and `_id` cursor pagination. */
export async function listMeetings(
  query: MeetingListQuery,
  scope: MeetingScope,
  options: MeetingServiceOptions = {},
): Promise<MeetingListResult> {
  void resolveConnection(options);

  const conditions: Record<string, unknown>[] = [];
  const scopeClause = await buildScopeClause(scope, options);

  if (scopeClause) {
    conditions.push(scopeClause);
  }

  if (query.clientId) {
    conditions.push({
      clientId: new mongoose.Types.ObjectId(assertObjectId(query.clientId, 'client')),
    });
  }

  if (query.projectId) {
    conditions.push({
      projectId: new mongoose.Types.ObjectId(assertObjectId(query.projectId, 'project')),
    });
  }

  if (query.ownerUserId) {
    conditions.push({
      ownerUserId: new mongoose.Types.ObjectId(assertObjectId(query.ownerUserId, 'owner')),
    });
  }

  if (query.status) {
    conditions.push({ status: query.status });
  }

  if (query.date) {
    const { start, end } = zonedDayRangeUtc(query.date);
    conditions.push({ startsAt: { $gte: start, $lt: end } });
  } else {
    const range: Record<string, Date> = {};

    if (query.from) {
      range.$gte = new Date(query.from);
    }

    if (query.to) {
      range.$lt = new Date(query.to);
    }

    if (Object.keys(range).length > 0) {
      conditions.push({ startsAt: range });
    }
  }

  if (query.search && query.search.length > 0) {
    conditions.push({ title: { $regex: escapeRegExp(query.search), $options: 'i' } });
  }

  if (query.cursor) {
    conditions.push({ _id: { $gt: new mongoose.Types.ObjectId(query.cursor) } });
  }

  const filter = conditions.length > 0 ? { $and: conditions } : {};

  const documents = await MeetingModel.find(filter)
    .sort({ _id: 1 })
    .limit(query.limit + 1)
    .lean();

  const hasMore = documents.length > query.limit;
  const page = hasMore ? documents.slice(0, query.limit) : documents;

  return {
    data: await withSummaryNames(
      page.map((doc) => doc as MeetingLike),
      options,
    ),
    nextCursor: hasMore && page.length > 0 ? (page[page.length - 1]?._id.toString() ?? null) : null,
  };
}

function assertExpectedVersion(document: { __v?: number }, expected?: number): void {
  if (expected !== undefined && (document.__v ?? 0) !== expected) {
    throw new ConcurrentModificationError();
  }
}

/** Update meeting content (title, agenda, owner, attendees, link, location). */
export async function updateMeetingRecord(
  id: string,
  input: UpdateMeetingInput,
  actorId: string,
  deps: MeetingServiceDeps,
): Promise<MeetingSummary> {
  void resolveConnection(deps);

  const meetingId = assertObjectId(id, 'meeting');
  const document = await MeetingModel.findById(meetingId);

  if (!document) {
    throw new NotFoundError('Meeting');
  }

  if (document.status === 'cancelled') {
    throw new ValidationError('A cancelled meeting cannot be edited');
  }

  assertExpectedVersion(document, input.expectedVersion);

  const previous = {
    title: document.title,
    agenda: document.agenda,
    meetingUrl: document.meetingUrl,
    location: document.location,
    discussionNotes: document.discussionNotes,
    decisions: [...document.decisions],
    ownerUserId: document.ownerUserId.toString(),
    attendeeUserIds: document.attendeeUserIds.map((entry) => entry.toString()),
  };

  const ownerChanged =
    input.ownerUserId !== undefined && input.ownerUserId !== document.ownerUserId.toString();

  if (ownerChanged && input.ownerUserId) {
    await assertEligibleOwner(
      deps.directory,
      document.clientId.toString(),
      input.ownerUserId,
      deps,
    );
  }

  let attendeesChanged = false;

  if (input.attendeeUserIds !== undefined) {
    await assertAttendees(deps.directory, input.attendeeUserIds);
    attendeesChanged =
      input.attendeeUserIds.length !== document.attendeeUserIds.length ||
      input.attendeeUserIds.some(
        (entry, index) => entry !== document.attendeeUserIds[index]?.toString(),
      );
  }

  if (input.title !== undefined) document.title = input.title;
  if (input.agenda !== undefined) document.agenda = input.agenda;
  if (input.meetingUrl !== undefined) document.meetingUrl = input.meetingUrl;
  if (input.location !== undefined) document.location = input.location;
  if (input.discussionNotes !== undefined) document.discussionNotes = input.discussionNotes;
  if (input.decisions !== undefined) document.decisions = [...input.decisions];
  if (input.ownerUserId !== undefined) {
    document.ownerUserId = new mongoose.Types.ObjectId(input.ownerUserId);
  }
  if (input.attendeeUserIds !== undefined) {
    document.attendeeUserIds = input.attendeeUserIds.map(
      (entry) => new mongoose.Types.ObjectId(entry),
    );
  }

  document.updatedBy = new mongoose.Types.ObjectId(assertObjectId(actorId, 'actor'));

  try {
    await document.save();
  } catch (error) {
    if (error instanceof Error && error.name === 'VersionError') {
      throw new ConcurrentModificationError();
    }

    throw error;
  }

  if (ownerChanged && input.ownerUserId) {
    await recordAudit({
      actorId,
      action: 'meeting.owner.update',
      entityType: 'meeting',
      entityId: meetingId,
      previousValue: { ownerUserId: previous.ownerUserId },
      newValue: { ownerUserId: input.ownerUserId },
      notes: null,
    });

    await suppressMeetingOutstandingNotifications(meetingId, deps);
    await notifyMeetingAssigned(meetingId, input.ownerUserId, deps);
    await notifyMeetingReminder(meetingId, input.ownerUserId, deps);
  }

  if (attendeesChanged) {
    await recordAudit({
      actorId,
      action: 'meeting.attendees.update',
      entityType: 'meeting',
      entityId: meetingId,
      previousValue: { attendeeUserIds: previous.attendeeUserIds },
      newValue: { attendeeUserIds: document.attendeeUserIds.map((entry) => entry.toString()) },
      notes: null,
    });
  }

  await recordAudit({
    actorId,
    action: 'meeting.update',
    entityType: 'meeting',
    entityId: meetingId,
    previousValue: {
      title: previous.title,
      agenda: previous.agenda,
      meetingUrl: previous.meetingUrl,
      location: previous.location,
    },
    newValue: {
      title: document.title,
      agenda: document.agenda,
      meetingUrl: document.meetingUrl,
      location: document.location,
    },
    notes: null,
  });

  const notesChanged =
    input.discussionNotes !== undefined && input.discussionNotes !== previous.discussionNotes;

  if (notesChanged) {
    await recordAudit({
      actorId,
      action: 'meeting.notes.update',
      entityType: 'meeting',
      entityId: meetingId,
      previousValue: { discussionNotes: previous.discussionNotes },
      newValue: { discussionNotes: document.discussionNotes },
      notes: null,
    });
  }

  const decisionsChanged =
    input.decisions !== undefined &&
    (input.decisions.length !== previous.decisions.length ||
      input.decisions.some((entry, index) => entry !== previous.decisions[index]));

  if (decisionsChanged) {
    await recordAudit({
      actorId,
      action: 'meeting.decisions.update',
      entityType: 'meeting',
      entityId: meetingId,
      previousValue: { decisions: previous.decisions },
      newValue: { decisions: document.decisions },
      notes: null,
    });
  }

  return toSummary(document.toObject() as MeetingLike);
}

/**
 * Reschedule a meeting.
 *
 * Retains the meeting identity: updates the schedule, records the previous
 * schedule in audit history, increments `scheduleVersion` (invalidating any
 * stale reminder), and preserves agenda, notes, attendees and action items.
 */
export async function rescheduleMeetingRecord(
  id: string,
  input: RescheduleMeetingInput,
  actorId: string,
  options: MeetingServiceOptions = {},
): Promise<MeetingSummary> {
  void resolveConnection(options);

  const meetingId = assertObjectId(id, 'meeting');
  const document = await MeetingModel.findById(meetingId);

  if (!document) {
    throw new NotFoundError('Meeting');
  }

  if (!isActiveMeetingStatus(document.status)) {
    throw new ValidationError('Only scheduled or rescheduled meetings can be rescheduled');
  }

  assertExpectedVersion(document, input.expectedVersion);

  const previousSchedule = {
    startsAt: document.startsAt.toISOString(),
    endsAt: document.endsAt.toISOString(),
    timezone: document.timezone,
  };
  const { startsAt, endsAt } = resolveSchedule(input);
  const now = new Date();

  document.startsAt = startsAt;
  document.endsAt = endsAt;
  document.timezone = input.timezone;
  document.status = 'rescheduled';
  document.rescheduledAt = now;
  document.scheduleVersion += 1;
  document.updatedBy = new mongoose.Types.ObjectId(assertObjectId(actorId, 'actor'));

  try {
    await document.save();
  } catch (error) {
    if (error instanceof Error && error.name === 'VersionError') {
      throw new ConcurrentModificationError();
    }

    throw error;
  }

  await recordAudit({
    actorId,
    action: 'meeting.reschedule',
    entityType: 'meeting',
    entityId: meetingId,
    previousValue: { ...previousSchedule, scheduleVersion: document.scheduleVersion - 1 },
    newValue: {
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      timezone: input.timezone,
      scheduleVersion: document.scheduleVersion,
    },
    notes: input.reason ?? null,
  });

  await notifyMeetingRescheduledWithReminder(meetingId, document.ownerUserId.toString(), options);

  return toSummary(document.toObject() as MeetingLike);
}

/** Cancel a meeting, recording the reason and stopping future reminders. */
export async function cancelMeetingRecord(
  id: string,
  input: CancelMeetingInput,
  actorId: string,
  options: MeetingServiceOptions = {},
): Promise<MeetingSummary> {
  void resolveConnection(options);

  const meetingId = assertObjectId(id, 'meeting');
  const document = await MeetingModel.findById(meetingId);

  if (!document) {
    throw new NotFoundError('Meeting');
  }

  if (!isActiveMeetingStatus(document.status)) {
    throw new ValidationError('Only scheduled or rescheduled meetings can be cancelled');
  }

  assertExpectedVersion(document, input.expectedVersion);

  const previousStatus = document.status;
  const now = new Date();

  document.status = 'cancelled';
  document.cancelledAt = now;
  document.cancellationReason = input.reason;
  document.updatedBy = new mongoose.Types.ObjectId(assertObjectId(actorId, 'actor'));

  try {
    await document.save();
  } catch (error) {
    if (error instanceof Error && error.name === 'VersionError') {
      throw new ConcurrentModificationError();
    }

    throw error;
  }

  await recordAudit({
    actorId,
    action: 'meeting.cancel',
    entityType: 'meeting',
    entityId: meetingId,
    previousValue: { status: previousStatus },
    newValue: { status: 'cancelled', cancelledAt: now.toISOString() },
    notes: input.reason,
  });

  await suppressMeetingOutstandingNotifications(meetingId, options);

  return toSummary(document.toObject() as MeetingLike);
}

/**
 * Mark a meeting completed.
 *
 * Completion preserves agenda, notes, decisions and action items, and stops
 * future reminders. It never touches associated project tasks.
 */
export async function completeMeetingRecord(
  id: string,
  actorId: string,
  options: MeetingServiceOptions & { expectedVersion?: number } = {},
): Promise<MeetingSummary> {
  void resolveConnection(options);

  const meetingId = assertObjectId(id, 'meeting');
  const document = await MeetingModel.findById(meetingId);

  if (!document) {
    throw new NotFoundError('Meeting');
  }

  if (!isActiveMeetingStatus(document.status)) {
    throw new ValidationError('Only scheduled or rescheduled meetings can be completed');
  }

  assertExpectedVersion(document, options.expectedVersion);

  const previousStatus = document.status;
  const now = new Date();

  document.status = 'completed';
  document.completedAt = now;
  document.updatedBy = new mongoose.Types.ObjectId(assertObjectId(actorId, 'actor'));

  try {
    await document.save();
  } catch (error) {
    if (error instanceof Error && error.name === 'VersionError') {
      throw new ConcurrentModificationError();
    }

    throw error;
  }

  await recordAudit({
    actorId,
    action: 'meeting.complete',
    entityType: 'meeting',
    entityId: meetingId,
    previousValue: { status: previousStatus },
    newValue: { status: 'completed', completedAt: now.toISOString() },
    notes: null,
  });

  await suppressMeetingOutstandingNotifications(meetingId, options);

  return toSummary(document.toObject() as MeetingLike);
}

/**
 * Find scheduled/rescheduled meetings owned by a user that overlap a window.
 *
 * Used to warn (never block) when a Project Manager already has a meeting during
 * the selected time (Step 32.8). Touching edges (`endsAt === startsAt`) do not
 * overlap; `excludeMeetingId` lets a reschedule ignore the meeting itself.
 */
export async function findOverlappingMeetings(
  input: MeetingOverlapQuery,
  scope: MeetingScope,
  options: MeetingServiceOptions = {},
): Promise<MeetingSummary[]> {
  void resolveConnection(options);

  const { startsAt, endsAt } = resolveSchedule(input);

  const conditions: Record<string, unknown>[] = [
    { ownerUserId: new mongoose.Types.ObjectId(assertObjectId(input.ownerUserId, 'owner')) },
    { status: { $in: ACTIVE_MEETING_STATUSES } },
    { startsAt: { $lt: endsAt } },
    { endsAt: { $gt: startsAt } },
  ];

  const scopeClause = await buildScopeClause(scope, options);

  if (scopeClause) {
    conditions.push(scopeClause);
  }

  if (input.excludeMeetingId) {
    conditions.push({
      _id: { $ne: new mongoose.Types.ObjectId(assertObjectId(input.excludeMeetingId, 'meeting')) },
    });
  }

  const documents = await MeetingModel.find({ $and: conditions })
    .sort({ startsAt: 1 })
    .limit(50)
    .lean();

  return withSummaryNames(
    documents.map((doc) => doc as MeetingLike),
    options,
  );
}

async function loadClientNames(ids: readonly string[]): Promise<Map<string, string>> {
  if (ids.length === 0) {
    return new Map();
  }

  const documents = await ClientModel.find({
    _id: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) },
  })
    .select({ name: 1 })
    .lean();

  return new Map(documents.map((doc) => [doc._id.toString(), doc.name]));
}

async function loadProjectNames(ids: readonly string[]): Promise<Map<string, string>> {
  if (ids.length === 0) {
    return new Map();
  }

  const documents = await ProjectModel.find({
    _id: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) },
  })
    .select({ name: 1 })
    .lean();

  return new Map(documents.map((doc) => [doc._id.toString(), doc.name]));
}

async function loadUserNames(
  ids: readonly string[],
  options: MeetingServiceOptions,
): Promise<Map<string, string>> {
  if (ids.length === 0) {
    return new Map();
  }

  const documents = await resolveConnection(options)
    .collection(BETTER_AUTH_USER_COLLECTION)
    .find(
      { _id: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) } },
      { projection: { name: 1 } },
    )
    .toArray();

  const names = new Map<string, string>();

  for (const document of documents) {
    if (typeof document.name === 'string') {
      names.set(document._id.toString(), document.name);
    }
  }

  return names;
}

/**
 * List calendar entries for a range, resolved to display names and scoped so
 * employees never receive other clients' private meeting details (Step 32.7).
 */
export async function listMeetingCalendar(
  input: MeetingCalendarQuery,
  scope: MeetingScope,
  options: MeetingServiceOptions = {},
): Promise<MeetingCalendarEntry[]> {
  void resolveConnection(options);

  const conditions: Record<string, unknown>[] = [
    { startsAt: { $lt: new Date(input.to) } },
    { endsAt: { $gt: new Date(input.from) } },
  ];

  const scopeClause = await buildScopeClause(scope, options);

  if (scopeClause) {
    conditions.push(scopeClause);
  }

  if (input.clientId) {
    conditions.push({
      clientId: new mongoose.Types.ObjectId(assertObjectId(input.clientId, 'client')),
    });
  }

  if (input.projectId) {
    conditions.push({
      projectId: new mongoose.Types.ObjectId(assertObjectId(input.projectId, 'project')),
    });
  }

  if (input.ownerUserId) {
    conditions.push({
      ownerUserId: new mongoose.Types.ObjectId(assertObjectId(input.ownerUserId, 'owner')),
    });
  }

  if (input.status) {
    conditions.push({ status: input.status });
  }

  const documents = await MeetingModel.find({ $and: conditions })
    .sort({ startsAt: 1 })
    .limit(2000)
    .lean();

  const clientIds = [...new Set(documents.map((doc) => doc.clientId.toString()))];
  const projectIds = [
    ...new Set(
      documents
        .map((doc) => doc.projectId)
        .filter((value): value is mongoose.Types.ObjectId => Boolean(value))
        .map((value) => value.toString()),
    ),
  ];
  const ownerIds = [...new Set(documents.map((doc) => doc.ownerUserId.toString()))];

  const [clientNames, projectNames, ownerNames] = await Promise.all([
    loadClientNames(clientIds),
    loadProjectNames(projectIds),
    loadUserNames(ownerIds, options),
  ]);

  return documents.map((doc) => {
    const record = doc as MeetingLike;

    return {
      id: record._id.toString(),
      title: record.title,
      clientId: record.clientId.toString(),
      clientName: clientNames.get(record.clientId.toString()) ?? null,
      projectId: record.projectId ? record.projectId.toString() : null,
      projectName: record.projectId
        ? (projectNames.get(record.projectId.toString()) ?? null)
        : null,
      ownerUserId: record.ownerUserId.toString(),
      ownerName: ownerNames.get(record.ownerUserId.toString()) ?? null,
      startsAt: asIso(record.startsAt),
      endsAt: asIso(record.endsAt),
      timezone: record.timezone,
      status: record.status,
    };
  });
}

/**
 * Role-scoped meeting aggregates for the Overview dashboard (Step 35.11).
 *
 * Every count is computed live inside the caller's scope — nothing is
 * fabricated and unauthorized meetings never leak into a figure. `today` and
 * `upcoming` cover active (scheduled/rescheduled) meetings; `pendingNotes`
 * counts completed meetings whose discussion notes are still empty; the
 * action-item counts are scoped to the same visible meetings.
 */
export async function summarizeMeetings(
  scope: MeetingScope,
  options: MeetingServiceOptions = {},
): Promise<MeetingDashboardSummary> {
  void resolveConnection(options);

  const scopeClause = await buildScopeClause(scope, options);
  const scoped = (extra: Record<string, unknown>): Record<string, unknown> =>
    scopeClause ? { $and: [scopeClause, extra] } : extra;

  const now = new Date();
  const { start: dayStart, end: dayEnd } = zonedDayRangeUtc(zonedCalendarDate(now));
  const active = { status: { $in: [...ACTIVE_MEETING_STATUSES] } };

  const [today, upcoming, completed, cancelled, pendingNotes, scopedMeetings] = await Promise.all([
    MeetingModel.countDocuments(scoped({ ...active, startsAt: { $gte: dayStart, $lt: dayEnd } })),
    MeetingModel.countDocuments(scoped({ ...active, startsAt: { $gte: now } })),
    MeetingModel.countDocuments(scoped({ status: 'completed' })),
    MeetingModel.countDocuments(scoped({ status: 'cancelled' })),
    MeetingModel.countDocuments(
      scoped({
        status: 'completed',
        $or: [{ discussionNotes: null }, { discussionNotes: { $regex: /^\s*$/ } }],
      }),
    ),
    MeetingModel.find(scopeClause ?? {})
      .select({ _id: 1 })
      .lean(),
  ]);

  let openActionItems = 0;
  let convertedActionItems = 0;

  if (scopedMeetings.length > 0) {
    const meetingIds = scopedMeetings.map((doc) => doc._id);
    const [open, converted] = await Promise.all([
      MeetingActionItemModel.countDocuments({ meetingId: { $in: meetingIds }, status: 'pending' }),
      MeetingActionItemModel.countDocuments({
        meetingId: { $in: meetingIds },
        status: 'converted',
      }),
    ]);
    openActionItems = open;
    convertedActionItems = converted;
  }

  return {
    today,
    upcoming,
    completed,
    cancelled,
    pendingNotes,
    openActionItems,
    convertedActionItems,
  };
}

/** A schedule history entry: the original schedule plus each reschedule. */
export interface MeetingScheduleHistoryEntry {
  readonly id: string;
  readonly action: 'meeting.create' | 'meeting.reschedule';
  readonly actorId: string | null;
  readonly previousValue: unknown;
  readonly newValue: unknown;
  readonly notes: string | null;
  readonly createdAt: string;
}

/**
 * List a meeting's schedule history (creation and each reschedule) oldest first.
 *
 * The original schedule is preserved in the audit trail, so history survives
 * every reschedule without creating new meeting records.
 */
export async function listMeetingScheduleHistory(
  meetingId: string,
  limit = 100,
): Promise<MeetingScheduleHistoryEntry[]> {
  const entries = await listEntityActivity('meeting', meetingId, limit);

  return entries
    .filter((entry) => entry.action === 'meeting.create' || entry.action === 'meeting.reschedule')
    .map((entry) => ({
      id: entry.id,
      action: entry.action as 'meeting.create' | 'meeting.reschedule',
      actorId: entry.actorId,
      previousValue: entry.previousValue,
      newValue: entry.newValue,
      notes: entry.notes,
      createdAt: entry.createdAt,
    }))
    .reverse();
}
