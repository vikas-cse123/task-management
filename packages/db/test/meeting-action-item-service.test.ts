import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  cancelMeetingRecord,
  completeMeetingRecord,
  ConcurrentModificationError,
  convertMeetingActionItem,
  createClientRecord,
  createMeetingActionItem,
  createMeetingRecord,
  createProjectRecord,
  deleteMeetingActionItem,
  ensureActiveMembership,
  JobRoleModel,
  listEntityActivity,
  listMeetingActionItems,
  NotFoundError,
  TaskModel,
  updateMeetingActionItem,
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
const ROLE = new mongoose.Types.ObjectId().toString();
const ASSIGNEE = new mongoose.Types.ObjectId().toString();
const OUTSIDER = new mongoose.Types.ObjectId().toString();

function stubDirectory(): EmployeeDirectory {
  return {
    async findById(id: string) {
      if (id === OWNER) {
        return { id, status: 'active', jobRoleIds: [] };
      }

      if (id === ASSIGNEE) {
        return { id, status: 'active', jobRoleIds: [ROLE] };
      }

      if (id === OUTSIDER) {
        return { id, status: 'active', jobRoleIds: [] };
      }

      return null;
    },
  };
}

const deps = () => ({ directory: stubDirectory() });

async function seedJobRole() {
  return JobRoleModel.create({
    key: 'graphic_designer',
    name: 'Graphic Designer',
    departmentId: new mongoose.Types.ObjectId(),
    description: null,
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

async function createMeeting(clientId: string, projectId: string | null = null) {
  return createMeetingRecord(
    {
      clientId,
      projectId,
      title: 'Weekly client sync',
      agenda: null,
      ownerUserId: OWNER,
      attendeeUserIds: [],
      meetingUrl: null,
      location: null,
      date: '2026-10-17',
      startTime: '15:00',
      endTime: '16:00',
      timezone: 'Asia/Kolkata',
    },
    ACTOR,
    deps(),
  );
}

function createItemInput(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    title: 'Send revised quote',
    description: null,
    responsibleJobRoleId: ROLE,
    assignedUserId: ASSIGNEE,
    projectId: null,
    dueAt: null,
    priority: 'medium' as const,
    ...overrides,
  };
}

function convertInput(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    approvalRequired: false,
    approverId: null,
    ...overrides,
  };
}

describe.skipIf(!hasTestDatabase)('meeting action item service', () => {
  beforeAll(async () => {
    await connectTestDatabase('meeting_action_items');
    await ensureIndexes();
  });

  beforeEach(async () => {
    await clearTestDatabase();
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  it('creates a pending action item with an eligible assignee and audits it', async () => {
    const client = await createClient('Travel Enfield');
    await ensureActiveMembership(client.id, OWNER, ACTOR);
    await ensureActiveMembership(client.id, ASSIGNEE, ACTOR);
    const meeting = await createMeeting(client.id);

    const item = await createMeetingActionItem(meeting.id, createItemInput(), ACTOR, deps());

    expect(item.status).toBe('pending');
    expect(item.needsAssignment).toBe(false);
    expect(item.responsibleJobRoleId).toBe(ROLE);
    expect(item.assignedUserId).toBe(ASSIGNEE);
    expect(item.linkedTaskId).toBeNull();

    const listed = await listMeetingActionItems(meeting.id);
    expect(listed.map((row) => row.id)).toEqual([item.id]);
    expect(listed[0]?.taskStatus).toBeNull();

    const activity = await listEntityActivity('meeting_action_item', item.id);
    expect(activity.some((entry) => entry.action === 'meeting.action_item.create')).toBe(true);
  });

  it('flags an unassigned item as needing assignment', async () => {
    const role = await seedJobRole();
    const client = await createClient('Travel Enfield');
    await ensureActiveMembership(client.id, OWNER, ACTOR);
    const meeting = await createMeeting(client.id);

    const item = await createMeetingActionItem(
      meeting.id,
      createItemInput({ assignedUserId: null, responsibleJobRoleId: role.id }),
      ACTOR,
      deps(),
    );

    expect(item.assignedUserId).toBeNull();
    expect(item.needsAssignment).toBe(true);
  });

  it('rejects an assignee who does not hold the responsible role', async () => {
    const client = await createClient('Travel Enfield');
    await ensureActiveMembership(client.id, OWNER, ACTOR);
    await ensureActiveMembership(client.id, OUTSIDER, ACTOR);
    const meeting = await createMeeting(client.id);

    await expect(
      createMeetingActionItem(
        meeting.id,
        createItemInput({ assignedUserId: OUTSIDER }),
        ACTOR,
        deps(),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects a project that belongs to another client', async () => {
    const clientA = await createClient('Client A');
    const clientB = await createClient('Client B');
    const projectB = await createProject(clientB.id, 'B Campaign');
    await ensureActiveMembership(clientA.id, OWNER, ACTOR);
    await ensureActiveMembership(clientA.id, ASSIGNEE, ACTOR);
    const meeting = await createMeeting(clientA.id);

    await expect(
      createMeetingActionItem(
        meeting.id,
        createItemInput({ projectId: projectB.id }),
        ACTOR,
        deps(),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('refuses to add action items to a cancelled meeting', async () => {
    const client = await createClient('Travel Enfield');
    await ensureActiveMembership(client.id, OWNER, ACTOR);
    await ensureActiveMembership(client.id, ASSIGNEE, ACTOR);
    const meeting = await createMeeting(client.id);
    await cancelMeetingRecord(meeting.id, { reason: 'Client unavailable' }, ACTOR);

    await expect(
      createMeetingActionItem(meeting.id, createItemInput(), ACTOR, deps()),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('updates a pending action item and enforces optimistic concurrency', async () => {
    const client = await createClient('Travel Enfield');
    await ensureActiveMembership(client.id, OWNER, ACTOR);
    await ensureActiveMembership(client.id, ASSIGNEE, ACTOR);
    const meeting = await createMeeting(client.id);
    const item = await createMeetingActionItem(meeting.id, createItemInput(), ACTOR, deps());

    const updated = await updateMeetingActionItem(
      meeting.id,
      item.id,
      { title: 'Send final quote', priority: 'high' },
      ACTOR,
      deps(),
    );
    expect(updated.title).toBe('Send final quote');
    expect(updated.priority).toBe('high');

    await expect(
      updateMeetingActionItem(
        meeting.id,
        item.id,
        { title: 'Stale write', expectedVersion: 99 },
        ACTOR,
        deps(),
      ),
    ).rejects.toBeInstanceOf(ConcurrentModificationError);

    const activity = await listEntityActivity('meeting_action_item', item.id);
    expect(activity.some((entry) => entry.action === 'meeting.action_item.update')).toBe(true);
  });

  it('deletes a pending action item but never a converted one', async () => {
    const client = await createClient('Travel Enfield');
    const project = await createProject(client.id, 'Singapore Campaign');
    await ensureActiveMembership(client.id, OWNER, ACTOR);
    await ensureActiveMembership(client.id, ASSIGNEE, ACTOR);
    const meeting = await createMeeting(client.id, project.id);

    const deletable = await createMeetingActionItem(meeting.id, createItemInput(), ACTOR, deps());
    await deleteMeetingActionItem(meeting.id, deletable.id);
    expect(await listMeetingActionItems(meeting.id)).toHaveLength(0);

    const convertible = await createMeetingActionItem(meeting.id, createItemInput(), ACTOR, deps());
    await convertMeetingActionItem(meeting.id, convertible.id, convertInput(), ACTOR, deps());

    await expect(deleteMeetingActionItem(meeting.id, convertible.id)).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('converts a pending action item into a task exactly once', async () => {
    const client = await createClient('Travel Enfield');
    const project = await createProject(client.id, 'Singapore Campaign');
    await ensureActiveMembership(client.id, OWNER, ACTOR);
    await ensureActiveMembership(client.id, ASSIGNEE, ACTOR);
    const meeting = await createMeeting(client.id, project.id);
    const item = await createMeetingActionItem(meeting.id, createItemInput(), ACTOR, deps());

    const first = await convertMeetingActionItem(
      meeting.id,
      item.id,
      convertInput(),
      ACTOR,
      deps(),
    );
    expect(first.created).toBe(true);
    expect(first.actionItem.status).toBe('converted');
    expect(first.actionItem.linkedTaskId).toBe(first.taskId);

    const task = await TaskModel.findById(first.taskId).lean();
    expect(task?.sourceMeetingId?.toString()).toBe(meeting.id);
    expect(task?.title).toBe('Send revised quote');
    expect(task?.assignedUserId?.toString()).toBe(ASSIGNEE);

    const replay = await convertMeetingActionItem(
      meeting.id,
      item.id,
      convertInput(),
      ACTOR,
      deps(),
    );
    expect(replay.created).toBe(false);
    expect(replay.taskId).toBe(first.taskId);
    expect(await TaskModel.countDocuments({})).toBe(1);

    const activity = await listEntityActivity('meeting_action_item', item.id);
    expect(activity.some((entry) => entry.action === 'meeting.action_item.convert')).toBe(true);
  });

  it('requires a project before an action item can be converted', async () => {
    const client = await createClient('Travel Enfield');
    await ensureActiveMembership(client.id, OWNER, ACTOR);
    await ensureActiveMembership(client.id, ASSIGNEE, ACTOR);
    const meeting = await createMeeting(client.id);
    const item = await createMeetingActionItem(meeting.id, createItemInput(), ACTOR, deps());

    await expect(
      convertMeetingActionItem(meeting.id, item.id, convertInput(), ACTOR, deps()),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects a conversion that targets another client project', async () => {
    const clientA = await createClient('Client A');
    const clientB = await createClient('Client B');
    const projectB = await createProject(clientB.id, 'B Campaign');
    await ensureActiveMembership(clientA.id, OWNER, ACTOR);
    await ensureActiveMembership(clientA.id, ASSIGNEE, ACTOR);
    const meeting = await createMeeting(clientA.id);
    const item = await createMeetingActionItem(meeting.id, createItemInput(), ACTOR, deps());

    await expect(
      convertMeetingActionItem(
        meeting.id,
        item.id,
        convertInput({ projectId: projectB.id }),
        ACTOR,
        deps(),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('preserves action items when a meeting is completed', async () => {
    const client = await createClient('Travel Enfield');
    await ensureActiveMembership(client.id, OWNER, ACTOR);
    await ensureActiveMembership(client.id, ASSIGNEE, ACTOR);
    const meeting = await createMeeting(client.id);
    const item = await createMeetingActionItem(meeting.id, createItemInput(), ACTOR, deps());

    await completeMeetingRecord(meeting.id, ACTOR);

    const listed = await listMeetingActionItems(meeting.id);
    expect(listed.map((row) => row.id)).toEqual([item.id]);
  });

  it('returns null for an unknown action item', async () => {
    const client = await createClient('Travel Enfield');
    await ensureActiveMembership(client.id, OWNER, ACTOR);
    const meeting = await createMeeting(client.id);

    await expect(
      updateMeetingActionItem(
        meeting.id,
        new mongoose.Types.ObjectId().toString(),
        {},
        ACTOR,
        deps(),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
