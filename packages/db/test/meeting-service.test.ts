import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  cancelMeetingRecord,
  completeMeetingRecord,
  ConcurrentModificationError,
  createClientRecord,
  createMeetingRecord,
  createProjectRecord,
  ensureActiveMembership,
  findMeeting,
  findMeetingDetail,
  findOverlappingMeetings,
  listEntityActivity,
  listMeetingCalendar,
  listMeetingScheduleHistory,
  listMeetings,
  NotFoundError,
  rescheduleMeetingRecord,
  summarizeMeetings,
  updateMeetingRecord,
  ValidationError,
  type EmployeeDirectory,
} from '../src';
import {
  clearTestDatabase,
  connectTestDatabase,
  disconnectTestDatabase,
  ensureIndexes,
} from './support/database';
import { hasTestDatabase } from './support/flags';

const ACTOR = new mongoose.Types.ObjectId().toString();
const OWNER = new mongoose.Types.ObjectId().toString();
const SECOND_MEMBER = new mongoose.Types.ObjectId().toString();
const ATTENDEE = new mongoose.Types.ObjectId().toString();
const OUTSIDER = new mongoose.Types.ObjectId().toString();
const INACTIVE = new mongoose.Types.ObjectId().toString();

function stubDirectory(): EmployeeDirectory {
  return {
    async findById(id: string) {
      if (id === OWNER || id === SECOND_MEMBER || id === ATTENDEE || id === OUTSIDER) {
        return { id, status: 'active', jobRoleIds: [] };
      }

      if (id === INACTIVE) {
        return { id, status: 'inactive', jobRoleIds: [] };
      }

      return null;
    },
  };
}

const deps = () => ({ directory: stubDirectory() });

async function createClient(name: string) {
  return createClientRecord({ name, status: 'active' }, ACTOR, { directory: stubDirectory() });
}

async function createProject(clientId: string, name: string) {
  return createProjectRecord(
    {
      clientId,
      name,
      description: null,
      type: 'campaign',
      status: 'planned',
      managerId: null,
      startAt: null,
      targetAt: null,
    },
    ACTOR,
    { directory: stubDirectory() },
  );
}

interface MeetingOverrides {
  clientId: string;
  projectId?: string | null;
  title?: string;
  agenda?: string | null;
  ownerUserId?: string;
  attendeeUserIds?: string[];
  meetingUrl?: string | null;
  location?: string | null;
  date?: string;
  startTime?: string;
  endTime?: string;
  timezone?: string;
}

function createInput(overrides: MeetingOverrides) {
  return {
    projectId: null,
    title: 'Weekly client sync',
    agenda: null,
    ownerUserId: OWNER,
    attendeeUserIds: [] as string[],
    meetingUrl: null,
    location: null,
    date: '2026-10-17',
    startTime: '15:00',
    endTime: '16:00',
    timezone: 'Asia/Kolkata',
    ...overrides,
  };
}

describe.skipIf(!hasTestDatabase)('meeting service', () => {
  beforeAll(async () => {
    await connectTestDatabase('meeting_service');
    await ensureIndexes();
  });

  beforeEach(async () => {
    await clearTestDatabase();
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  it('creates a meeting with a same-client project and audits it', async () => {
    const client = await createClient('Travel Enfield');
    const project = await createProject(client.id, 'Singapore Campaign');
    await ensureActiveMembership(client.id, OWNER, ACTOR);

    const meeting = await createMeetingRecord(
      createInput({
        clientId: client.id,
        projectId: project.id,
        attendeeUserIds: [ATTENDEE],
      }),
      ACTOR,
      deps(),
    );

    expect(meeting.status).toBe('scheduled');
    expect(meeting.startsAt).toBe('2026-10-17T09:30:00.000Z');
    expect(meeting.endsAt).toBe('2026-10-17T10:30:00.000Z');
    expect(meeting.scheduleVersion).toBe(1);
    expect(meeting.projectId).toBe(project.id);
    expect(meeting.attendeeUserIds).toEqual([ATTENDEE]);

    const activity = await listEntityActivity('meeting', meeting.id);
    expect(activity.some((entry) => entry.action === 'meeting.create')).toBe(true);
  });

  it('rejects a project that belongs to another client', async () => {
    const clientA = await createClient('Client A');
    const clientB = await createClient('Client B');
    const projectB = await createProject(clientB.id, 'B Campaign');
    await ensureActiveMembership(clientA.id, OWNER, ACTOR);

    await expect(
      createMeetingRecord(
        createInput({ clientId: clientA.id, projectId: projectB.id }),
        ACTOR,
        deps(),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects an inactive or ineligible owner', async () => {
    const client = await createClient('Travel Enfield');
    await ensureActiveMembership(client.id, OWNER, ACTOR);

    await expect(
      createMeetingRecord(
        createInput({ clientId: client.id, ownerUserId: INACTIVE }),
        ACTOR,
        deps(),
      ),
    ).rejects.toBeInstanceOf(ValidationError);

    await expect(
      createMeetingRecord(
        createInput({ clientId: client.id, ownerUserId: OUTSIDER }),
        ACTOR,
        deps(),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects unknown, inactive and duplicate attendees', async () => {
    const client = await createClient('Travel Enfield');
    await ensureActiveMembership(client.id, OWNER, ACTOR);

    const unknownId = new mongoose.Types.ObjectId().toString();

    await expect(
      createMeetingRecord(
        createInput({ clientId: client.id, attendeeUserIds: [unknownId] }),
        ACTOR,
        deps(),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);

    await expect(
      createMeetingRecord(
        createInput({ clientId: client.id, attendeeUserIds: [INACTIVE] }),
        ACTOR,
        deps(),
      ),
    ).rejects.toBeInstanceOf(ValidationError);

    await expect(
      createMeetingRecord(
        createInput({ clientId: client.id, attendeeUserIds: [ATTENDEE, ATTENDEE] }),
        ACTOR,
        deps(),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects an inverted or invalid schedule', async () => {
    const client = await createClient('Travel Enfield');
    await ensureActiveMembership(client.id, OWNER, ACTOR);

    await expect(
      createMeetingRecord(
        createInput({ clientId: client.id, startTime: '16:00', endTime: '15:00' }),
        ACTOR,
        deps(),
      ),
    ).rejects.toBeInstanceOf(ValidationError);

    await expect(
      createMeetingRecord(createInput({ clientId: client.id, date: '2026-02-31' }), ACTOR, deps()),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('lists meetings within scope and filters by client, status and date', async () => {
    const clientA = await createClient('Client A');
    const clientB = await createClient('Client B');
    await ensureActiveMembership(clientA.id, OWNER, ACTOR);
    await ensureActiveMembership(clientB.id, OWNER, ACTOR);

    const meetingA = await createMeetingRecord(
      createInput({ clientId: clientA.id, attendeeUserIds: [ATTENDEE] }),
      ACTOR,
      deps(),
    );
    await createMeetingRecord(createInput({ clientId: clientB.id }), ACTOR, deps());

    const byClient = await listMeetings({ limit: 50, clientId: clientA.id }, { kind: 'all' });
    expect(byClient.data.map((row) => row.id)).toEqual([meetingA.id]);

    const byDate = await listMeetings({ limit: 50, date: '2026-10-17' }, { kind: 'all' });
    expect(byDate.data).toHaveLength(2);

    const byStatus = await listMeetings({ limit: 50, status: 'scheduled' }, { kind: 'all' });
    expect(byStatus.data).toHaveLength(2);

    const participantRows = await listMeetings(
      { limit: 50 },
      { kind: 'participant', userId: ATTENDEE },
    );
    expect(participantRows.data.map((row) => row.id)).toEqual([meetingA.id]);

    const memberRows = await listMeetings({ limit: 50 }, { kind: 'member', userId: OWNER });
    expect(memberRows.data).toHaveLength(2);
  });

  it('updates meeting content and the owner with audit history', async () => {
    const client = await createClient('Travel Enfield');
    await ensureActiveMembership(client.id, OWNER, ACTOR);
    await ensureActiveMembership(client.id, SECOND_MEMBER, ACTOR);

    const meeting = await createMeetingRecord(createInput({ clientId: client.id }), ACTOR, deps());

    const updated = await updateMeetingRecord(
      meeting.id,
      { title: 'Renamed sync', agenda: 'Roadmap review' },
      ACTOR,
      deps(),
    );
    expect(updated.title).toBe('Renamed sync');
    expect(updated.agenda).toBe('Roadmap review');

    const ownerChanged = await updateMeetingRecord(
      meeting.id,
      { ownerUserId: SECOND_MEMBER },
      ACTOR,
      deps(),
    );
    expect(ownerChanged.ownerUserId).toBe(SECOND_MEMBER);

    const activity = await listEntityActivity('meeting', meeting.id);
    expect(activity.some((entry) => entry.action === 'meeting.update')).toBe(true);
    expect(activity.some((entry) => entry.action === 'meeting.owner.update')).toBe(true);
  });

  it('reschedules a meeting, retaining identity and incrementing the schedule version', async () => {
    const client = await createClient('Travel Enfield');
    await ensureActiveMembership(client.id, OWNER, ACTOR);

    const meeting = await createMeetingRecord(
      createInput({ clientId: client.id, attendeeUserIds: [ATTENDEE] }),
      ACTOR,
      deps(),
    );

    const rescheduled = await rescheduleMeetingRecord(
      meeting.id,
      {
        date: '2026-10-18',
        startTime: '16:00',
        endTime: '17:00',
        timezone: 'Asia/Kolkata',
        reason: 'Client request',
      },
      ACTOR,
    );

    expect(rescheduled.id).toBe(meeting.id);
    expect(rescheduled.status).toBe('rescheduled');
    expect(rescheduled.scheduleVersion).toBe(2);
    expect(rescheduled.startsAt).toBe('2026-10-18T10:30:00.000Z');
    expect(rescheduled.attendeeUserIds).toEqual([ATTENDEE]);
    expect(rescheduled.version).toBe(1);

    const activity = await listEntityActivity('meeting', meeting.id);
    expect(activity.some((entry) => entry.action === 'meeting.reschedule')).toBe(true);
  });

  it('cancels a meeting with a reason and blocks later reschedule', async () => {
    const client = await createClient('Travel Enfield');
    await ensureActiveMembership(client.id, OWNER, ACTOR);

    const meeting = await createMeetingRecord(createInput({ clientId: client.id }), ACTOR, deps());

    const cancelled = await cancelMeetingRecord(
      meeting.id,
      { reason: 'Client unavailable' },
      ACTOR,
    );
    expect(cancelled.status).toBe('cancelled');

    const detail = await findMeetingDetail(meeting.id);
    expect(detail?.cancelledAt).not.toBeNull();
    expect(detail?.cancellationReason).toBe('Client unavailable');

    await expect(
      rescheduleMeetingRecord(
        meeting.id,
        {
          date: '2026-10-19',
          startTime: '10:00',
          endTime: '11:00',
          timezone: 'Asia/Kolkata',
          reason: null,
        },
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(ValidationError);

    const activity = await listEntityActivity('meeting', meeting.id);
    expect(activity.some((entry) => entry.action === 'meeting.cancel')).toBe(true);
  });

  it('completes a meeting, preserves content and blocks later cancellation', async () => {
    const client = await createClient('Travel Enfield');
    await ensureActiveMembership(client.id, OWNER, ACTOR);

    const meeting = await createMeetingRecord(
      createInput({ clientId: client.id, agenda: 'Q4 planning' }),
      ACTOR,
      deps(),
    );

    const completed = await completeMeetingRecord(meeting.id, ACTOR);
    expect(completed.status).toBe('completed');

    const detail = await findMeetingDetail(meeting.id);
    expect(detail?.completedAt).not.toBeNull();
    expect(detail?.agenda).toBe('Q4 planning');

    await expect(
      cancelMeetingRecord(meeting.id, { reason: 'Too late' }, ACTOR),
    ).rejects.toBeInstanceOf(ValidationError);

    const activity = await listEntityActivity('meeting', meeting.id);
    expect(activity.some((entry) => entry.action === 'meeting.complete')).toBe(true);
  });

  it('enforces optimistic concurrency on update', async () => {
    const client = await createClient('Travel Enfield');
    await ensureActiveMembership(client.id, OWNER, ACTOR);

    const meeting = await createMeetingRecord(createInput({ clientId: client.id }), ACTOR, deps());

    await expect(
      updateMeetingRecord(meeting.id, { title: 'Stale write', expectedVersion: 99 }, ACTOR, deps()),
    ).rejects.toBeInstanceOf(ConcurrentModificationError);
  });

  it('returns null for an unknown or malformed meeting id', async () => {
    expect(await findMeeting('not-an-object-id')).toBeNull();
    expect(await findMeeting(new mongoose.Types.ObjectId().toString())).toBeNull();
  });

  it('lists calendar entries with resolved names and enforces scope isolation', async () => {
    const clientA = await createClient('Travel Enfield');
    const clientB = await createClient('Sunrise Foods');
    const projectA = await createProject(clientA.id, 'Singapore Campaign');
    await ensureActiveMembership(clientA.id, OWNER, ACTOR);
    await ensureActiveMembership(clientB.id, OWNER, ACTOR);

    const meetingA = await createMeetingRecord(
      createInput({ clientId: clientA.id, projectId: projectA.id, attendeeUserIds: [ATTENDEE] }),
      ACTOR,
      deps(),
    );
    await createMeetingRecord(createInput({ clientId: clientB.id }), ACTOR, deps());

    const range = { from: '2026-10-01T00:00:00.000Z', to: '2026-11-01T00:00:00.000Z' };

    const all = await listMeetingCalendar(range, { kind: 'all' });
    expect(all).toHaveLength(2);

    const entry = all.find((row) => row.id === meetingA.id);
    expect(entry?.clientName).toBe('Travel Enfield');
    expect(entry?.projectName).toBe('Singapore Campaign');

    const participant = await listMeetingCalendar(range, {
      kind: 'participant',
      userId: ATTENDEE,
    });
    expect(participant.map((row) => row.id)).toEqual([meetingA.id]);

    const outOfRange = await listMeetingCalendar(
      { from: '2026-11-01T00:00:00.000Z', to: '2026-12-01T00:00:00.000Z' },
      { kind: 'all' },
    );
    expect(outOfRange).toHaveLength(0);
  });

  it('detects overlapping meetings for an owner and ignores cancelled ones', async () => {
    const client = await createClient('Travel Enfield');
    await ensureActiveMembership(client.id, OWNER, ACTOR);

    const meeting = await createMeetingRecord(createInput({ clientId: client.id }), ACTOR, deps());

    const overlapping = await findOverlappingMeetings(
      {
        ownerUserId: OWNER,
        date: '2026-10-17',
        startTime: '15:30',
        endTime: '16:30',
        timezone: 'Asia/Kolkata',
      },
      { kind: 'all' },
    );
    expect(overlapping.map((row) => row.id)).toEqual([meeting.id]);

    const touching = await findOverlappingMeetings(
      {
        ownerUserId: OWNER,
        date: '2026-10-17',
        startTime: '16:00',
        endTime: '17:00',
        timezone: 'Asia/Kolkata',
      },
      { kind: 'all' },
    );
    expect(touching).toHaveLength(0);

    const excluded = await findOverlappingMeetings(
      {
        ownerUserId: OWNER,
        date: '2026-10-17',
        startTime: '15:30',
        endTime: '16:30',
        timezone: 'Asia/Kolkata',
        excludeMeetingId: meeting.id,
      },
      { kind: 'all' },
    );
    expect(excluded).toHaveLength(0);

    await cancelMeetingRecord(meeting.id, { reason: 'Client unavailable' }, ACTOR);

    const afterCancel = await findOverlappingMeetings(
      {
        ownerUserId: OWNER,
        date: '2026-10-17',
        startTime: '15:30',
        endTime: '16:30',
        timezone: 'Asia/Kolkata',
      },
      { kind: 'all' },
    );
    expect(afterCancel).toHaveLength(0);
  });

  it('preserves schedule history across reschedules', async () => {
    const client = await createClient('Travel Enfield');
    await ensureActiveMembership(client.id, OWNER, ACTOR);

    const meeting = await createMeetingRecord(createInput({ clientId: client.id }), ACTOR, deps());

    await rescheduleMeetingRecord(
      meeting.id,
      {
        date: '2026-10-18',
        startTime: '16:00',
        endTime: '17:00',
        timezone: 'Asia/Kolkata',
        reason: 'Client request',
      },
      ACTOR,
    );

    const history = await listMeetingScheduleHistory(meeting.id);
    expect(history.map((entry) => entry.action)).toEqual(['meeting.create', 'meeting.reschedule']);

    const rescheduleEntry = history.find((entry) => entry.action === 'meeting.reschedule');
    expect(rescheduleEntry?.previousValue).toMatchObject({ startsAt: meeting.startsAt });
    expect(rescheduleEntry?.newValue).toMatchObject({ scheduleVersion: 2 });
  });

  it('records discussion notes and decisions with separate audit history', async () => {
    const client = await createClient('Travel Enfield');
    await ensureActiveMembership(client.id, OWNER, ACTOR);

    const meeting = await createMeetingRecord(createInput({ clientId: client.id }), ACTOR, deps());

    const updated = await updateMeetingRecord(
      meeting.id,
      {
        discussionNotes: 'Client wants the quote revised.',
        decisions: ['Send the revised quote', 'Book a follow-up next week'],
      },
      ACTOR,
      deps(),
    );

    expect(updated.hasNotes).toBe(true);

    const detail = await findMeetingDetail(meeting.id);
    expect(detail?.discussionNotes).toBe('Client wants the quote revised.');
    expect(detail?.decisions).toEqual(['Send the revised quote', 'Book a follow-up next week']);

    const activity = await listEntityActivity('meeting', meeting.id);
    expect(activity.some((entry) => entry.action === 'meeting.notes.update')).toBe(true);
    expect(activity.some((entry) => entry.action === 'meeting.decisions.update')).toBe(true);
  });

  it('resolves display names on list/detail and summarizes scoped counts', async () => {
    const client = await createClient('Travel Enfield');
    const project = await createProject(client.id, 'Singapore Campaign');
    await ensureActiveMembership(client.id, OWNER, ACTOR);
    await mongoose.connection.collection('user').insertMany([
      { _id: new mongoose.Types.ObjectId(OWNER), name: 'Priya Sharma' },
      { _id: new mongoose.Types.ObjectId(ATTENDEE), name: 'Arjun Mehta' },
    ]);

    // Tomorrow in IST: deterministically not today, deterministically upcoming.
    const tomorrow = new Date(Date.now() + 30 * 3_600_000).toISOString().slice(0, 10);
    const meeting = await createMeetingRecord(
      createInput({
        clientId: client.id,
        projectId: project.id,
        attendeeUserIds: [ATTENDEE],
        date: tomorrow,
        startTime: '10:00',
        endTime: '11:00',
      }),
      ACTOR,
      deps(),
    );

    const listed = await listMeetings({ limit: 50 }, { kind: 'all' });
    expect(listed.data).toHaveLength(1);
    expect(listed.data[0]).toMatchObject({
      clientName: 'Travel Enfield',
      projectName: 'Singapore Campaign',
      ownerName: 'Priya Sharma',
    });

    const detail = await findMeetingDetail(meeting.id);
    expect(detail?.ownerName).toBe('Priya Sharma');
    expect(detail?.attendeeNames).toEqual([
      { userId: OWNER, name: 'Priya Sharma' },
      { userId: ATTENDEE, name: 'Arjun Mehta' },
    ]);

    const upcoming = await summarizeMeetings({ kind: 'all' });
    expect(upcoming).toMatchObject({
      today: 0,
      upcoming: 1,
      completed: 0,
      cancelled: 0,
      pendingNotes: 0,
      openActionItems: 0,
      convertedActionItems: 0,
    });

    const outsider = await summarizeMeetings({ kind: 'participant', userId: OUTSIDER });
    expect(outsider).toMatchObject({
      today: 0,
      upcoming: 0,
      completed: 0,
      cancelled: 0,
      pendingNotes: 0,
    });

    await completeMeetingRecord(meeting.id, ACTOR);
    const pending = await summarizeMeetings({ kind: 'all' });
    expect(pending).toMatchObject({ upcoming: 0, completed: 1, pendingNotes: 1 });

    await updateMeetingRecord(meeting.id, { discussionNotes: 'All resolved.' }, ACTOR, deps());
    const noted = await summarizeMeetings({ kind: 'all' });
    expect(noted).toMatchObject({ completed: 1, pendingNotes: 0 });
  });

  it('flags a completed meeting that still has no notes', async () => {
    const client = await createClient('Travel Enfield');
    await ensureActiveMembership(client.id, OWNER, ACTOR);

    const meeting = await createMeetingRecord(createInput({ clientId: client.id }), ACTOR, deps());
    expect(meeting.needsNotes).toBe(false);

    const completed = await completeMeetingRecord(meeting.id, ACTOR);
    expect(completed.status).toBe('completed');
    expect(completed.needsNotes).toBe(true);

    const noted = await updateMeetingRecord(
      meeting.id,
      { discussionNotes: 'All resolved.' },
      ACTOR,
      deps(),
    );
    expect(noted.needsNotes).toBe(false);
  });
});
