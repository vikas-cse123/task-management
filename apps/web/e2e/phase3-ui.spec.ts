import { expect, test, type Page, type PlaywrightTestArgs } from '@playwright/test';
import { loadFixtures, loginAs, openTask, uniqueName } from './helpers';

/** Phase 3 scenarios 25–28: workflow visibility. */

async function signedIn(
  playwright: PlaywrightTestArgs['playwright'],
  email: string,
  password: string,
) {
  const context = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:5174' });
  const res = await context.post('/api/auth/sign-in/email', { data: { email, password } });
  expect(res.ok()).toBe(true);
  return context;
}

test('scenario 25: My Tasks surfaces newly ready work', async ({ page, playwright }) => {
  const { admin, clientA, employee, jobRoleA } = loadFixtures();
  const scriptTitle = uniqueName('E2E Ready visible');

  const setup = await signedIn(playwright, admin.email, admin.password);
  const project = await setup.post('/api/v1/projects', {
    data: {
      clientId: clientA.id,
      name: `E2E Ready Project ${Date.now().toString(36)}`,
      type: 'campaign',
    },
  });
  expect(project.status()).toBe(201);
  const projectId = ((await project.json()) as { data: { id: string } }).data.id;

  const brief = await setup.post(`/api/v1/projects/${projectId}/tasks`, {
    data: {
      title: `E2E Ready brief ${Date.now().toString(36)}`,
      assignedUserId: employee.userId,
      assignedJobRoleId: jobRoleA.id,
    },
  });
  expect(brief.status()).toBe(201);
  const briefId = ((await brief.json()) as { data: { id: string } }).data.id;

  const script = await setup.post(`/api/v1/projects/${projectId}/tasks`, {
    data: {
      title: scriptTitle,
      assignedUserId: employee.userId,
      assignedJobRoleId: jobRoleA.id,
    },
  });
  expect(script.status()).toBe(201);
  const scriptId = ((await script.json()) as { data: { id: string } }).data.id;

  expect(
    (
      await setup.post(`/api/v1/tasks/${scriptId}/dependencies`, {
        data: { predecessorTaskId: briefId },
      })
    ).status(),
  ).toBe(201);

  expect((await setup.post(`/api/v1/tasks/${briefId}/start`, { data: {} })).status()).toBe(200);
  expect((await setup.post(`/api/v1/tasks/${briefId}/complete`, { data: {} })).status()).toBe(200);
  await setup.dispose();

  await loginAs(page, employee.email, employee.password);
  await page.goto('/my-tasks');
  await page.getByLabel('Search').fill(scriptTitle);
  await expect(page.getByRole('link', { name: new RegExp(scriptTitle) })).toBeVisible();
});

test('scenario 26: project detail counts refresh with workflow', async ({
  page,
}: {
  page: Page;
}) => {
  const { admin, clientA, employee, jobRoleA } = loadFixtures();
  const projectName = uniqueName('E2E Counts Project');
  const taskTitle = uniqueName('E2E Counts task');

  await loginAs(page, admin.email, admin.password);
  await page.goto('/projects');
  await page.getByRole('button', { name: 'New project' }).click();
  const form = page.locator('form');
  await form.getByLabel('Client').selectOption({ label: clientA.name });
  await form.getByLabel('Project name').fill(projectName);
  await form.getByRole('button', { name: 'Create project' }).click();
  await page
    .getByRole('link', { name: new RegExp(projectName) })
    .first()
    .click();
  await page.waitForURL(/\/projects\/[0-9a-f]{24}$/);

  await page.getByRole('button', { name: 'New task' }).click();
  await page.getByLabel('Title').fill(taskTitle);
  await page.getByLabel('Functional job role').selectOption(jobRoleA.id);
  await page
    .getByLabel('Assigned employee')
    .selectOption({ label: `E2E Employee (${employee.email})` });
  await page.getByRole('button', { name: 'Create task' }).click();
  await openTask(page, taskTitle);

  await page.getByRole('button', { name: 'Mark blocked' }).click();
  await page.getByLabel(/Reason \(required to block\)/).fill('Waiting on client');
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByText('Blocked').first()).toBeVisible();

  await page.goto('/projects');
  await page
    .getByRole('link', { name: new RegExp(projectName) })
    .first()
    .click();
  await page.waitForURL(/\/projects\/[0-9a-f]{24}$/);
  await expect(page.getByText(/1 blocked/)).toBeVisible();
});
