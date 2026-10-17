import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import type { NotificationApiService } from '../src/services/notifications';
import {
  createMemoryUserAccountWriter,
  createTestAuthContext,
  createTestUser,
  TEST_PASSWORD,
  type TestAuthContext,
} from './support/test-auth';

const OID = '64b7f9c2f1a2b3c4d5e6f7a8';

function fakeNotifications(): NotificationApiService {
  return {
    async listCenter(actor, query) {
      return {
        data: [
          {
            id: OID,
            eventType: 'task.assigned',
            category: 'task',
            title: `Hello ${actor.id}`,
            body: 'You have a new task',
            url: '/tasks/1',
            taskId: OID,
            projectId: null,
            clientId: null,
            readAt: null,
            createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
          },
        ],
        nextCursor: query.unreadOnly ? null : 'next',
      };
    },
    async getUnreadCount() {
      return 3;
    },
    async markRead(_actor, notificationId) {
      return notificationId === OID;
    },
    async markAllRead() {
      return 2;
    },
    async updateConsent(_actor, input) {
      return {
        whatsappNumber: input.whatsappNumber,
        whatsappOptIn: input.whatsappOptIn,
        whatsappOptInAt: input.whatsappOptIn
          ? new Date('2026-01-01T00:00:00.000Z').toISOString()
          : null,
        whatsappOptInSource: input.whatsappOptIn ? 'self_service' : null,
      };
    },
    async getSettings() {
      return {
        enabled: false,
        dueSoonLeadHours: 24,
        escalationAfterHours: 24,
        reviewIntervalDays: 7,
        activatedAt: null,
        updatedAt: null,
        updatedBy: null,
      };
    },
    async updateSettings(_actor, input) {
      return {
        enabled: input.enabled ?? false,
        dueSoonLeadHours: input.dueSoonLeadHours ?? 24,
        escalationAfterHours: input.escalationAfterHours ?? 24,
        reviewIntervalDays: input.reviewIntervalDays ?? 7,
        activatedAt: null,
        updatedAt: new Date('2026-01-02T00:00:00.000Z').toISOString(),
        updatedBy: OID,
      };
    },
    async getTemplateMappings() {
      return [];
    },
    async updateTemplateMappings() {
      return [];
    },
    async listLogs() {
      return { data: [], nextCursor: null };
    },
    async getStats() {
      return {
        pending: 0,
        processing: 0,
        sent: 0,
        delivered: 0,
        read: 0,
        retryScheduled: 0,
        failed: 0,
        suppressed: 0,
        unreadInApp: 3,
      };
    },
    async getIntegrationStatus() {
      return {
        channelEnabled: false,
        providerConfigured: false,
        providerKind: 'disabled',
        webhookConfigured: false,
        templatesValid: true,
        warnings: [],
      };
    },
    async retry(outboxId) {
      return outboxId === OID;
    },
  };
}

function buildApp(context: TestAuthContext) {
  return createApp({
    auth: context.auth,
    userAccount: createMemoryUserAccountWriter(context.db),
    notifications: fakeNotifications(),
  });
}

async function signIn(app: ReturnType<typeof createApp>, email: string) {
  const agent = request.agent(app);
  await agent.post('/api/auth/sign-in/email').send({ email, password: TEST_PASSWORD }).expect(200);
  return agent;
}

describe('notification routes', () => {
  let context: TestAuthContext;

  beforeEach(() => {
    context = createTestAuthContext();
  });

  it('requires authentication for the notification center', async () => {
    const app = buildApp(context);
    const res = await request(app).get('/api/v1/notifications');
    expect(res.status).toBe(401);
  });

  it('lists notifications for the signed-in user', async () => {
    await createTestUser(context.auth, { email: 'employee@test.local', accessLevel: 'Employee' });
    const app = buildApp(context);
    const agent = await signIn(app, 'employee@test.local');

    const res = await agent.get('/api/v1/notifications').query({ unreadOnly: 'true' });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].eventType).toBe('task.assigned');
  });

  it('rejects a non-boolean unreadOnly query value', async () => {
    await createTestUser(context.auth, { email: 'employee@test.local', accessLevel: 'Employee' });
    const app = buildApp(context);
    const agent = await signIn(app, 'employee@test.local');

    const res = await agent.get('/api/v1/notifications').query({ unreadOnly: 'maybe' });
    expect(res.status).toBe(422);
  });

  it('returns an unread count', async () => {
    await createTestUser(context.auth, { email: 'employee@test.local', accessLevel: 'Employee' });
    const app = buildApp(context);
    const agent = await signIn(app, 'employee@test.local');

    const res = await agent.get('/api/v1/notifications/unread-count');
    expect(res.status).toBe(200);
    expect(res.body.data.count).toBe(3);
  });

  it('marks a notification read and 404s for unknown ids', async () => {
    await createTestUser(context.auth, { email: 'employee@test.local', accessLevel: 'Employee' });
    const app = buildApp(context);
    const agent = await signIn(app, 'employee@test.local');

    expect((await agent.post(`/api/v1/notifications/${OID}/read`)).status).toBe(200);
    expect((await agent.post(`/api/v1/notifications/${OID.slice(0, -1)}f/read`)).status).toBe(404);
  });

  it('updates WhatsApp consent and rejects opting in without a number', async () => {
    await createTestUser(context.auth, { email: 'employee@test.local', accessLevel: 'Employee' });
    const app = buildApp(context);
    const agent = await signIn(app, 'employee@test.local');

    const invalid = await agent
      .post('/api/v1/me/notification-consent')
      .send({ whatsappOptIn: true, whatsappNumber: null });
    expect(invalid.status).toBe(422);

    const valid = await agent
      .post('/api/v1/me/notification-consent')
      .send({ whatsappOptIn: true, whatsappNumber: '+919812345678' });
    expect(valid.status).toBe(200);
    expect(valid.body.data.whatsappOptIn).toBe(true);
    expect(valid.body.data.whatsappOptInSource).toBe('self_service');
  });

  it('denies notification administration to non-admins', async () => {
    await createTestUser(context.auth, { email: 'employee@test.local', accessLevel: 'Employee' });
    await createTestUser(context.auth, { email: 'manager@test.local', accessLevel: 'Manager' });
    const app = buildApp(context);

    const employee = await signIn(app, 'employee@test.local');
    expect((await employee.get('/api/v1/notification-settings')).status).toBe(403);
    expect((await employee.get('/api/v1/notification-logs')).status).toBe(403);

    const manager = await signIn(app, 'manager@test.local');
    expect((await manager.get('/api/v1/notification-settings')).status).toBe(403);
  });

  it('allows admins to read settings and retry failed deliveries', async () => {
    await createTestUser(context.auth, { email: 'admin@test.local', accessLevel: 'Admin' });
    const app = buildApp(context);
    const admin = await signIn(app, 'admin@test.local');

    const settings = await admin.get('/api/v1/notification-settings');
    expect(settings.status).toBe(200);
    expect(settings.body.data.reviewIntervalDays).toBe(7);

    const retry = await admin.post(`/api/v1/notification-outbox/${OID}/retry`);
    expect(retry.status).toBe(200);

    const missing = await admin.post(`/api/v1/notification-outbox/${OID.slice(0, -1)}f/retry`);
    expect(missing.status).toBe(404);
  });

  it('validates settings updates', async () => {
    await createTestUser(context.auth, { email: 'admin@test.local', accessLevel: 'Admin' });
    const app = buildApp(context);
    const admin = await signIn(app, 'admin@test.local');

    expect((await admin.patch('/api/v1/notification-settings').send({})).status).toBe(422);
    const ok = await admin.patch('/api/v1/notification-settings').send({ enabled: true });
    expect(ok.status).toBe(200);
    expect(ok.body.data.enabled).toBe(true);
  });
});
