import { expect, test } from '@playwright/test';
import { loadFixtures, loginAs, uniqueName } from './helpers';

/**
 * Scenarios 5 (client creation), 6 (team + designated roles), 7 (manager
 * authorized access) and 8 (manager unauthorized access).
 */
test('scenario 5: admin creates a client', async ({ page }) => {
  const { admin } = loadFixtures();
  const name = uniqueName('E2E Client');

  await loginAs(page, admin.email, admin.password);
  await page.goto('/clients');
  await page.getByRole('button', { name: 'New client' }).click();

  await page.getByLabel('Client name').fill(name);
  await page.getByRole('button', { name: 'Create client' }).click();

  await expect(page.getByRole('link', { name: new RegExp(name) }).first()).toBeVisible();
});

test('scenario 6: admin assigns team membership and designated roles', async ({ page }) => {
  const { admin, employee, jobRoleA } = loadFixtures();
  const name = uniqueName('E2E Staffed Client');

  await loginAs(page, admin.email, admin.password);
  await page.goto('/clients');
  await page.getByRole('button', { name: 'New client' }).click();
  await page.getByLabel('Client name').fill(name);
  await page.getByRole('button', { name: 'Create client' }).click();
  await page
    .getByRole('link', { name: new RegExp(name) })
    .first()
    .click();
  await page.waitForURL(/\/clients\/[0-9a-f]{24}$/);

  // Team membership via the employee picker.
  await page
    .getByLabel('Employee', { exact: true })
    .selectOption({ label: `E2E Employee (${employee.email})` });
  await page.getByRole('button', { name: 'Add member' }).click();
  await expect(page.locator('li', { hasText: 'e2e.employee@test.local' })).toBeVisible();

  // Designated role: employee holds jobRoleA (see e2e-setup fixtures).
  await page.getByLabel('Job role').selectOption(jobRoleA.id);
  await page.getByLabel('Employee user id').fill(employee.userId ?? '');
  await page.getByText('Primary designated employee for this role').check();
  await page.getByRole('button', { name: 'Designate employee' }).click();

  const designation = page.locator('li', { hasText: jobRoleA.name });
  await expect(designation.getByText(/primary/).first()).toBeVisible();
});

test('scenario 7: manager opens an authorized client', async ({ page }) => {
  const { manager, clientA } = loadFixtures();

  await loginAs(page, manager.email, manager.password);
  await page.goto('/clients');

  await expect(page.getByRole('link', { name: new RegExp(clientA.name) })).toBeVisible();
  await page.getByRole('link', { name: new RegExp(clientA.name) }).click();
  await page.waitForURL(`/clients/${clientA.id}`);

  await expect(page.getByRole('heading', { name: clientA.name })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Team members' })).toBeVisible();
});

test('scenario 8: manager cannot see or open an unauthorized client', async ({ page }) => {
  const { manager, clientB } = loadFixtures();

  await loginAs(page, manager.email, manager.password);
  await page.goto('/clients');

  await expect(page.getByRole('link', { name: new RegExp(clientB.name) })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'New client' })).toHaveCount(0);

  await page.goto(`/clients/${clientB.id}`);
  await expect(page.getByText('Client not found')).toBeVisible();
});
