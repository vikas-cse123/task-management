import { expect, test, type APIRequestContext, type PlaywrightTestArgs } from '@playwright/test';
import { loadFixtures, loginAs, uniqueName } from './helpers';

/**
 * Phase 4 authorization scenarios (Step 24.8): template administration is
 * Admin-only, employees are locked out entirely, and Manager project generation
 * is limited to clients the Manager is an active member of.
 */

const BASE = 'http://127.0.0.1:5174';

async function apiAs(
  playwright: PlaywrightTestArgs['playwright'],
  email: string,
  password: string,
): Promise<APIRequestContext> {
  const context = await playwright.request.newContext({ baseURL: BASE });
  const res = await context.post('/api/auth/sign-in/email', { data: { email, password } });
  expect(res.ok()).toBe(true);
  return context;
}

function futureIso(days = 14): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

test('scenario 32: a Manager can browse published templates but cannot manage them', async ({
  page,
  playwright,
}) => {
  const { manager } = loadFixtures();

  await loginAs(page, manager.email, manager.password);
  await page.goto('/templates');
  await expect(page.getByRole('heading', { name: 'Templates' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New template' })).toHaveCount(0);

  const managerCtx = await apiAs(playwright, manager.email, manager.password);
  const mutate = await managerCtx.post('/api/v1/templates', {
    data: { key: 'manager_should_not_create', name: 'Nope', type: 'campaign' },
  });
  expect(mutate.status()).toBe(403);
});

test('scenario 34: an Employee cannot reach templates or generate projects', async ({
  page,
  playwright,
}) => {
  const { employee } = loadFixtures();

  await loginAs(page, employee.email, employee.password);
  await page.goto('/templates');
  await page.waitForURL(/\/forbidden$/);

  const employeeCtx = await apiAs(playwright, employee.email, employee.password);

  const list = await employeeCtx.get('/api/v1/templates');
  expect(list.status()).toBe(200);

  const mutate = await employeeCtx.post('/api/v1/templates', {
    data: { key: 'employee_should_not_create', name: 'Nope', type: 'campaign' },
  });
  expect(mutate.status()).toBe(403);

  const generate = await employeeCtx.post('/api/v1/projects/from-template', {
    data: {
      clientId: loadFixtures().clientA.id,
      templateId: loadFixtures().templates.campaign.id,
      name: uniqueName('E2E Employee Attempt'),
      destination: 'Singapore',
      startAt: futureIso(),
      idempotencyKey: `emp-${Date.now().toString(36)}`,
    },
  });
  expect(generate.status()).toBe(403);
});

test('scenario 33: an authorized Manager can generate only for in-scope clients', async ({
  playwright,
}) => {
  const { manager, clientA, clientB, templates } = loadFixtures();
  const managerCtx = await apiAs(playwright, manager.email, manager.password);

  const inScope = await managerCtx.post('/api/v1/projects/from-template', {
    data: {
      clientId: clientA.id,
      templateId: templates.campaign.id,
      name: uniqueName('E2E Manager In-Scope'),
      destination: 'Singapore',
      startAt: futureIso(),
      videoAdCount: 1,
      creativeTypes: ['video'],
      idempotencyKey: `mgr-a-${Date.now().toString(36)}`,
    },
  });
  expect(inScope.status()).toBe(201);

  const outOfScope = await managerCtx.post('/api/v1/projects/from-template', {
    data: {
      clientId: clientB.id,
      templateId: templates.campaign.id,
      name: uniqueName('E2E Manager Out-Of-Scope'),
      destination: 'Bali',
      startAt: futureIso(),
      videoAdCount: 1,
      creativeTypes: ['video'],
      idempotencyKey: `mgr-b-${Date.now().toString(36)}`,
    },
  });
  expect(outOfScope.status()).toBe(404);
});

test('scenario 24.8: overrides cannot assign a non-member or ineligible employee', async ({
  playwright,
}) => {
  const { admin, clientB, videoEditor, templates } = loadFixtures();
  const adminCtx = await apiAs(playwright, admin.email, admin.password);

  // videoEditor holds the role but is only a member of client A.
  const crossClient = await adminCtx.post('/api/v1/projects/from-template', {
    data: {
      clientId: clientB.id,
      templateId: templates.campaign.id,
      name: uniqueName('E2E Cross Client Override'),
      destination: 'Bali',
      startAt: futureIso(),
      videoAdCount: 1,
      creativeTypes: ['video'],
      roleOverrides: [{ jobRoleKey: 'video_editor', userId: videoEditor.userId }],
      idempotencyKey: `xo-${Date.now().toString(36)}`,
    },
  });
  expect(crossClient.status()).toBe(422);
});
