import type { TemplateDetail, TemplateSummary, TemplateVersionDetail } from '@interscale/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import type { TemplateService } from '../src/services/templates';
import {
  createMemoryUserAccountWriter,
  createTestAuthContext,
  createTestUser,
  TEST_PASSWORD,
  type TestAuthContext,
} from './support/test-auth';

const NOW = new Date(0).toISOString();
const TEMPLATE_ID = '507f1f77bcf86cd7994390e1';
const MISSING_ID = '507f1f77bcf86cd7994390ff';

const SUMMARY: TemplateSummary = {
  id: TEMPLATE_ID,
  key: 'destination_meta_ads_campaign',
  name: 'Destination Meta Ads Campaign',
  description: null,
  type: 'campaign',
  status: 'published',
  currentPublishedVersion: 1,
  createdBy: null,
  updatedBy: null,
  version: 1,
  createdAt: NOW,
  updatedAt: NOW,
  taskDefinitionCount: 7,
};

const VERSION: TemplateVersionDetail = {
  id: '507f1f77bcf86cd7994390e2',
  templateId: TEMPLATE_ID,
  version: 1,
  status: 'published',
  notes: null,
  basedOnVersion: null,
  nodeCount: 0,
  createdBy: null,
  updatedBy: null,
  publishedBy: null,
  publishedAt: NOW,
  createdAt: NOW,
  updatedAt: NOW,
  nodes: [],
  dependencies: [],
};

const DETAIL: TemplateDetail = {
  ...SUMMARY,
  versions: [VERSION],
  draftVersion: 2,
  draftNodeCount: 0,
};

function fakeTemplates(): TemplateService {
  return {
    async listTemplates() {
      return { data: [SUMMARY], nextCursor: null };
    },
    async getTemplate(_actor, id) {
      return id === MISSING_ID ? null : DETAIL;
    },
    async getTemplateVersion(_actor, _id, version) {
      return version === 99 ? null : VERSION;
    },
    async createTemplate(_actor, input) {
      return { ...SUMMARY, key: input.key, name: input.name };
    },
    async updateTemplate(_actor, _id, input) {
      return { ...SUMMARY, name: input.name ?? SUMMARY.name };
    },
    async replaceDraft() {
      return VERSION;
    },
    async ensureDraft() {
      return VERSION;
    },
    async validateVersion() {
      return { version: 1, result: { valid: true, errors: [] } };
    },
    async publishTemplate() {
      return SUMMARY;
    },
    async archiveTemplate() {
      return { ...SUMMARY, status: 'archived' };
    },
  };
}

function buildApp(context: TestAuthContext) {
  return createApp({
    auth: context.auth,
    userAccount: createMemoryUserAccountWriter(context.db),
    templates: fakeTemplates(),
  });
}

async function signIn(app: ReturnType<typeof createApp>, email: string) {
  const agent = request.agent(app);
  await agent.post('/api/auth/sign-in/email').send({ email, password: TEST_PASSWORD }).expect(200);
  return agent;
}

describe('template routes', () => {
  let context: TestAuthContext;

  beforeEach(() => {
    context = createTestAuthContext();
  });

  it('requires authentication', async () => {
    const app = buildApp(context);
    const res = await request(app).get('/api/v1/templates');
    expect(res.status).toBe(401);
  });

  it('forbids non-admin template management', async () => {
    await createTestUser(context.auth, { email: 'manager@test.local', accessLevel: 'Manager' });
    const app = buildApp(context);
    const agent = await signIn(app, 'manager@test.local');

    const created = await agent
      .post('/api/v1/templates')
      .send({ key: 'campaign_x', name: 'X', type: 'campaign' });
    expect(created.status).toBe(403);

    const published = await agent.post(`/api/v1/templates/${TEMPLATE_ID}/publish`).send({});
    expect(published.status).toBe(403);
  });

  it('lets managers read the published template list', async () => {
    await createTestUser(context.auth, { email: 'manager@test.local', accessLevel: 'Manager' });
    const app = buildApp(context);
    const agent = await signIn(app, 'manager@test.local');

    const res = await agent.get('/api/v1/templates');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.page).toEqual({ nextCursor: null });
  });

  it('creates, validates and publishes a template as admin', async () => {
    await createTestUser(context.auth, { email: 'admin@test.local', accessLevel: 'Admin' });
    const app = buildApp(context);
    const agent = await signIn(app, 'admin@test.local');

    const created = await agent
      .post('/api/v1/templates')
      .send({ key: 'campaign_x', name: 'Campaign X', type: 'campaign' });
    expect(created.status).toBe(201);

    const validated = await agent.post(`/api/v1/templates/${TEMPLATE_ID}/validate`).send({});
    expect(validated.status).toBe(200);
    expect(validated.body.data.result.valid).toBe(true);

    const published = await agent
      .post(`/api/v1/templates/${TEMPLATE_ID}/publish`)
      .send({ notes: 'v1' });
    expect(published.status).toBe(200);
  });

  it('updates the draft and returns version detail', async () => {
    await createTestUser(context.auth, { email: 'admin@test.local', accessLevel: 'Admin' });
    const app = buildApp(context);
    const agent = await signIn(app, 'admin@test.local');

    const saved = await agent
      .put(`/api/v1/templates/${TEMPLATE_ID}/draft`)
      .send({ nodes: [], dependencies: [] });
    expect(saved.status).toBe(200);

    const ensured = await agent.post(`/api/v1/templates/${TEMPLATE_ID}/draft`).send();
    expect(ensured.status).toBe(200);

    const missingVersion = await agent.get(`/api/v1/templates/${TEMPLATE_ID}/versions/99`);
    expect(missingVersion.status).toBe(404);
  });

  it('returns 404 for unknown templates and validates payloads', async () => {
    await createTestUser(context.auth, { email: 'admin@test.local', accessLevel: 'Admin' });
    const app = buildApp(context);
    const agent = await signIn(app, 'admin@test.local');

    const missing = await agent.get(`/api/v1/templates/${MISSING_ID}`);
    expect(missing.status).toBe(404);

    const invalidCreate = await agent.post('/api/v1/templates').send({ name: 'No key' });
    expect(invalidCreate.status).toBe(422);

    const invalidArchive = await agent.post(`/api/v1/templates/${TEMPLATE_ID}/archive`).send({});
    expect(invalidArchive.status).toBe(422);

    const archived = await agent
      .post(`/api/v1/templates/${TEMPLATE_ID}/archive`)
      .send({ reason: 'Retired' });
    expect(archived.status).toBe(200);
    expect(archived.body.data.status).toBe('archived');
  });
});
