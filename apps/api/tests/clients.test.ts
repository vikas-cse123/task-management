import type {
  ClientRoleAssignmentView,
  ClientSummary,
  ClientTeamMemberView,
} from '@interscale/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import type { ClientService } from '../src/services/clients';
import {
  createMemoryUserAccountWriter,
  createTestAuthContext,
  createTestUser,
  TEST_PASSWORD,
  type TestAuthContext,
} from './support/test-auth';

const NOW = new Date(0).toISOString();
const CLIENT_ID = '507f1f77bcf86cd7994390c1';
const USER_ID = '507f1f77bcf86cd7994390c2';
const ASSIGNMENT_ID = '507f1f77bcf86cd7994390c3';
const JOB_ROLE_ID = '507f1f77bcf86cd7994390c4';
const MISSING_ID = '507f1f77bcf86cd7994390ff';

const CLIENT: ClientSummary = {
  id: CLIENT_ID,
  name: 'Acme Corp',
  status: 'active',
  primaryManagerId: null,
  createdAt: NOW,
  updatedAt: NOW,
};

const MEMBER: ClientTeamMemberView = {
  id: '507f1f77bcf86cd7994390c5',
  clientId: CLIENT_ID,
  userId: USER_ID,
  roleInTeam: 'member',
  isActive: true,
  createdAt: NOW,
  updatedAt: NOW,
};

const ASSIGNMENT: ClientRoleAssignmentView = {
  id: ASSIGNMENT_ID,
  clientId: CLIENT_ID,
  jobRoleId: JOB_ROLE_ID,
  userId: USER_ID,
  isPrimary: false,
  isActive: true,
  createdAt: NOW,
  updatedAt: NOW,
};

function fakeClients(): ClientService {
  return {
    async listClients() {
      return { data: [CLIENT], nextCursor: null };
    },
    async getClient(_actor, id) {
      return id === MISSING_ID ? null : CLIENT;
    },
    async createClient(_actor, input) {
      return { ...CLIENT, name: input.name };
    },
    async updateClient(_actor, _id, input) {
      return { ...CLIENT, name: input.name ?? CLIENT.name };
    },
    async listTeam() {
      return [MEMBER];
    },
    async setTeamMember(_actor, _id, userId, input) {
      return { ...MEMBER, userId, roleInTeam: input.roleInTeam ?? MEMBER.roleInTeam };
    },
    async removeTeamMember() {
      return { ...MEMBER, isActive: false };
    },
    async listRoles() {
      return [ASSIGNMENT];
    },
    async assignRole() {
      return ASSIGNMENT;
    },
    async removeRole() {
      return { ...ASSIGNMENT, isPrimary: false, isActive: false };
    },
  };
}

function buildApp(context: TestAuthContext) {
  return createApp({
    auth: context.auth,
    userAccount: createMemoryUserAccountWriter(context.db),
    clients: fakeClients(),
  });
}

async function signIn(app: ReturnType<typeof createApp>, email: string) {
  const agent = request.agent(app);
  await agent.post('/api/auth/sign-in/email').send({ email, password: TEST_PASSWORD }).expect(200);
  return agent;
}

describe('client routes', () => {
  let context: TestAuthContext;

  beforeEach(() => {
    context = createTestAuthContext();
  });

  it('requires authentication', async () => {
    const app = buildApp(context);
    const res = await request(app).get('/api/v1/clients');
    expect(res.status).toBe(401);
  });

  it('forbids non-admin client creation', async () => {
    await createTestUser(context.auth, { email: 'manager@test.local', accessLevel: 'Manager' });
    const app = buildApp(context);
    const agent = await signIn(app, 'manager@test.local');

    const res = await agent.post('/api/v1/clients').send({ name: 'Acme' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('lists clients with pagination envelope', async () => {
    await createTestUser(context.auth, { email: 'employee@test.local', accessLevel: 'Employee' });
    const app = buildApp(context);
    const agent = await signIn(app, 'employee@test.local');

    const res = await agent.get('/api/v1/clients');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.page).toEqual({ nextCursor: null });
  });

  it('validates the create payload', async () => {
    await createTestUser(context.auth, { email: 'admin@test.local', accessLevel: 'Admin' });
    const app = buildApp(context);
    const agent = await signIn(app, 'admin@test.local');

    const res = await agent.post('/api/v1/clients').send({});
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('creates a client as admin', async () => {
    await createTestUser(context.auth, { email: 'admin@test.local', accessLevel: 'Admin' });
    const app = buildApp(context);
    const agent = await signIn(app, 'admin@test.local');

    const res = await agent.post('/api/v1/clients').send({ name: 'Acme Corp' });
    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('Acme Corp');
  });

  it('returns 404 for an unknown client', async () => {
    await createTestUser(context.auth, { email: 'admin@test.local', accessLevel: 'Admin' });
    const app = buildApp(context);
    const agent = await signIn(app, 'admin@test.local');

    const res = await agent.get(`/api/v1/clients/${MISSING_ID}`);
    expect(res.status).toBe(404);
  });

  it('updates a client as admin', async () => {
    await createTestUser(context.auth, { email: 'admin@test.local', accessLevel: 'Admin' });
    const app = buildApp(context);
    const agent = await signIn(app, 'admin@test.local');

    const res = await agent.patch(`/api/v1/clients/${CLIENT_ID}`).send({ name: 'Acme Inc' });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Acme Inc');
  });

  it('manages team membership', async () => {
    await createTestUser(context.auth, { email: 'admin@test.local', accessLevel: 'Admin' });
    const app = buildApp(context);
    const agent = await signIn(app, 'admin@test.local');

    const listed = await agent.get(`/api/v1/clients/${CLIENT_ID}/team`);
    expect(listed.status).toBe(200);
    expect(listed.body.data).toHaveLength(1);

    const upserted = await agent
      .put(`/api/v1/clients/${CLIENT_ID}/team/${USER_ID}`)
      .send({ roleInTeam: 'manager' });
    expect(upserted.status).toBe(200);
    expect(upserted.body.data.roleInTeam).toBe('manager');

    const removed = await agent.delete(`/api/v1/clients/${CLIENT_ID}/team/${USER_ID}`);
    expect(removed.status).toBe(200);
    expect(removed.body.data.isActive).toBe(false);
  });

  it('manages designated roles', async () => {
    await createTestUser(context.auth, { email: 'admin@test.local', accessLevel: 'Admin' });
    const app = buildApp(context);
    const agent = await signIn(app, 'admin@test.local');

    const listed = await agent.get(`/api/v1/clients/${CLIENT_ID}/roles`);
    expect(listed.status).toBe(200);
    expect(listed.body.data).toHaveLength(1);

    const assigned = await agent
      .post(`/api/v1/clients/${CLIENT_ID}/roles`)
      .send({ jobRoleId: JOB_ROLE_ID, userId: USER_ID, isPrimary: true });
    expect(assigned.status).toBe(201);

    const removed = await agent.delete(`/api/v1/clients/${CLIENT_ID}/roles/${ASSIGNMENT_ID}`);
    expect(removed.status).toBe(200);
    expect(removed.body.data.isActive).toBe(false);
  });
});
