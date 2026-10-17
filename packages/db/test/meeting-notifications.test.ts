import {
  createMockWhatsAppProvider,
  MEETING_NOTIFICATION_EVENT_TYPES,
  NOTIFICATION_CLAIM_LEASE_MS,
} from '@interscale/shared';
import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  cancelMeetingRecord,
  claimDueOutbox,
  completeMeetingRecord,
  convertMeetingActionItem,
  createClientRecord,
  createMeetingActionItem,
  createMeetingRecord,
  createProjectRecord,
  ensureActiveMembership,
  getNotificationSettings,
  JobRoleModel,
  MeetingModel,
  NotificationInboxModel,
  NotificationOutboxModel,
  notifyMeetingAssigned,
  notifyMeetingReminder,
  notifyMeetingScheduled,
  processDueNotifications,
  recoverStaleClaims,
  rescheduleMeetingRecord,
  updateMeetingRecord,
  updateNotificationSettings,
  updateNotificationTemplateMappings,
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
const OTHER = new mongoose.Types.ObjectId().toString();
const ASSIGNEE = new mongoose.Types.ObjectId().toString();
const ROLE = new mongoose.Types.ObjectId().toString();

function stubDirectory(): EmployeeDirectory {
  return {
    async findById(id: string) {
      if (id === OWNER || id === OTHER || id === ASSIGNEE) {
        return { id, status: 'active', jobRoleIds: id === ASSIGNEE ? [ROLE] : [] };
      }

      return null;
    },
  };
}

const deps = () => ({ directory: stubDirectory() });

async function insertUser(
  id: string,
  options: { name?: string; phone?: string | null; optIn?: boolean; status?: string } = {},
): Promise<void> {
  const optIn = options.optIn ?? true;

  await mongoose.connection.collection('user').insertOne({
    _id: new mongoose.Types.ObjectId(id),
    name: options.name ?? 'Test User',
    email: `${id}@example.com`,
    whatsappNumber: options.phone === undefined ? '+919876543210' : options.phone,
    whatsappOptIn: optIn,
    whatsappOptInAt: optIn ? new Date() : null,
    status: options.status ?? 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

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

function createMeetingInput(clientId: string, projectId: string | null = null) {
  return {
    clientId,
    projectId,
    title: 'Singapore Campaign Review',
    agenda: null,
    ownerUserId: OWNER,
    attendeeUserIds: [] as string[],
    meetingUrl: null,
    location: null,
    date: '2026-10-17',
    startTime: '15:00',
    endTime: '16:00',
    timezone: 'Asia/Kolkata',
  };
}

/** A meeting created directly through the model (full control over the schedule). */
async function createRawMeeting(overrides: Record<string, unknown> = {}) {
  const now = Date.now();

  const [document] = await MeetingModel.create([
    {
      clientId: new mongoose.Types.ObjectId(),
      projectId: null,
      title: 'Singapore Campaign Review',
      agenda: null,
      startsAt: new Date(now + 30 * 60 * 1000),
      endsAt: new Date(now + 90 * 60 * 1000),
      timezone: 'Asia/Kolkata',
      ownerUserId: new mongoose.Types.ObjectId(OWNER),
      attendeeUserIds: [],
      status: 'scheduled',
      scheduleVersion: 1,
      createdBy: null,
      updatedBy: null,
      ...overrides,
    },
  ]);

  if (!document) {
    throw new Error('failed to create meeting');
  }

  return document;
}

describe.skipIf(!hasTestDatabase)('meeting notifications', () => {
  beforeAll(async () => {
    await connectTestDatabase('meeting_notify');
    await ensureIndexes();
  });

  beforeEach(async () => {
    await clearTestDatabase();
    await insertUser(OWNER, { name: 'Owner One' });
    await insertUser(OTHER, { name: 'Other Manager' });
    await insertUser(ASSIGNEE, { name: 'Assignee One' });
    await updateNotificationSettings({ enabled: true }, ACTOR);
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  async function scheduleMeeting(): Promise<{ meetingId: string; clientId: string }> {
    const client = await createClient('Travel Enfield');
    const project = await createProject(client.id, 'Singapore Campaign');
    await ensureActiveMembership(client.id, OWNER, ACTOR);
    await ensureActiveMembership(client.id, OTHER, ACTOR);
    await ensureActiveMembership(client.id, ASSIGNEE, ACTOR);
    const meeting = await createMeetingRecord(
      createMeetingInput(client.id, project.id),
      ACTOR,
      deps(),
    );

    return { meetingId: meeting.id, clientId: client.id };
  }

  // 1, 2, 3
  it('records an assignment intent for the owner only when a meeting is scheduled', async () => {
    const { meetingId } = await scheduleMeeting();

    const assigned = await NotificationInboxModel.findOne({ eventType: 'meeting.assigned' }).lean();
    expect(assigned).not.toBeNull();
    expect(assigned?.recipientUserId.toString()).toBe(OWNER);
    expect(assigned?.url).toBe(`/meetings/${meetingId}`);

    const outbox = await NotificationOutboxModel.findOne({ eventType: 'meeting.assigned' }).lean();
    expect(outbox?.recipientRole).toBe('manager');
    expect(outbox?.recipientUserId?.toString()).toBe(OWNER);

    // No unrelated recipient is ever messaged.
    expect(await NotificationInboxModel.countDocuments({ recipientUserId: OTHER })).toBe(0);
    expect(await NotificationOutboxModel.countDocuments({ recipientUserId: OTHER })).toBe(0);
  });

  // 4, 5
  it('schedules the reminder exactly one hour before start and renders IST time', async () => {
    await scheduleMeeting();

    const reminder = await NotificationOutboxModel.findOne({
      eventType: 'meeting.reminder',
    }).lean();
    // 15:00 Asia/Kolkata -> 09:30Z; reminder due at 08:30Z.
    expect(reminder?.scheduledAt.getTime()).toBe(Date.parse('2026-10-17T08:30:00.000Z'));

    const inbox = await NotificationInboxModel.findOne({ eventType: 'meeting.reminder' }).lean();
    expect(inbox?.body).toContain('17/10/2026 03:00 PM');
  });

  // 17
  it('de-duplicates repeated scheduling at the same schedule version', async () => {
    const { meetingId } = await scheduleMeeting();

    await notifyMeetingScheduled(meetingId, OWNER);

    expect(await NotificationOutboxModel.countDocuments({ eventType: 'meeting.assigned' })).toBe(1);
    expect(await NotificationOutboxModel.countDocuments({ eventType: 'meeting.reminder' })).toBe(1);
  });

  // 6, 7
  it('invalidates the old reminder and records a fresh pair on reschedule', async () => {
    const { meetingId } = await scheduleMeeting();
    const oldReminder = await NotificationOutboxModel.findOne({
      eventType: 'meeting.reminder',
    }).lean();

    await rescheduleMeetingRecord(
      meetingId,
      {
        date: '2026-10-17',
        startTime: '17:00',
        endTime: '18:00',
        timezone: 'Asia/Kolkata',
        reason: 'Client asked to move it',
      },
      ACTOR,
    );

    const old = await NotificationOutboxModel.findById(oldReminder?._id).lean();
    expect(old?.status).toBe('suppressed');
    expect(old?.suppressionReason).toBe('meeting_schedule_changed');

    const reminders = await NotificationOutboxModel.find({
      eventType: 'meeting.reminder',
      status: 'pending',
    }).lean();
    expect(reminders).toHaveLength(1);
    // 17:00 Asia/Kolkata -> 11:30Z; reminder due at 10:30Z.
    expect(reminders[0]?.scheduledAt.getTime()).toBe(Date.parse('2026-10-17T10:30:00.000Z'));
    expect(reminders[0]?.eventKey).not.toBe(oldReminder?.eventKey);
  });

  // 9
  it('suppresses pending intents when a meeting is cancelled', async () => {
    const { meetingId } = await scheduleMeeting();

    await cancelMeetingRecord(meetingId, { reason: 'Client unavailable' }, ACTOR);

    expect(
      await NotificationOutboxModel.countDocuments({
        status: { $in: ['pending', 'retry_scheduled'] },
      }),
    ).toBe(0);
    const suppressed = await NotificationOutboxModel.find({ status: 'suppressed' }).lean();
    expect(suppressed).toHaveLength(2);
    expect(
      suppressed.every((row) => row.suppressionReason === 'meeting_no_longer_actionable'),
    ).toBe(true);
    // In-app copies are preserved.
    expect(await NotificationInboxModel.countDocuments()).toBe(2);
  });

  // 10
  it('suppresses future reminders when a meeting is completed', async () => {
    const { meetingId } = await scheduleMeeting();

    await completeMeetingRecord(meetingId, ACTOR);

    expect(
      await NotificationOutboxModel.countDocuments({
        status: { $in: ['pending', 'retry_scheduled'] },
      }),
    ).toBe(0);
  });

  // 11
  it('suppresses stale intents and notifies the new owner on reassignment', async () => {
    const { meetingId } = await scheduleMeeting();
    const oldReminder = await NotificationOutboxModel.findOne({
      eventType: 'meeting.reminder',
    }).lean();

    await updateMeetingRecord(meetingId, { ownerUserId: OTHER }, ACTOR, deps());

    expect((await NotificationOutboxModel.findById(oldReminder?._id).lean())?.status).toBe(
      'suppressed',
    );

    const assigned = await NotificationInboxModel.findOne({
      eventType: 'meeting.assigned',
      recipientUserId: new mongoose.Types.ObjectId(OTHER),
    }).lean();
    expect(assigned).not.toBeNull();

    const otherReminders = await NotificationOutboxModel.find({
      eventType: 'meeting.reminder',
      status: 'pending',
      recipientUserId: new mongoose.Types.ObjectId(OTHER),
    }).lean();
    expect(otherReminders).toHaveLength(1);
  });

  // 21
  it('does not flood with reminders for meetings scheduled before the channel was enabled', async () => {
    await updateNotificationSettings({ enabled: false }, ACTOR);
    await scheduleMeeting();

    expect(await NotificationOutboxModel.countDocuments()).toBe(0);

    await updateNotificationSettings({ enabled: true }, ACTOR);
    // Enabling the channel never back-fills intents for existing meetings.
    expect(await NotificationOutboxModel.countDocuments()).toBe(0);
  });

  // 12
  it('suppresses a reminder when the owner has not consented', async () => {
    await mongoose.connection
      .collection('user')
      .updateOne({ _id: new mongoose.Types.ObjectId(OWNER) }, { $set: { whatsappOptIn: false } });
    const meeting = await createRawMeeting();
    await notifyMeetingScheduled(meeting._id.toString(), OWNER);

    const summary = await processDueNotifications({
      provider: createMockWhatsAppProvider(),
      settings: await getNotificationSettings(),
      workerId: 'worker-1',
    });
    expect(summary.sent).toBe(0);
    expect(summary.suppressed).toBeGreaterThan(0);
    const reminder = await NotificationOutboxModel.findOne({
      eventType: 'meeting.reminder',
    }).lean();
    expect(reminder?.suppressionReason).toBe('no_consent');
  });

  // 13
  it('suppresses a reminder for an opted-out / invalid number owner', async () => {
    await mongoose.connection
      .collection('user')
      .updateOne({ _id: new mongoose.Types.ObjectId(OWNER) }, { $set: { whatsappNumber: null } });
    const meeting = await createRawMeeting();
    await notifyMeetingAssigned(meeting._id.toString(), OWNER);

    await processDueNotifications({
      provider: createMockWhatsAppProvider(),
      settings: await getNotificationSettings(),
      workerId: 'worker-1',
    });

    const record = await NotificationOutboxModel.findOne({ eventType: 'meeting.assigned' }).lean();
    expect(record?.status).toBe('suppressed');
    expect(record?.suppressionReason).toBe('invalid_recipient');
  });

  // 14
  it('suppresses a reminder when the owner account is inactive', async () => {
    await mongoose.connection
      .collection('user')
      .updateOne({ _id: new mongoose.Types.ObjectId(OWNER) }, { $set: { status: 'inactive' } });
    const meeting = await createRawMeeting();
    await notifyMeetingAssigned(meeting._id.toString(), OWNER);

    await processDueNotifications({
      provider: createMockWhatsAppProvider(),
      settings: await getNotificationSettings(),
      workerId: 'worker-1',
    });

    const record = await NotificationOutboxModel.findOne({ eventType: 'meeting.assigned' }).lean();
    expect(record?.status).toBe('suppressed');
    expect(record?.suppressionReason).toBe('recipient_inactive');
  });

  // 15
  it('suppresses a reminder when no approved template is enabled for the event', async () => {
    const meeting = await createRawMeeting();
    await notifyMeetingAssigned(meeting._id.toString(), OWNER);
    await updateNotificationTemplateMappings(
      {
        mappings: [
          { eventType: 'meeting.assigned', templateKey: 'meeting_assigned', enabled: false },
        ],
      },
      ACTOR,
    );

    await processDueNotifications({
      provider: createMockWhatsAppProvider(),
      settings: await getNotificationSettings(),
      workerId: 'worker-1',
    });

    const record = await NotificationOutboxModel.findOne({ eventType: 'meeting.assigned' }).lean();
    expect(record?.status).toBe('suppressed');
    expect(record?.suppressionReason).toBe('template_missing');
  });

  // 16, 22
  it('sends through the mock provider (never the live Meta API) in tests', async () => {
    const provider = createMockWhatsAppProvider();
    expect(provider.kind).toBe('mock');

    const meeting = await createRawMeeting();
    await notifyMeetingAssigned(meeting._id.toString(), OWNER);

    const summary = await processDueNotifications({
      provider,
      settings: await getNotificationSettings(),
      workerId: 'worker-1',
    });

    expect(summary.sent).toBe(1);
    const record = await NotificationOutboxModel.findOne({ eventType: 'meeting.assigned' }).lean();
    expect(record?.status).toBe('sent');
    expect(record?.providerMessageId).toMatch(/^wamid\.mock\./);
  });

  // 8
  it('never delivers a stale reminder whose schedule version changed', async () => {
    const meeting = await createRawMeeting();
    await notifyMeetingReminder(meeting._id.toString(), OWNER);

    await MeetingModel.updateOne(
      { _id: meeting._id },
      { $set: { scheduleVersion: 2, startsAt: new Date(Date.now() + 45 * 60 * 1000) } },
    );

    const summary = await processDueNotifications({
      provider: createMockWhatsAppProvider(),
      settings: await getNotificationSettings(),
      workerId: 'worker-1',
    });

    expect(summary.sent).toBe(0);
    const record = await NotificationOutboxModel.findOne({ eventType: 'meeting.reminder' }).lean();
    expect(record?.status).toBe('suppressed');
    expect(record?.suppressionReason).toBe('meeting_schedule_changed');
  });

  // 18
  it('recovers a reminder after a simulated worker restart', async () => {
    const meeting = await createRawMeeting();
    await notifyMeetingAssigned(meeting._id.toString(), OWNER);
    const stale = new Date(Date.now() - 10 * 60 * 1000);
    await NotificationOutboxModel.updateOne(
      {},
      { $set: { status: 'processing', claimedAt: stale, claimedBy: 'dead-worker' } },
    );

    const recovered = await recoverStaleClaims({
      now: new Date(),
      leaseMs: NOTIFICATION_CLAIM_LEASE_MS,
    });
    expect(recovered).toBe(1);

    const summary = await processDueNotifications({
      provider: createMockWhatsAppProvider(),
      settings: await getNotificationSettings(),
      workerId: 'worker-2',
    });
    expect(summary.sent).toBe(1);
  });

  // 19
  it('never lets two workers claim the same reminder concurrently', async () => {
    const first = await createRawMeeting();
    const second = await createRawMeeting();
    await notifyMeetingAssigned(first._id.toString(), OWNER);
    await notifyMeetingAssigned(second._id.toString(), OWNER);

    const now = new Date();
    const [a, b] = await Promise.all([
      claimDueOutbox({ now, limit: 5, workerId: 'worker-a' }),
      claimDueOutbox({ now, limit: 5, workerId: 'worker-b' }),
    ]);

    const ids = [...a, ...b].map((row) => row._id.toString());
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });

  // 20
  it('uses the task-assignment pathway without a duplicate meeting notification on convert', async () => {
    const client = await createClient('Travel Enfield');
    const project = await createProject(client.id, 'Singapore Campaign');
    await ensureActiveMembership(client.id, OWNER, ACTOR);
    await ensureActiveMembership(client.id, ASSIGNEE, ACTOR);
    await JobRoleModel.create({
      key: 'graphic_designer',
      name: 'Graphic Designer',
      departmentId: new mongoose.Types.ObjectId(),
      description: null,
    });
    const meeting = await createMeetingRecord(
      createMeetingInput(client.id, project.id),
      ACTOR,
      deps(),
    );
    const item = await createMeetingActionItem(
      meeting.id,
      {
        title: 'Send revised quote',
        description: null,
        responsibleJobRoleId: ROLE,
        assignedUserId: ASSIGNEE,
        projectId: null,
        dueAt: null,
        priority: 'medium',
      },
      ACTOR,
      deps(),
    );

    // Isolate the conversion's notifications from the meeting-creation ones.
    await NotificationOutboxModel.deleteMany({});
    await NotificationInboxModel.deleteMany({});

    const result = await convertMeetingActionItem(
      meeting.id,
      item.id,
      { approvalRequired: false, approverId: null },
      ACTOR,
      deps(),
    );
    expect(result.created).toBe(true);

    const outbox = await NotificationOutboxModel.find().lean();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]?.eventType).toBe('task.assigned');
    expect(outbox[0]?.recipientUserId?.toString()).toBe(ASSIGNEE);
    expect(MEETING_NOTIFICATION_EVENT_TYPES).not.toContain(outbox[0]?.eventType);
  });
});
