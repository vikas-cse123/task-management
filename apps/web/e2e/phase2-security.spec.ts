import { expect, test, type APIRequestContext, type PlaywrightTestArgs } from '@playwright/test';
import { loadFixtures, loginAs, logout } from './helpers';

/**
 * Phase 2 HTTP-level audit evidence plus session protection (scenario 24).
 */
async function signedIn(
  playwright: PlaywrightTestArgs['playwright'],
  email: string,
  password: string,
): Promise<APIRequestContext> {
  const context = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:5174' });
  const res = await context.post('/api/auth/sign-in/email', { data: { email, password } });
  expect(res.ok()).toBe(true);
  return context;
}

test('cross-client projects and tasks return 404, never foreign data', async ({ playwright }) => {
  const { admin, manager, employee, clientB } = loadFixtures();
  const setup = await signedIn(playwright, admin.email, admin.password);

  const createdProject = await setup.post('/api/v1/projects', {
    data: {
      clientId: clientB.id,
      name: `E2E Walled garden ${Date.now().toString(36)}`,
      type: 'campaign',
    },
  });
  expect(createdProject.status()).toBe(201);
  const projectPayload = (await createdProject.json()) as { data: { id: string } };
  const hiddenProject = projectPayload.data.id;

  const createdTask = await setup.post(`/api/v1/projects/${hiddenProject}/tasks`, {
    data: { title: `E2E Walled task ${Date.now().toString(36)}` },
  });
  expect(createdTask.status()).toBe(201);
  const taskPayload = (await createdTask.json()) as { data: { id: string } };
  await setup.dispose();

  const asManager = await signedIn(playwright, manager.email, manager.password);
  expect((await asManager.get(`/api/v1/projects/${hiddenProject}`)).status()).toBe(404);
  expect((await asManager.get(`/api/v1/tasks/${taskPayload.data.id}`)).status()).toBe(404);
  expect((await asManager.get(`/api/v1/clients/${clientB.id}/projects`)).status()).toBe(200);
  await asManager.dispose();

  const asEmployee = await signedIn(playwright, employee.email, employee.password);
  expect((await asEmployee.get(`/api/v1/projects/${hiddenProject}`)).status()).toBe(404);
  expect((await asEmployee.get(`/api/v1/tasks/${taskPayload.data.id}`)).status()).toBe(404);
  await asEmployee.dispose();
});

test('employees cannot create tasks or approve without designation', async ({ playwright }) => {
  const { admin, employee, manager, jobRoleA, projectA } = loadFixtures();

  const setup = await signedIn(playwright, admin.email, admin.password);
  const created = await setup.post(`/api/v1/projects/${projectA.id}/tasks`, {
    data: {
      title: `E2E Approval-guarded ${Date.now().toString(36)}`,
      assignedUserId: employee.userId,
      assignedJobRoleId: jobRoleA.id,
      approvalRequired: true,
      approverId: manager.userId,
    },
  });
  expect(created.status()).toBe(201);
  const createdPayload = (await created.json()) as { data: { id: string } };
  await setup.dispose();

  const authed = await signedIn(playwright, employee.email, employee.password);

  const forbiddenCreate = await authed.post(`/api/v1/projects/${projectA.id}/tasks`, {
    data: { title: 'Should not exist' },
  });
  expect(forbiddenCreate.status()).toBe(403);

  expect(
    (await authed.post(`/api/v1/tasks/${createdPayload.data.id}/approve`, { data: {} })).status(),
  ).toBe(403);

  await authed.dispose();
});

test('unauthenticated project/task/dashboard routes are rejected', async ({ playwright }) => {
  const anonymous = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:5174' });

  for (const path of [
    '/api/v1/projects',
    '/api/v1/tasks',
    '/api/v1/my-tasks',
    '/api/v1/approvals/queue',
    '/api/v1/dashboard/summary',
  ]) {
    expect((await anonymous.get(path)).status(), path).toBe(401);
  }

  await anonymous.dispose();
});

test('scenario 24: logout still ends sessions and guards every Phase 2 route', async ({ page }) => {
  const { employee } = loadFixtures();

  await loginAs(page, employee.email, employee.password);
  await page.goto('/my-tasks');
  await expect(page.getByRole('heading', { name: 'My Tasks' })).toBeVisible();

  await logout(page);

  for (const path of ['/my-tasks', '/approvals', '/projects']) {
    await page.goto(path);
    await page.waitForURL(/\/login$/);
  }
});
