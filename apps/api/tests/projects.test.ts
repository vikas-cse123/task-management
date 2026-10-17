import type { ProjectDetail } from '@interscale/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import type { ProjectService as ProjectsService } from '../src/services/projects';
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
const MISSING_ID = '507f1f77bcf86cd7994390ff';

const PROJECT: ProjectDetail = {
  id: PROJECT_ID,
  clientId: CLIENT_ID,
  name: 'Singapore Meta Ads Campaign',
  description: null,
  type: 'campaign',
  status: 'planned',
  managerId: null,
  startAt: null,
  targetAt: null,
  createdBy: null,
  updatedBy: null,
  version: 0,
  createdAt: NOW,
  updatedAt: NOW,
  progress: { total: 0, completed: 0, percent: 0 },
};

function fakeProjects(): ProjectsService {
  return {
    async listProjects() {
      return { data: [PROJECT], nextCursor: null };
    },
    async getProject(_actor, id) {
      return id === MISSING_ID ? null : PROJECT;
    },
    async createProject(_actor, input) {
      return { ...PROJECT, name: input.name, clientId: input.clientId };
    },
    async updateProject(_actor, _id, input) {
      return { ...PROJECT, name: input.name ?? PROJECT.name };
    },
    async changeProjectStatus(_actor, _id, input) {
      return { ...PROJECT, status: input.status };
    },
    async listProjectActivity() {
      return [];
    },
  };
}

function buildApp(context: TestAuthContext) {
  return createApp({
    auth: context.auth,
    userAccount: createMemoryUserAccountWriter(context.db),
    projects: fakeProjects(),
  });
}

async function signIn(app: ReturnType<typeof createApp>, email: string) {
  const agent = request.agent(app);
  await agent.post('/api/auth/sign-in/email').send({ email, password: TEST_PASSWORD }).expect(200);
  return agent;
}

describe('project routes', () => {
  let context: TestAuthContext;

  beforeEach(() => {
    context = createTestAuthContext();
  });

  it('requires authentication', async () => {
    const app = buildApp(context);
    const res = await request(app).get('/api/v1/projects');
    expect(res.status).toBe(401);
  });

  it('forbids non-admin project creation', async () => {
    await createTestUser(context.auth, { email: 'manager@test.local', accessLevel: 'Manager' });
    const app = buildApp(context);
    const agent = await signIn(app, 'manager@test.local');

    const res = await agent
      .post('/api/v1/projects')
      .send({ clientId: CLIENT_ID, name: 'Nope', type: 'campaign' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('lists projects with pagination envelope', async () => {
    await createTestUser(context.auth, { email: 'admin@test.local', accessLevel: 'Admin' });
    const app = buildApp(context);
    const agent = await signIn(app, 'admin@test.local');

    const res = await agent.get('/api/v1/projects');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.page).toEqual({ nextCursor: null });
  });

  it('creates a project as admin', async () => {
    await createTestUser(context.auth, { email: 'admin@test.local', accessLevel: 'Admin' });
    const app = buildApp(context);
    const agent = await signIn(app, 'admin@test.local');

    const res = await agent
      .post('/api/v1/projects')
      .send({ clientId: CLIENT_ID, name: 'Kashmir Meta Ads Campaign', type: 'campaign' });
    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('Kashmir Meta Ads Campaign');
  });

  it('validates the create payload', async () => {
    await createTestUser(context.auth, { email: 'admin@test.local', accessLevel: 'Admin' });
    const app = buildApp(context);
    const agent = await signIn(app, 'admin@test.local');

    const res = await agent.post('/api/v1/projects').send({});
    expect(res.status).toBe(422);
  });

  it('returns 404 for an unknown project', async () => {
    await createTestUser(context.auth, { email: 'admin@test.local', accessLevel: 'Admin' });
    const app = buildApp(context);
    const agent = await signIn(app, 'admin@test.local');

    const res = await agent.get(`/api/v1/projects/${MISSING_ID}`);
    expect(res.status).toBe(404);
  });

  it('updates a project and changes its status', async () => {
    await createTestUser(context.auth, { email: 'admin@test.local', accessLevel: 'Admin' });
    const app = buildApp(context);
    const agent = await signIn(app, 'admin@test.local');

    const updated = await agent.patch(`/api/v1/projects/${PROJECT_ID}`).send({ name: 'Renamed' });
    expect(updated.status).toBe(200);
    expect(updated.body.data.name).toBe('Renamed');

    const status = await agent
      .patch(`/api/v1/projects/${PROJECT_ID}/status`)
      .send({ status: 'live' });
    expect(status.status).toBe(200);
    expect(status.body.data.status).toBe('live');
  });

  it('reads project activity', async () => {
    await createTestUser(context.auth, { email: 'admin@test.local', accessLevel: 'Admin' });
    const app = buildApp(context);
    const agent = await signIn(app, 'admin@test.local');

    const res = await agent.get(`/api/v1/projects/${PROJECT_ID}/activity`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('lists projects nested under a client', async () => {
    await createTestUser(context.auth, { email: 'admin@test.local', accessLevel: 'Admin' });
    const app = buildApp(context);
    const agent = await signIn(app, 'admin@test.local');

    const res = await agent.get(`/api/v1/clients/${CLIENT_ID}/projects`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
});
