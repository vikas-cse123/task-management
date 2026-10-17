import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import {
  createMemoryUserAccountWriter,
  createTestAuthContext,
  createTestUser,
  setUserStatus,
  TEST_PASSWORD,
  type TestAuthContext,
} from './support/test-auth';

function buildApp(context: TestAuthContext) {
  return createApp({
    auth: context.auth,
    userAccount: createMemoryUserAccountWriter(context.db),
  });
}

describe('authentication: account creation controls', () => {
  let context: TestAuthContext;

  beforeEach(() => {
    context = createTestAuthContext();
  });

  it('disables public sign-up at the library level', async () => {
    const app = buildApp(context);
    const res = await request(app)
      .post('/api/auth/sign-up/email')
      .send({ email: 'intruder@test.local', password: TEST_PASSWORD, name: 'Intruder' });

    expect(res.status).toBe(400);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('blocks every admin-plugin HTTP path with 404', async () => {
    const app = buildApp(context);
    const paths = [
      '/api/auth/admin/create-user',
      '/api/auth/admin/list-users',
      '/api/auth/admin/set-role',
      '/api/auth/admin/remove-user',
    ];

    for (const path of paths) {
      const res = await request(app).post(path).send({});
      expect(res.status, path).toBe(404);
    }
  });
});

describe('authentication: session lifecycle', () => {
  let context: TestAuthContext;

  beforeEach(() => {
    context = createTestAuthContext();
  });

  it('rejects unauthenticated access to protected endpoints', async () => {
    const app = buildApp(context);
    const res = await request(app).get('/api/v1/me');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('logs in a valid user and returns the sanitized profile', async () => {
    await createTestUser(context.auth, { email: 'admin@test.local', accessLevel: 'Admin' });
    const app = buildApp(context);
    const agent = request.agent(app);

    await agent
      .post('/api/auth/sign-in/email')
      .send({ email: 'admin@test.local', password: TEST_PASSWORD })
      .expect(200);

    const me = await agent.get('/api/v1/me').expect(200);
    expect(me.body.data.email).toBe('admin@test.local');
    expect(me.body.data.accessLevel).toBe('Admin');
    expect(me.body.data.status).toBe('active');
    expect(me.body.data.passwordHash).toBeUndefined();
  });

  it('rejects invalid credentials', async () => {
    await createTestUser(context.auth, { email: 'admin@test.local', accessLevel: 'Admin' });
    const app = buildApp(context);

    const res = await request(app)
      .post('/api/auth/sign-in/email')
      .send({ email: 'admin@test.local', password: 'definitely-wrong' });

    expect(res.status).toBe(401);
  });

  it('refuses a session for an inactive account', async () => {
    await createTestUser(context.auth, { email: 'gone@test.local', status: 'inactive' });
    const app = buildApp(context);

    const res = await request(app)
      .post('/api/auth/sign-in/email')
      .send({ email: 'gone@test.local', password: TEST_PASSWORD });

    expect(res.status).toBe(403);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('invalidates access immediately when an account is deactivated', async () => {
    await createTestUser(context.auth, { email: 'emp@test.local' });
    const app = buildApp(context);
    const agent = request.agent(app);

    await agent
      .post('/api/auth/sign-in/email')
      .send({ email: 'emp@test.local', password: TEST_PASSWORD })
      .expect(200);
    await agent.get('/api/v1/me').expect(200);

    setUserStatus(context.db, 'emp@test.local', 'inactive');

    const blocked = await agent.get('/api/v1/me');
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('FORBIDDEN');
  });
});

describe('authentication: forced password change', () => {
  it('clears the flag after a successful change', async () => {
    const context = createTestAuthContext();
    await createTestUser(context.auth, {
      email: 'newbie@test.local',
      requiresPasswordChange: true,
    });
    const app = buildApp(context);
    const agent = request.agent(app);

    await agent
      .post('/api/auth/sign-in/email')
      .send({ email: 'newbie@test.local', password: TEST_PASSWORD })
      .expect(200);

    const before = await agent.get('/api/v1/me').expect(200);
    expect(before.body.data.requiresPasswordChange).toBe(true);

    const changed = await agent.post('/api/v1/me/change-password').send({
      currentPassword: TEST_PASSWORD,
      newPassword: 'Br4nd-new-password',
      revokeOtherSessions: true,
    });

    expect(changed.status).toBe(200);
    expect(changed.body.data.requiresPasswordChange).toBe(false);

    const after = await agent.get('/api/v1/me').expect(200);
    expect(after.body.data.requiresPasswordChange).toBe(false);
  });

  it('rejects a wrong current password', async () => {
    const context = createTestAuthContext();
    await createTestUser(context.auth, { email: 'newbie2@test.local' });
    const app = buildApp(context);
    const agent = request.agent(app);

    await agent
      .post('/api/auth/sign-in/email')
      .send({ email: 'newbie2@test.local', password: TEST_PASSWORD })
      .expect(200);

    const res = await agent.post('/api/v1/me/change-password').send({
      currentPassword: 'not-the-current-password',
      newPassword: 'An0ther-new-password',
    });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body.error.code).toBeTruthy();
  });

  it('rejects a new password that violates the policy', async () => {
    const context = createTestAuthContext();
    await createTestUser(context.auth, { email: 'newbie3@test.local' });
    const app = buildApp(context);
    const agent = request.agent(app);

    await agent
      .post('/api/auth/sign-in/email')
      .send({ email: 'newbie3@test.local', password: TEST_PASSWORD })
      .expect(200);

    const res = await agent.post('/api/v1/me/change-password').send({
      currentPassword: TEST_PASSWORD,
      newPassword: 'short',
    });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
