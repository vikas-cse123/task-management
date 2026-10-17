import { expect, test, type Page } from '@playwright/test';
import { addPrerequisite, loadFixtures, loginAs, logout, openTask, uniqueName } from './helpers';

/**
 * Phase 3 scenarios 2–7: dependency graph management.
 *
 * Each test builds a fresh project so the suite stays order-independent.
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

async function createTask(page: Page, title: string): Promise<void> {
  await page.getByRole('button', { name: 'New task' }).click();
  await page.getByLabel('Title').fill(title);
  await page.getByRole('button', { name: 'Create task' }).click();
  await expect(page.getByRole('link', { name: new RegExp(title) }).first()).toBeVisible();
}

test('scenarios 2+4: add a task dependency and view both sides', async ({ page }) => {
  const { admin, clientA } = loadFixtures();
  const projectName = uniqueName('E2E Dep Project');
  const briefTitle = uniqueName('E2E Dep brief');
  const scriptTitle = uniqueName('E2E Dep script');

  await loginAs(page, admin.email, admin.password);
  await createProject(page, clientA.name, projectName);
  await createTask(page, briefTitle);
  await createTask(page, scriptTitle);

  await openTask(page, scriptTitle);
  await addPrerequisite(page, briefTitle);

  await expect(page.locator('li', { hasText: briefTitle }).first()).toBeVisible();
  await expect(page.getByText(/Waiting on/)).toBeVisible();

  await openTask(page, briefTitle);
  await expect(page.getByText('Downstream dependents')).toBeVisible();
});

test('scenario 3: add a subtask dependency', async ({ page }) => {
  const { admin, clientA } = loadFixtures();
  const projectName = uniqueName('E2E Subdep Project');
  const parentTitle = uniqueName('E2E Subdep parent');
  const subA = uniqueName('E2E Subdep A');
  const subB = uniqueName('E2E Subdep B');

  await loginAs(page, admin.email, admin.password);
  await createProject(page, clientA.name, projectName);

  await page.getByRole('button', { name: 'New task' }).click();
  await page.getByLabel('Title').fill(parentTitle);
  await page.getByRole('button', { name: 'Create task' }).click();
  await page
    .getByRole('link', { name: new RegExp(parentTitle) })
    .first()
    .click();
  await page.waitForURL(/\/tasks\/[0-9a-f]{24}$/);

  for (const sub of [subA, subB]) {
    await page.getByRole('button', { name: 'New subtask' }).click();
    await page.getByLabel('Title').fill(sub);
    await page.getByRole('button', { name: 'Create subtask' }).click();
    await expect(page.getByRole('link', { name: new RegExp(sub) }).first()).toBeVisible();
  }

  await openTask(page, subB);
  await addPrerequisite(page, subA);
  await expect(page.locator('li', { hasText: subA }).first()).toBeVisible();
});

test('scenarios 5+6: circular rejected, duplicates not re-offered', async ({ page }) => {
  const { admin, clientA } = loadFixtures();
  const projectName = uniqueName('E2E Cycle Project');
  const titleA = uniqueName('E2E Cycle A');
  const titleB = uniqueName('E2E Cycle B');

  await loginAs(page, admin.email, admin.password);
  await createProject(page, clientA.name, projectName);
  await createTask(page, titleA);
  await createTask(page, titleB);

  await openTask(page, titleB);
  await addPrerequisite(page, titleA);
  await expect(page.locator('li', { hasText: titleA }).first()).toBeVisible();

  // Existing prerequisites are not offered again (UI-level duplicate guard).
  await page.getByLabel('Add prerequisite (same project only)').fill(titleA);
  await expect(
    page
      .locator('li', { hasText: titleA })
      .filter({ has: page.getByRole('button', { name: 'Select' }) }),
  ).toHaveCount(0);

  // Circular edge: A would wait on B while B waits on A.
  await openTask(page, titleA);
  await addPrerequisite(page, titleB);
  await expect(page.getByText(/circular/)).toBeVisible();
});

test('scenario 7: a blocked task offers no Start action', async ({ page, playwright }) => {
  const { admin, clientA } = loadFixtures();
  const projectName = uniqueName('E2E Blocked Project');
  const titleA = uniqueName('E2E Blocked A');
  const titleB = uniqueName('E2E Blocked B');

  await loginAs(page, admin.email, admin.password);
  await createProject(page, clientA.name, projectName);
  await createTask(page, titleA);
  await createTask(page, titleB);

  await openTask(page, titleB);
  await addPrerequisite(page, titleA);
  await expect(page.getByText(/Waiting on/)).toBeVisible();

  // No Start action is offered for dependency-blocked work…
  await expect(page.getByRole('button', { name: 'Start work' })).toHaveCount(0);

  // …and the backend rejects it too.
  const taskId = page.url().split('/').pop() ?? '';
  const api = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:5174' });
  const signedIn = await api.post('/api/auth/sign-in/email', {
    data: { email: admin.email, password: admin.password },
  });
  expect(signedIn.ok()).toBe(true);
  expect((await api.post(`/api/v1/tasks/${taskId}/start`, { data: {} })).status()).toBe(422);
  await api.dispose();
});
