import { expect, test } from '@playwright/test';
import { loadFixtures, loginAs, logout, uniqueName } from './helpers';

/**
 * Scenario 12: full Admin → Employee → Client workflow with fresh entities.
 *
 * Admin creates an employee and a client, staffs and designates the employee,
 * then the employee signs in (forced password change) and sees exactly that
 * client in their own scope.
 */
test('scenario 12: admin hires, staffs and designates; employee lands in scope', async ({
  page,
  request,
}) => {
  const { admin, jobRoleA } = loadFixtures();
  const employeeName = uniqueName('E2E Journey');
  const employeeEmail = `e2e.journey.${Date.now().toString(36)}@test.local`;
  const clientName = uniqueName('E2E Journey Client');
  const employeePassword = 'E2eJourney!2026';

  await loginAs(page, admin.email, admin.password);

  // 1. Hire with a functional job role; capture the one-time password.
  await page.goto('/team');
  await page.getByRole('button', { name: 'Create employee' }).click();
  const form = page.locator('form');
  await form.getByLabel('Name').fill(employeeName);
  await form.getByLabel('Email').fill(employeeEmail);
  await page
    .getByRole('group', { name: 'Job roles' })
    .getByText(jobRoleA.name, { exact: true })
    .check();
  await form.getByRole('button', { name: 'Create employee', exact: true }).click();

  const banner = page.getByRole('status');
  await expect(
    banner.getByText(`Temporary password for ${employeeEmail} (shown once)`),
  ).toBeVisible();
  const tempPassword = ((await banner.locator('p').nth(1).textContent()) ?? '').trim();
  expect(tempPassword.length).toBeGreaterThan(8);

  // 2. Create the client workspace.
  await page.goto('/clients');
  await page.getByRole('button', { name: 'New client' }).click();
  await page.getByLabel('Client name').fill(clientName);
  await page.getByRole('button', { name: 'Create client' }).click();
  await page
    .getByRole('link', { name: new RegExp(clientName) })
    .first()
    .click();
  await page.waitForURL(/\/clients\/[0-9a-f]{24}$/);

  // 3. Staff the new hire through the picker.
  await page
    .getByLabel('Employee', { exact: true })
    .selectOption({ label: `${employeeName} (${employeeEmail})` });
  await page.getByRole('button', { name: 'Add member' }).click();
  await expect(page.locator('li', { hasText: employeeEmail })).toBeVisible();

  // 4. Designate them as primary for their job role (id resolved via the API).
  const signedIn = await request.post('/api/auth/sign-in/email', {
    data: { email: admin.email, password: admin.password },
  });
  expect(signedIn.ok()).toBe(true);
  const listed = await request.get(`/api/v1/users?search=${encodeURIComponent(employeeEmail)}`);
  expect(listed.ok()).toBe(true);
  const payload = (await listed.json()) as { data: Array<{ id: string }> };
  const hireId = payload.data[0]?.id ?? '';
  expect(hireId).toMatch(/^[0-9a-f]{24}$/);

  await page.getByLabel('Job role').selectOption(jobRoleA.id);
  await page.getByLabel('Employee user id').fill(hireId);
  await page.getByText('Primary designated employee for this role').check();
  await page.getByRole('button', { name: 'Designate employee' }).click();
  await expect(
    page
      .locator('li', { hasText: jobRoleA.name })
      .getByText(/primary/)
      .first(),
  ).toBeVisible();

  // 5. The new hire signs in, clears the forced change, and lands in scope.
  await logout(page);
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Email' }).fill(employeeEmail);
  await page.getByRole('textbox', { name: 'Password' }).fill(tempPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/change-password$/);
  await page.getByRole('textbox', { name: 'Current password' }).fill(tempPassword);
  await page.getByRole('textbox', { name: 'New password', exact: true }).fill(employeePassword);
  await page.getByRole('textbox', { name: 'Confirm new password' }).fill(employeePassword);
  await page.getByRole('button', { name: 'Change password' }).click();
  await page.waitForURL(/\/$/);

  await expect(page.getByRole('heading', { name: `Welcome, ${employeeName}` })).toBeVisible();
  await expect(page.getByRole('link', { name: new RegExp(clientName) })).toBeVisible();
});
