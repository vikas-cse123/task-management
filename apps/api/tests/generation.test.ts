import type {
  ProjectGenerationPreview,
  ProjectGenerationResult,
  ProjectSummary,
  UserProfile,
} from '@interscale/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { createGenerationService } from '../src/services/generation';
import type { GenerationService } from '../src/services/generation';
import {
  createMemoryUserAccountWriter,
  createTestAuthContext,
  createTestUser,
  TEST_PASSWORD,
  type TestAuthContext,
} from './support/test-auth';

const NOW = new Date(0).toISOString();
const CLIENT_ID = '507f1f77bcf86cd7994390d1';
const TEMPLATE_ID = '507f1f77bcf86cd7994390e1';
const MANAGER_ID = '507f1f77bcf86cd7994390d3';

const PROJECT: ProjectSummary = {
  id: '507f1f77bcf86cd7994390d2',
  clientId: CLIENT_ID,
  name: 'Singapore Campaign',
  description: null,
  type: 'campaign',
  status: 'planned',
  managerId: MANAGER_ID,
  startAt: NOW,
  targetAt: null,
  createdBy: null,
  updatedBy: null,
  version: 0,
  createdAt: NOW,
  updatedAt: NOW,
};

const PREVIEW: ProjectGenerationPreview = {
  clientId: CLIENT_ID,
  clientName: 'Acme Travel',
  templateId: TEMPLATE_ID,
  templateKey: 'destination_meta_ads_campaign',
  templateName: 'Destination Meta Ads Campaign',
  templateVersion: 1,
  type: 'campaign',
  name: 'Singapore Campaign',
  description: null,
  destination: 'Singapore',
  startAt: NOW,
  targetAt: null,
  managerId: MANAGER_ID,
  tasks: [],
  dependencies: [],
  warnings: [],
};

const RESULT: ProjectGenerationResult = {
  project: PROJECT,
  templateId: TEMPLATE_ID,
  templateVersion: 1,
  taskCount: 5,
  subtaskCount: 0,
  dependencyCount: 0,
  warnings: [],
  idempotentReplay: false,
};

function fakeGeneration(): GenerationService {
  return {
    async preview() {
      return PREVIEW;
    },
    async create() {
      return RESULT;
    },
  };
}

function buildApp(context: TestAuthContext) {
  return createApp({
    auth: context.auth,
    userAccount: createMemoryUserAccountWriter(context.db),
    generation: fakeGeneration(),
  });
}

async function signIn(app: ReturnType<typeof createApp>, email: string) {
  const agent = request.agent(app);
  await agent.post('/api/auth/sign-in/email').send({ email, password: TEST_PASSWORD }).expect(200);
  return agent;
}

function generationPayload(overrides: Record<string, unknown> = {}) {
  return {
    clientId: CLIENT_ID,
    templateId: TEMPLATE_ID,
    name: 'Singapore Campaign',
    destination: 'Singapore',
    startAt: '2027-03-01T00:00:00.000Z',
    videoAdCount: 3,
    creativeTypes: ['video'],
    ...overrides,
  };
}

describe('project generation routes', () => {
  let context: TestAuthContext;

  beforeEach(() => {
    context = createTestAuthContext();
  });

  it('requires authentication', async () => {
    const app = buildApp(context);
    const res = await request(app).post('/api/v1/projects/from-template/preview').send({});
    expect(res.status).toBe(401);
  });

  it('previews a generated project', async () => {
    await createTestUser(context.auth, { email: 'admin@test.local', accessLevel: 'Admin' });
    const app = buildApp(context);
    const agent = await signIn(app, 'admin@test.local');

    const res = await agent
      .post('/api/v1/projects/from-template/preview')
      .send(generationPayload());
    expect(res.status).toBe(200);
    expect(res.body.data.templateVersion).toBe(1);
  });

  it('creates a project from a template with an idempotency key', async () => {
    await createTestUser(context.auth, { email: 'admin@test.local', accessLevel: 'Admin' });
    const app = buildApp(context);
    const agent = await signIn(app, 'admin@test.local');

    const res = await agent
      .post('/api/v1/projects/from-template')
      .send(generationPayload({ idempotencyKey: 'gen-00000001' }));
    expect(res.status).toBe(201);
    expect(res.body.data.project.id).toBe(PROJECT.id);
  });

  it('validates the generation payload', async () => {
    await createTestUser(context.auth, { email: 'admin@test.local', accessLevel: 'Admin' });
    const app = buildApp(context);
    const agent = await signIn(app, 'admin@test.local');

    const missingKey = await agent.post('/api/v1/projects/from-template').send(generationPayload());
    expect(missingKey.status).toBe(422);

    const badDate = await agent
      .post('/api/v1/projects/from-template/preview')
      .send(generationPayload({ startAt: 'not-a-date' }));
    expect(badDate.status).toBe(422);
  });

  it('does not let /from-template be captured by the project id route', async () => {
    await createTestUser(context.auth, { email: 'admin@test.local', accessLevel: 'Admin' });
    const app = buildApp(context);
    const agent = await signIn(app, 'admin@test.local');

    const res = await agent
      .post('/api/v1/projects/from-template')
      .send(generationPayload({ idempotencyKey: 'gen-00000002' }));
    expect(res.status).toBe(201);
  });

  it('enforces the projects.create_from_template capability in the service', async () => {
    const service = createGenerationService({
      async findById() {
        return null;
      },
    });

    const employee: UserProfile = {
      id: MANAGER_ID,
      name: 'Employee',
      email: 'employee@test.local',
      accessLevel: 'Employee',
      status: 'active',
      jobRoleIds: [],
      capabilities: [],
      requiresPasswordChange: false,
      whatsappNumber: null,
      whatsappOptIn: false,
      whatsappOptInAt: null,
      whatsappOptInSource: null,
      createdAt: NOW,
      updatedAt: NOW,
    };

    await expect(service.preview(employee, generationPayload() as never)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});
