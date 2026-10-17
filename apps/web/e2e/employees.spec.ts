import { expect, test } from '@playwright/test';
import { escapeRegExp, loadFixtures, loginAs, uniqueName } from './helpers';

/** Scenarios 2 (employee creation) and 3 (multiple job-role assignment). */
test('scenario 2: admin creates an employee and receives a one-time password', async ({ page }) => {
  const { admin, jobRoleA, jobRoleB } = loadFixtures();
  const name = uniqueName('E2E Hire');
  const email = `e2e.hire.${Date.now().toString(36)}@test.local`;

  await loginAs(page, admin.email, admin.password);
  await page.goto('/team');
  await page.getByRole('button', { name: 'Create employee' }).click();

  const form = page.locator('form');
  await form.getByLabel('Name').fill(name);
  await form.getByLabel('Email').fill(email);
  const roles = page.getByRole('group', { name: 'Job roles' });
  await roles.getByText(jobRoleA.name, { exact: true }).check();
  await roles.getByText(jobRoleB.name, { exact: true }).check();
  await form.getByRole('button', { name: 'Create employee', exact: true }).click();

  const banner = page.getByRole('status');
  await expect(banner.getByText(`Temporary password for ${email} (shown once)`)).toBeVisible();
  const password = (await banner.locator('p').nth(1).textContent())?.trim() ?? '';
  expect(password.length).toBeGreaterThan(8);

  await expect(page.getByRole('cell', { name })).toBeVisible();
  await expect(page.getByRole('cell', { name: email })).toBeVisible();
});

test('scenario 3: an employee can hold multiple job roles, edited later', async ({ page }) => {
  const { admin, jobRoleA, jobRoleB } = loadFixtures();
  const name = uniqueName('E2E Multi Role');
  const email = `e2e.multi.${Date.now().toString(36)}@test.local`;

  await loginAs(page, admin.email, admin.password);
  await page.goto('/team');
  await page.getByRole('button', { name: 'Create employee' }).click();

  const form = page.locator('form');
  await form.getByLabel('Name').fill(name);
  await form.getByLabel('Email').fill(email);
  await form.getByRole('button', { name: 'Create employee', exact: true }).click();
  await expect(page.getByRole('cell', { name })).toBeVisible();

  const row = page.getByRole('row', { name: new RegExp(escapeRegExp(email)) });
  await row.getByRole('button', { name: 'Edit' }).click();

  const roles = page.getByRole('group', { name: 'Job roles' });
  await expect(roles.getByText(jobRoleA.name, { exact: true })).not.toBeChecked();
  await roles.getByText(jobRoleA.name, { exact: true }).check();
  await roles.getByText(jobRoleB.name, { exact: true }).check();
  await page.getByRole('button', { name: 'Save changes' }).click();

  const updated = page.getByRole('row', { name: new RegExp(escapeRegExp(email)) });
  await expect(
    updated.getByRole('cell', { name: `${jobRoleA.name}, ${jobRoleB.name}` }),
  ).toBeVisible();
});
