import type {
  MeetingActionItem,
  MeetingActionItemWithTask,
  MeetingDetail,
  MeetingSummary,
} from '@interscale/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import type { MeetingService } from '../src/services/meetings';
import {
  createMemoryUserAccountWriter,
  createTestAuthContext,
  createTestUser,
  TEST_PASSWORD,
  type TestAuthContext,
} from './support/test-auth';

const NOW = new Date(0).toISOString();
const CLIENT_ID = '507f1f77bcf86cd7994390d1';
const PROJECT_ID = '507f1f77bcf86cd7994390d2';
const OWNER_ID = '507f1f77bcf86cd7994390d3';
const MEETING_ID = '507f1f77bcf86cd7994390d4';
const MISSING_ID = '507f1f77bcf86cd7994390ff';

const MEETING: MeetingSummary = {
  id: MEETING_ID,
  clientId: CLIENT_ID,
  clientName: 'Travel Enfield',
  projectId: null,
  projectName: null,
  title: 'Weekly client sync',
  agenda: null,
  startsAt: '2026-10-17T09:30:00.000Z',
  endsAt: '2026-10-17T10:30:00.000Z',
  timezone: 'Asia/Kolkata',
  ownerUserId: OWNER_ID,
  ownerName: 'Priya Sharma',
  attendeeUserIds: [],
  meetingUrl: null,
  location: null,
  status: 'scheduled',
  hasNotes: false,
  needsNotes: false,
  scheduleVersion: 1,
  createdBy: null,
  updatedBy: null,
  version: 0,
  createdAt: NOW,
  updatedAt: NOW,
};

const DETAIL: MeetingDetail = {
  ...MEETING,
  discussionNotes: null,
  decisions: [],
  attendeeNames: [],
  completedAt: null,
  cancelledAt: null,
  cancellationReason: null,
  rescheduledAt: null,
};

const CALENDAR_ENTRY = {
  id: MEETING_ID,
  title: MEETING.title,
  clientId: CLIENT_ID,
  clientName: 'Travel Enfield',
  projectId: null,
  projectName: null,
  ownerUserId: OWNER_ID,
  ownerName: 'Priya Sharma',
  startsAt: MEETING.startsAt,
  endsAt: MEETING.endsAt,
  timezone: MEETING.timezone,
  status: 'scheduled' as const,
};

const HISTORY_ENTRY = {
  id: '507f1f77bcf86cd7994390a1',
  action: 'meeting.create' as const,
  actorId: null,
  previousValue: null,
  newValue: { startsAt: MEETING.startsAt },
  notes: null,
  createdAt: NOW,
};

const ACTION_ITEM: MeetingActionItem = {
  id: '507f1f77bcf86cd7994390e1',
  meetingId: MEETING_ID,
  clientId: CLIENT_ID,
  projectId: null,
  title: 'Send revised quote',
  description: null,
  responsibleJobRoleId: '507f1f77bcf86cd7994390e2',
  assignedUserId: null,
  assignedUserName: null,
  dueAt: null,
  priority: 'medium',
  status: 'pending',
  needsAssignment: true,
  linkedTaskId: null,
  createdBy: null,
  updatedBy: null,
  version: 0,
  createdAt: NOW,
  updatedAt: NOW,
};

const ACTION_ITEM_WITH_TASK: MeetingActionItemWithTask = {
  ...ACTION_ITEM,
  taskStatus: null,
};

interface RecordedCalls {
  listQuery?: Record<string, unknown>;
  clientListQuery?: { clientId: string; query: Record<string, unknown> };
  projectListQuery?: { projectId: string; query: Record<string, unknown> };
  myListQuery?: Record<string, unknown>;
  calendarQuery?: Record<string, unknown>;
  overlapQuery?: Record<string, unknown>;
  updateInput?: Record<string, unknown>;
  rescheduleInput?: Record<string, unknown>;
  cancelInput?: Record<string, unknown>;
  completeInput?: Record<string, unknown>;
  createActionItemInput?: Record<string, unknown>;
  updateActionItemInput?: Record<string, unknown>;
  convertActionItemInput?: Record<string, unknown>;
  deletedActionItemId?: string;
}

function fakeMeetings(calls: RecordedCalls): MeetingService {
  return {
    async listMeetings(_actor, query) {
      calls.listQuery = query as unknown as Record<string, unknown>;
      return { data: [MEETING], nextCursor: null };
    },
    async getMeeting(_actor, id) {
      return id === MISSING_ID ? null : DETAIL;
    },
    async createMeeting(_actor, input) {
      return { ...MEETING, title: input.title };
    },
    async updateMeeting(_actor, _id, input) {
      calls.updateInput = input as unknown as Record<string, unknown>;
      return { ...MEETING, title: input.title ?? MEETING.title };
    },
    async rescheduleMeeting(_actor, _id, input) {
      calls.rescheduleInput = input as unknown as Record<string, unknown>;
      return { ...MEETING, status: 'rescheduled', scheduleVersion: 2 };
    },
    async cancelMeeting(_actor, _id, input) {
      calls.cancelInput = input as unknown as Record<string, unknown>;
      return { ...MEETING, status: 'cancelled' };
    },
    async completeMeeting(_actor, _id, input) {
      calls.completeInput = input as unknown as Record<string, unknown>;
      return { ...MEETING, status: 'completed' };
    },
    async listClientMeetings(_actor, clientId, query) {
      calls.clientListQuery = { clientId, query: query as unknown as Record<string, unknown> };
      return { data: [MEETING], nextCursor: null };
    },
    async listProjectMeetings(_actor, projectId, query) {
      calls.projectListQuery = { projectId, query: query as unknown as Record<string, unknown> };
      return { data: [MEETING], nextCursor: null };
    },
    async listMyMeetings(_actor, query) {
      calls.myListQuery = query as unknown as Record<string, unknown>;
      return { data: [MEETING], nextCursor: null };
    },
    async getMeetingSummary() {
      return {
        today: 1,
        upcoming: 2,
        completed: 0,
        cancelled: 0,
        pendingNotes: 0,
        openActionItems: 1,
        convertedActionItems: 0,
      };
    },
    async getCalendar(_actor, query) {
      calls.calendarQuery = query as unknown as Record<string, unknown>;
      return [CALENDAR_ENTRY];
    },
    async checkOverlap(_actor, query) {
      calls.overlapQuery = query as unknown as Record<string, unknown>;
      return [MEETING];
    },
    async listScheduleHistory() {
      return [HISTORY_ENTRY];
    },
    async listActionItems() {
      return [ACTION_ITEM_WITH_TASK];
    },
    async createActionItem(_actor, _meetingId, input) {
      calls.createActionItemInput = input as unknown as Record<string, unknown>;
      return { ...ACTION_ITEM, title: input.title };
    },
    async updateActionItem(_actor, _meetingId, _actionItemId, input) {
      calls.updateActionItemInput = input as unknown as Record<string, unknown>;
      return { ...ACTION_ITEM, title: input.title ?? ACTION_ITEM.title };
    },
    async deleteActionItem(_actor, _meetingId, actionItemId) {
      calls.deletedActionItemId = actionItemId;
    },
    async convertActionItem(_actor, _meetingId, _actionItemId, input) {
      calls.convertActionItemInput = input as unknown as Record<string, unknown>;
      return {
        actionItem: {
          ...ACTION_ITEM,
          status: 'converted',
          linkedTaskId: '507f1f77bcf86cd7994390f1',
        },
        taskId: '507f1f77bcf86cd7994390f1',
        taskUrl: '/tasks/507f1f77bcf86cd7994390f1',
        created: true,
      };
    },
  };
}

function buildApp(context: TestAuthContext, calls: RecordedCalls) {
  return createApp({
    auth: context.auth,
    userAccount: createMemoryUserAccountWriter(context.db),
    meetings: fakeMeetings(calls),
  });
}

async function signIn(app: ReturnType<typeof createApp>, email: string) {
  const agent = request.agent(app);
  await agent.post('/api/auth/sign-in/email').send({ email, password: TEST_PASSWORD }).expect(200);
  return agent;
}

describe('meeting routes', () => {
  let context: TestAuthContext;
  let calls: RecordedCalls;

  beforeEach(() => {
    context = createTestAuthContext();
    calls = {};
  });

  it('requires authentication', async () => {
    const app = buildApp(context, calls);
    const res = await request(app).get('/api/v1/meetings');

    expect(res.status).toBe(401);
  });

  it('lists meetings with a pagination envelope', async () => {
    await createTestUser(context.auth, { email: 'manager@test.local', accessLevel: 'Manager' });
    const app = buildApp(context, calls);
    const agent = await signIn(app, 'manager@test.local');

    const res = await agent.get('/api/v1/meetings?status=scheduled&limit=10');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.page).toEqual({ nextCursor: null });
    expect(calls.listQuery).toMatchObject({ status: 'scheduled', limit: 10 });
  });

  it('creates a meeting', async () => {
    await createTestUser(context.auth, { email: 'manager@test.local', accessLevel: 'Manager' });
    const app = buildApp(context, calls);
    const agent = await signIn(app, 'manager@test.local');

    const res = await agent.post('/api/v1/meetings').send({
      clientId: CLIENT_ID,
      title: 'Kickoff call',
      ownerUserId: OWNER_ID,
      date: '2026-10-17',
      startTime: '15:00',
      endTime: '16:00',
    });

    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe('Kickoff call');
  });

  it('rejects an invalid schedule with 422', async () => {
    await createTestUser(context.auth, { email: 'manager@test.local', accessLevel: 'Manager' });
    const app = buildApp(context, calls);
    const agent = await signIn(app, 'manager@test.local');

    const res = await agent.post('/api/v1/meetings').send({
      clientId: CLIENT_ID,
      title: 'Kickoff call',
      ownerUserId: OWNER_ID,
      date: '2026-10-17',
      startTime: '16:00',
      endTime: '15:00',
    });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 for an unknown meeting', async () => {
    await createTestUser(context.auth, { email: 'manager@test.local', accessLevel: 'Manager' });
    const app = buildApp(context, calls);
    const agent = await signIn(app, 'manager@test.local');

    const res = await agent.get(`/api/v1/meetings/${MISSING_ID}`);
    expect(res.status).toBe(404);
  });

  it('returns meeting detail and activity-free content', async () => {
    await createTestUser(context.auth, { email: 'manager@test.local', accessLevel: 'Manager' });
    const app = buildApp(context, calls);
    const agent = await signIn(app, 'manager@test.local');

    const res = await agent.get(`/api/v1/meetings/${MEETING_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.data.decisions).toEqual([]);
  });

  it('routes reschedule, complete and cancel actions', async () => {
    await createTestUser(context.auth, { email: 'manager@test.local', accessLevel: 'Manager' });
    const app = buildApp(context, calls);
    const agent = await signIn(app, 'manager@test.local');

    const rescheduled = await agent
      .post(`/api/v1/meetings/${MEETING_ID}/reschedule`)
      .send({ date: '2026-10-18', startTime: '16:00', endTime: '17:00' });
    expect(rescheduled.status).toBe(200);
    expect(calls.rescheduleInput).toMatchObject({ date: '2026-10-18', startTime: '16:00' });

    const completed = await agent.post(`/api/v1/meetings/${MEETING_ID}/complete`).send({});
    expect(completed.status).toBe(200);

    const cancelled = await agent
      .post(`/api/v1/meetings/${MEETING_ID}/cancel`)
      .send({ reason: 'Client unavailable' });
    expect(cancelled.status).toBe(200);
    expect(calls.cancelInput).toMatchObject({ reason: 'Client unavailable' });
  });

  it('requires a cancellation reason', async () => {
    await createTestUser(context.auth, { email: 'manager@test.local', accessLevel: 'Manager' });
    const app = buildApp(context, calls);
    const agent = await signIn(app, 'manager@test.local');

    const res = await agent.post(`/api/v1/meetings/${MEETING_ID}/cancel`).send({});
    expect(res.status).toBe(422);
  });

  it('serves client, project and personal meeting lists', async () => {
    await createTestUser(context.auth, { email: 'manager@test.local', accessLevel: 'Manager' });
    const app = buildApp(context, calls);
    const agent = await signIn(app, 'manager@test.local');

    const byClient = await agent.get(`/api/v1/clients/${CLIENT_ID}/meetings`);
    expect(byClient.status).toBe(200);
    expect(calls.clientListQuery?.clientId).toBe(CLIENT_ID);

    const byProject = await agent.get(`/api/v1/projects/${PROJECT_ID}/meetings`);
    expect(byProject.status).toBe(200);
    expect(calls.projectListQuery?.projectId).toBe(PROJECT_ID);

    const mine = await agent.get('/api/v1/me/meetings');
    expect(mine.status).toBe(200);
    expect(calls.myListQuery).toBeDefined();
  });

  it('serves the scoped meeting summary', async () => {
    await createTestUser(context.auth, { email: 'manager@test.local', accessLevel: 'Manager' });
    const app = buildApp(context, calls);
    const agent = await signIn(app, 'manager@test.local');

    const res = await agent.get('/api/v1/meetings/summary');

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ today: 1, upcoming: 2, openActionItems: 1 });
  });

  it('serves calendar entries for a range', async () => {
    await createTestUser(context.auth, { email: 'manager@test.local', accessLevel: 'Manager' });
    const app = buildApp(context, calls);
    const agent = await signIn(app, 'manager@test.local');

    const res = await agent.get(
      '/api/v1/meetings/calendar?from=2026-10-01T00:00:00.000Z&to=2026-11-01T00:00:00.000Z',
    );

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].clientName).toBe('Travel Enfield');
    expect(calls.calendarQuery).toMatchObject({ from: '2026-10-01T00:00:00.000Z' });
  });

  it('rejects an inverted calendar range with 422', async () => {
    await createTestUser(context.auth, { email: 'manager@test.local', accessLevel: 'Manager' });
    const app = buildApp(context, calls);
    const agent = await signIn(app, 'manager@test.local');

    const res = await agent.get(
      '/api/v1/meetings/calendar?from=2026-11-01T00:00:00.000Z&to=2026-10-01T00:00:00.000Z',
    );

    expect(res.status).toBe(422);
  });

  it('reports overlapping meetings as a warning', async () => {
    await createTestUser(context.auth, { email: 'manager@test.local', accessLevel: 'Manager' });
    const app = buildApp(context, calls);
    const agent = await signIn(app, 'manager@test.local');

    const res = await agent.get(
      `/api/v1/meetings/overlap?ownerUserId=${OWNER_ID}&date=2026-10-17&startTime=15:00&endTime=16:00`,
    );

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(calls.overlapQuery).toMatchObject({ ownerUserId: OWNER_ID, date: '2026-10-17' });
  });

  it('serves meeting schedule history', async () => {
    await createTestUser(context.auth, { email: 'manager@test.local', accessLevel: 'Manager' });
    const app = buildApp(context, calls);
    const agent = await signIn(app, 'manager@test.local');

    const res = await agent.get(`/api/v1/meetings/${MEETING_ID}/history`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].action).toBe('meeting.create');
  });

  it('lists action items with task status enrichment', async () => {
    await createTestUser(context.auth, { email: 'manager@test.local', accessLevel: 'Manager' });
    const app = buildApp(context, calls);
    const agent = await signIn(app, 'manager@test.local');

    const res = await agent.get(`/api/v1/meetings/${MEETING_ID}/action-items`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({ title: 'Send revised quote', taskStatus: null });
  });

  it('creates an action item', async () => {
    await createTestUser(context.auth, { email: 'manager@test.local', accessLevel: 'Manager' });
    const app = buildApp(context, calls);
    const agent = await signIn(app, 'manager@test.local');

    const res = await agent
      .post(`/api/v1/meetings/${MEETING_ID}/action-items`)
      .send({ title: 'Book follow-up call', responsibleJobRoleId: '507f1f77bcf86cd7994390e2' });

    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe('Book follow-up call');
    expect(calls.createActionItemInput).toMatchObject({ title: 'Book follow-up call' });
  });

  it('updates and deletes an action item', async () => {
    await createTestUser(context.auth, { email: 'manager@test.local', accessLevel: 'Manager' });
    const app = buildApp(context, calls);
    const agent = await signIn(app, 'manager@test.local');

    const updated = await agent
      .patch(`/api/v1/meetings/${MEETING_ID}/action-items/${ACTION_ITEM.id}`)
      .send({ title: 'Send final quote' });

    expect(updated.status).toBe(200);
    expect(calls.updateActionItemInput).toMatchObject({ title: 'Send final quote' });

    const removed = await agent.delete(
      `/api/v1/meetings/${MEETING_ID}/action-items/${ACTION_ITEM.id}`,
    );

    expect(removed.status).toBe(204);
    expect(calls.deletedActionItemId).toBe(ACTION_ITEM.id);
  });

  it('converts an action item into a task', async () => {
    await createTestUser(context.auth, { email: 'manager@test.local', accessLevel: 'Manager' });
    const app = buildApp(context, calls);
    const agent = await signIn(app, 'manager@test.local');

    const res = await agent
      .post(`/api/v1/meetings/${MEETING_ID}/action-items/${ACTION_ITEM.id}/create-task`)
      .send({ projectId: PROJECT_ID, assignedUserId: OWNER_ID });

    expect(res.status).toBe(201);
    expect(res.body.data.created).toBe(true);
    expect(res.body.data.taskId).toBeDefined();
    expect(calls.convertActionItemInput).toMatchObject({ projectId: PROJECT_ID });
  });
});
