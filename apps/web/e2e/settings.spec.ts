import { expect, test } from '@playwright/test';
import { loadFixtures, loginAs, logout, uniqueName } from './helpers';

/**
 * Reference-data settings and the own-profile screen.
 *
 * The Admin UI edits from Step 4/5 existed only as API endpoints; these tests
 * pin the Step 6 screens that complete the Phase 1 inventory.
 */
test('admin edits a job-role description and others are kept out', async ({ page }) => {
  const { admin, employee, jobRoleA } = loadFixtures();
  const description = uniqueName('E2E role description');

  await loginAs(page, admin.email, admin.password);
  await page.goto('/settings');

  const row = page.locator('li', { hasText: jobRoleA.name }).first();
  await row.getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Description').fill(description);
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  await expect(page.locator('li', { hasText: description }).first()).toBeVisible();

  await logout(page);
  await loginAs(page, employee.email, employee.password);
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: /Forbidden/ })).toBeVisible();
});

test('every user sees their own profile with a password action', async ({ page }) => {
  const { employee } = loadFixtures();

  await loginAs(page, employee.email, employee.password);
  await page.goto('/profile');

  await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible();
  await expect(page.getByText('e2e.employee@test.local').first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Change password' })).toBeVisible();
});
