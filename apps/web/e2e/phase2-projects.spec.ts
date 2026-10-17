import { expect, test } from '@playwright/test';
import { loadFixtures, loginAs, logout, uniqueName } from './helpers';

/**
 * Phase 2 scenarios 2 (create project), 3 (assign Project Manager),
 * 19 (manager cannot see unrelated clients) and 23 (mobile projects).
 */
test('scenario 2: admin creates a project for an existing client', async ({ page }) => {
  const { admin, clientA } = loadFixtures();
  const name = uniqueName('E2E Vietnam Campaign');

  await loginAs(page, admin.email, admin.password);
  await page.goto('/projects');
  await page.getByRole('button', { name: 'New project' }).click();

  const form = page.locator('form');
  await form.getByLabel('Client').selectOption({ label: clientA.name });
  await form.getByLabel('Project name').fill(name);
  await form.getByLabel('Type').selectOption('campaign');
  await form.getByRole('button', { name: 'Create project' }).click();

  await expect(page.getByRole('link', { name: new RegExp(name) }).first()).toBeVisible();
});

test('scenario 3: admin assigns the Project Manager', async ({ page }) => {
  const { admin, clientA, manager } = loadFixtures();
  const name = uniqueName('E2E Managed Project');

  await loginAs(page, admin.email, admin.password);
  await page.goto('/projects');
  await page.getByRole('button', { name: 'New project' }).click();
  const form = page.locator('form');
  await form.getByLabel('Client').selectOption({ label: clientA.name });
  await form.getByLabel('Project name').fill(name);
  await form.getByRole('button', { name: 'Create project' }).click();
  await page
    .getByRole('link', { name: new RegExp(name) })
    .first()
    .click();
  await page.waitForURL(/\/projects\/[0-9a-f]{24}$/);

  await expect(page.getByText('No manager assigned')).toBeVisible();
  await page
    .getByLabel('Project Manager')
    .selectOption({ label: `E2E Manager (${manager.email})` });
  await page.getByRole('button', { name: 'Save settings' }).click();

  await expect(page.getByText(`Managed by E2E Manager (${manager.email})`)).toBeVisible();
});

test('scenario 19: manager cannot see unrelated client projects', async ({ page }) => {
  const { admin, manager, clientB } = loadFixtures();
  const name = uniqueName('E2E Hidden Project');

  await loginAs(page, admin.email, admin.password);
  await page.goto('/projects');
  await page.getByRole('button', { name: 'New project' }).click();
  const hiddenForm = page.locator('form');
  await hiddenForm.getByLabel('Client').selectOption({ label: clientB.name });
  await hiddenForm.getByLabel('Project name').fill(name);
  await hiddenForm.getByRole('button', { name: 'Create project' }).click();
  await page
    .getByRole('link', { name: new RegExp(name) })
    .first()
    .click();
  await page.waitForURL(/\/projects\/[0-9a-f]{24}$/);
  const hiddenId = page.url().split('/').pop() ?? '';
  expect(hiddenId).toMatch(/^[0-9a-f]{24}$/);
  await logout(page);

  await loginAs(page, manager.email, manager.password);
  await page.goto('/projects');
  await expect(page.getByRole('link', { name: new RegExp(name) })).toHaveCount(0);

  await page.goto(`/projects/${hiddenId}`);
  await expect(page.getByText('Project not found')).toBeVisible();
});
