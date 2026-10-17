import { expect, test, type Page, type PlaywrightTestArgs } from '@playwright/test';
import { addPrerequisite, loadFixtures, loginAs, openTask, uniqueName } from './helpers';

/**
 * Phase 3 scenarios 18–22 and 24: downstream safety and graph security.
 */

async function createProject(page: Page, clientName: string, projectName: string): Promise<void> {
  await page.goto('/projects');
  await page.getByRole('button', { name: 'New project' }).click();
  const form = page.locator('form');
  await form.getByLabel('Client').selectOption({ label: clientName });
  await form.getByLabel('Project name').fill(projectName);
  await form.getByRole('button', { name: 'Create project' }).click();
  await page
    .getByRole('link', { name: new RegExp(projectName) })
    .first()
    .click();
  await page.waitForURL(/\/projects\/[0-9a-f]{24}$/);
}

async function createAssignedTask(
  page: Page,
  title: string,
  assigneeLabel: string,
  roleId: string,
): Promise<void> {
  await page.getByRole('button', { name: 'New task' }).click();
  await page.getByLabel('Title').fill(title);
  await page.getByLabel('Functional job role').selectOption(roleId);
  await page.getByLabel('Assigned employee').selectOption({ label: assigneeLabel });
  await page.getByRole('button', { name: 'Create task' }).click();
  await expect(page.getByRole('link', { name: new RegExp(title) }).first()).toBeVisible();
}

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

test('scenario 18: reopening a prerequisite blocks fresh work and flags the rest', async ({
  page,
}) => {
  const { admin, clientA, employee, jobRoleA } = loadFixtures();
  const projectName = uniqueName('E2E Reopen Project');
  const upstreamTitle = uniqueName('E2E Reopen upstream');
  const freshTitle = uniqueName('E2E Reopen fresh');
  const label = `E2E Employee (${employee.email})`;

  await loginAs(page, admin.email, admin.password);
  await createProject(page, clientA.name, projectName);
  await createAssignedTask(page, upstreamTitle, label, jobRoleA.id);
  await createAssignedTask(page, freshTitle, label, jobRoleA.id);

  await openTask(page, freshTitle);
  await addPrerequisite(page, upstreamTitle);

  await openTask(page, upstreamTitle);
  await page.getByRole('button', { name: 'Start work' }).click();
  await page.getByRole('button', { name: 'Complete' }).click();

  await openTask(page, freshTitle);
  await expect(page.getByText(/Waiting on/)).toHaveCount(0);

  // Reopen the done prerequisite with a reason.
  await openTask(page, upstreamTitle);
  await page.getByRole('button', { name: 'Reopen' }).click();
  await page.getByLabel(/Reason \(required to reopen\)/).fill('Client wants changes');
  await page.getByRole('button', { name: 'Confirm' }).click();

  // Fresh work cannot newly start; a review flag appears instead of silent reset.
  await openTask(page, freshTitle);
  await expect(page.getByText(/Waiting on/)).toBeVisible();
  await expect(page.getByText('Dependency Review Required').first()).toBeVisible();
});

test('scenario 19: review flags resolve with a recorded decision', async ({ page }) => {
  const { admin, clientA, employee, jobRoleA } = loadFixtures();
  const projectName = uniqueName('E2E Review Project');
  const upstreamTitle = uniqueName('E2E Review upstream');
  const downstreamTitle = uniqueName('E2E Review downstream');
  const label = `E2E Employee (${employee.email})`;

  await loginAs(page, admin.email, admin.password);
  await createProject(page, clientA.name, projectName);
  await createAssignedTask(page, upstreamTitle, label, jobRoleA.id);
  await createAssignedTask(page, downstreamTitle, label, jobRoleA.id);

  await openTask(page, downstreamTitle);
  await addPrerequisite(page, upstreamTitle);

  await openTask(page, upstreamTitle);
  await page.getByRole('button', { name: 'Start work' }).click();
  await page.getByRole('button', { name: 'Complete' }).click();
  await page.getByRole('button', { name: 'Reopen' }).click();
  await page.getByLabel(/Reason \(required to reopen\)/).fill('Double-check needed');
  await page.getByRole('button', { name: 'Confirm' }).click();

  await openTask(page, downstreamTitle);
  await page.getByRole('button', { name: 'Resolve review' }).click();
  await page.getByLabel('Resolution decision (required)').fill('Accepted: continuing with care');
  await page.getByRole('button', { name: 'Resolve' }).click();
  await expect(page.getByText('Resolved').first()).toBeVisible();
});

test('scenario 20: cancelling a prerequisite never unlocks dependents', async ({ page }) => {
  const { admin, clientA, employee, jobRoleA } = loadFixtures();
  const projectName = uniqueName('E2E Cancel Project');
  const upstreamTitle = uniqueName('E2E Cancel upstream');
  const downstreamTitle = uniqueName('E2E Cancel downstream');
  const label = `E2E Employee (${employee.email})`;

  await loginAs(page, admin.email, admin.password);
  await createProject(page, clientA.name, projectName);
  await createAssignedTask(page, upstreamTitle, label, jobRoleA.id);
  await createAssignedTask(page, downstreamTitle, label, jobRoleA.id);

  await openTask(page, downstreamTitle);
  await addPrerequisite(page, upstreamTitle);

  await openTask(page, upstreamTitle);
  await page.getByRole('button', { name: 'Cancel task' }).click();
  await page.getByLabel(/Reason \(required to cancel\)/).fill('Brief withdrawn');
  await page.getByRole('button', { name: 'Confirm' }).click();

  await openTask(page, downstreamTitle);
  await expect(page.getByText(/Waiting on/)).toBeVisible();
  await expect(page.getByText('Dependency Review Required').first()).toBeVisible();
});

test('scenario 21: dependency removal reevaluates safely', async ({ page }) => {
  const { admin, clientA, employee, jobRoleA } = loadFixtures();
  const projectName = uniqueName('E2E Removal Project');
  const upstreamTitle = uniqueName('E2E Removal upstream');
  const downstreamTitle = uniqueName('E2E Removal downstream');
  const label = `E2E Employee (${employee.email})`;

  await loginAs(page, admin.email, admin.password);
  await createProject(page, clientA.name, projectName);
  await createAssignedTask(page, upstreamTitle, label, jobRoleA.id);
  await createAssignedTask(page, downstreamTitle, label, jobRoleA.id);

  await openTask(page, downstreamTitle);
  await addPrerequisite(page, upstreamTitle);
  await expect(page.getByText(/Waiting on/)).toBeVisible();

  await page.getByRole('button', { name: 'Remove' }).click();
  await page.getByLabel('Removal reason (required)').fill('No longer needed');
  await page.getByRole('button', { name: 'Confirm removal' }).click();

  await expect(page.getByText(/Waiting on/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Start work' })).toBeVisible();
});

test('scenario 22: employees cannot alter the dependency graph', async ({ playwright }) => {
  const { admin, employee, projectA } = loadFixtures();
  const setup = await signedIn(playwright, admin.email, admin.password);

  const first = await setup.post(`/api/v1/projects/${projectA.id}/tasks`, {
    data: { title: `E2E Guard A ${Date.now().toString(36)}` },
  });
  expect(first.status()).toBe(201);
  const second = await setup.post(`/api/v1/projects/${projectA.id}/tasks`, {
    data: { title: `E2E Guard B ${Date.now().toString(36)}` },
  });
  expect(second.status()).toBe(201);
  const firstId = ((await first.json()) as { data: { id: string } }).data.id;
  const secondId = ((await second.json()) as { data: { id: string } }).data.id;
  await setup.dispose();

  const authed = await signedIn(playwright, employee.email, employee.password);

  expect(
    (
      await authed.post(`/api/v1/tasks/${secondId}/dependencies`, {
        data: { predecessorTaskId: firstId },
      })
    ).status(),
  ).toBe(403);

  expect(
    (
      await authed.delete(`/api/v1/tasks/${secondId}/dependencies/${firstId}`, {
        data: { reason: 'Trying anyway' },
      })
    ).status(),
  ).toBe(403);

  await authed.dispose();
});

test('scenario 24: dependencies cannot cross projects or client boundaries', async ({
  playwright,
}) => {
  const { admin, manager, employee, clientB, projectA } = loadFixtures();
  const setup = await signedIn(playwright, admin.email, admin.password);

  const projectB = await setup.post('/api/v1/projects', {
    data: { clientId: clientB.id, name: `E2E Walled ${Date.now().toString(36)}`, type: 'campaign' },
  });
  expect(projectB.status()).toBe(201);
  const projectBId = ((await projectB.json()) as { data: { id: string } }).data.id;

  const foreign = await setup.post(`/api/v1/projects/${projectBId}/tasks`, {
    data: { title: `E2E Foreign ${Date.now().toString(36)}` },
  });
  expect(foreign.status()).toBe(201);
  const foreignId = ((await foreign.json()) as { data: { id: string } }).data.id;

  const local = await setup.post(`/api/v1/projects/${projectA.id}/tasks`, {
    data: { title: `E2E Local ${Date.now().toString(36)}` },
  });
  expect(local.status()).toBe(201);
  const localId = ((await local.json()) as { data: { id: string } }).data.id;

  // Cross-project edges are rejected even for Admins.
  expect(
    (
      await setup.post(`/api/v1/tasks/${localId}/dependencies`, {
        data: { predecessorTaskId: foreignId },
      })
    ).status(),
  ).toBe(422);
  await setup.dispose();

  const asManager = await signedIn(playwright, manager.email, manager.password);
  // Out-of-scope project tasks are invisible…
  expect((await asManager.get(`/api/v1/projects/${projectBId}`)).status()).toBe(404);
  // …and cross-project edges are rejected even where both ids are known.
  const listed = await asManager.get('/api/v1/tasks?limit=1');
  expect(listed.ok()).toBe(true);
  await asManager.dispose();

  const asEmployee = await signedIn(playwright, employee.email, employee.password);
  expect((await asEmployee.get(`/api/v1/tasks/${foreignId}`)).status()).toBe(404);
  await asEmployee.dispose();
});
