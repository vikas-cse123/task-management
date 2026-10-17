import type { UserProfile } from '@interscale/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import type { EmployeeAdminService } from '../src/services/employees';
import type { ReferenceDataService } from '../src/services/reference-data';
import {
  createMemoryUserAccountWriter,
  createTestAuthContext,
  createTestUser,
  TEST_PASSWORD,
  type TestAuthContext,
} from './support/test-auth';

const PROFILE: UserProfile = {
  id: '507f1f77bcf86cd799439011',
  name: 'Test User',
  email: 'test@test.local',
  accessLevel: 'Employee',
  status: 'active',
  jobRoleIds: [],
  capabilities: [],
  requiresPasswordChange: false,
  whatsappNumber: null,
  whatsappOptIn: false,
  whatsappOptInAt: null,
  whatsappOptInSource: null,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

const NOW = new Date(0).toISOString();

function fakeEmployeeAdmin(): EmployeeAdminService {
  return {
    async list() {
      return { data: [PROFILE], nextCursor: null };
    },
    async get(id) {
      return id === '507f1f77bcf86cd7994390ff' ? null : PROFILE;
    },
    async create(_actorId, input) {
      return { user: { ...PROFILE, email: input.email }, temporaryPassword: 'temp-pass-123' };
    },
    async update() {
      return PROFILE;
    },
    async revokeSessions() {
      return { revoked: 3 };
    },
  };
}

function fakeReferenceData(): ReferenceDataService {
  const department = {
    id: '507f1f77bcf86cd7994390aa',
    key: 'creative_production',
    name: 'Creative Production',
    description: null,
    createdAt: NOW,
    updatedAt: NOW,
  };

  return {
    async listDepartments() {
      return [department];
    },
    async listJobRoles() {
      return [];
    },
    async updateDepartment(_actorId, _id, patch) {
      return { ...department, name: patch.name ?? department.name };
    },
    async updateJobRole() {
      return {
        id: '507f1f77bcf86cd7994390bb',
        key: 'video_editor',
        name: 'Video Editor',
        departmentId: department.id,
        description: null,
        createdAt: NOW,
        updatedAt: NOW,
      };
    },
  };
}

function buildApp(context: TestAuthContext) {
  return createApp({
    auth: context.auth,
    userAccount: createMemoryUserAccountWriter(context.db),
    employeeAdmin: fakeEmployeeAdmin(),
    referenceData: fakeReferenceData(),
  });
}

async function signIn(app: ReturnType<typeof createApp>, email: string) {
  const agent = request.agent(app);
  await agent.post('/api/auth/sign-in/email').send({ email, password: TEST_PASSWORD }).expect(200);
  return agent;
}

describe('employee administration routes', () => {
  let context: TestAuthContext;

  beforeEach(() => {
    context = createTestAuthContext();
  });

  it('requires authentication', async () => {
    const app = buildApp(context);
    const res = await request(app).get('/api/v1/users');
    expect(res.status).toBe(401);
  });

  it('forbids non-admin users', async () => {
    await createTestUser(context.auth, { email: 'employee@test.local', accessLevel: 'Employee' });
    const app = buildApp(context);
    const agent = await signIn(app, 'employee@test.local');

    const res = await agent.get('/api/v1/users');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('lists employees for an admin', async () => {
    await createTestUser(context.auth, { email: 'admin@test.local', accessLevel: 'Admin' });
    const app = buildApp(context);
    const agent = await signIn(app, 'admin@test.local');

    const res = await agent.get('/api/v1/users');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.page).toEqual({ nextCursor: null });
  });

  it('validates the create payload', async () => {
    await createTestUser(context.auth, { email: 'admin@test.local', accessLevel: 'Admin' });
    const app = buildApp(context);
    const agent = await signIn(app, 'admin@test.local');

    const res = await agent.post('/api/v1/users').send({});
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('creates an employee and returns the one-time password', async () => {
    await createTestUser(context.auth, { email: 'admin@test.local', accessLevel: 'Admin' });
    const app = buildApp(context);
    const agent = await signIn(app, 'admin@test.local');

    const res = await agent
      .post('/api/v1/users')
      .send({ name: 'New Hire', email: 'new.hire@test.local', accessLevel: 'Manager' });

    expect(res.status).toBe(201);
    expect(res.body.data.temporaryPassword).toBe('temp-pass-123');
    expect(res.body.data.user.email).toBe('new.hire@test.local');
  });

  it('returns 404 for an unknown employee', async () => {
    await createTestUser(context.auth, { email: 'admin@test.local', accessLevel: 'Admin' });
    const app = buildApp(context);
    const agent = await signIn(app, 'admin@test.local');

    const res = await agent.get('/api/v1/users/507f1f77bcf86cd7994390ff');
    expect(res.status).toBe(404);
  });

  it('updates an employee and revokes sessions', async () => {
    await createTestUser(context.auth, { email: 'admin@test.local', accessLevel: 'Admin' });
    const app = buildApp(context);
    const agent = await signIn(app, 'admin@test.local');

    await agent
      .patch('/api/v1/users/507f1f77bcf86cd799439011')
      .send({ name: 'Renamed' })
      .expect(200);

    const revoked = await agent.post('/api/v1/users/507f1f77bcf86cd799439011/sessions/revoke');
    expect(revoked.status).toBe(200);
    expect(revoked.body.data.revoked).toBe(3);
  });
});

describe('reference data routes', () => {
  let context: TestAuthContext;

  beforeEach(() => {
    context = createTestAuthContext();
  });

  it('lets any active user read departments', async () => {
    await createTestUser(context.auth, { email: 'employee@test.local', accessLevel: 'Employee' });
    const app = buildApp(context);
    const agent = await signIn(app, 'employee@test.local');

    const res = await agent.get('/api/v1/reference-data/departments');
    expect(res.status).toBe(200);
    expect(res.body.data[0].key).toBe('creative_production');
  });

  it('forbids non-admins from editing departments', async () => {
    await createTestUser(context.auth, { email: 'employee@test.local', accessLevel: 'Employee' });
    const app = buildApp(context);
    const agent = await signIn(app, 'employee@test.local');

    const res = await agent
      .patch('/api/v1/reference-data/departments/507f1f77bcf86cd7994390aa')
      .send({ name: 'Hacked' });

    expect(res.status).toBe(403);
  });

  it('lets an admin edit a department', async () => {
    await createTestUser(context.auth, { email: 'admin@test.local', accessLevel: 'Admin' });
    const app = buildApp(context);
    const agent = await signIn(app, 'admin@test.local');

    const res = await agent
      .patch('/api/v1/reference-data/departments/507f1f77bcf86cd7994390aa')
      .send({ name: 'Creative Ops' });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Creative Ops');
  });
});
