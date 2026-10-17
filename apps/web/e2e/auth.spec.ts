import { expect, test } from '@playwright/test';
import { loadFixtures, loginAs, logout } from './helpers';

/**
 * Scenarios 1 (admin login), 4 (first-login password change) and 10
 * (session/logout behavior).
 */
test('scenario 1: admin can sign in and sees admin navigation', async ({ page }) => {
  const { admin } = loadFixtures();

  await loginAs(page, admin.email, admin.password);

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: `Welcome, E2E Admin` })).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'Primary' }).getByText('Clients'),
  ).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Primary' }).getByText('Team')).toBeVisible();
});

test('scenario 4: employee must change the temporary password on first login', async ({ page }) => {
  const { firstLogin } = loadFixtures();
  const permanent = 'E2eChanged!2026';

  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Email' }).fill(firstLogin.email);
  await page.getByRole('textbox', { name: 'Password' }).fill(firstLogin.tempPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await page.waitForURL(/\/change-password$/);
  await expect(page.getByText('You must set a new password before continuing.')).toBeVisible();

  // Pinned: direct navigation away is bounced back to the change form.
  await page.goto('/clients');
  await page.waitForURL(/\/change-password$/);

  await page.getByRole('textbox', { name: 'Current password' }).fill(firstLogin.tempPassword);
  await page.getByRole('textbox', { name: 'New password', exact: true }).fill(permanent);
  await page.getByRole('textbox', { name: 'Confirm new password' }).fill(permanent);
  await page.getByRole('button', { name: 'Change password' }).click();

  await page.waitForURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Welcome, E2E First Login' })).toBeVisible();

  // The temporary password no longer works; the new one does.
  await logout(page);
  await page.getByRole('textbox', { name: 'Email' }).fill(firstLogin.email);
  await page.getByRole('textbox', { name: 'Password' }).fill(firstLogin.tempPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);

  await page.getByRole('textbox', { name: 'Password' }).fill(permanent);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/$/);
});

test('scenario 10: logout ends the session and protected routes bounce to login', async ({
  page,
}) => {
  const { employee } = loadFixtures();

  await loginAs(page, employee.email, employee.password);
  await page.goto('/clients');
  await expect(page.getByRole('heading', { name: 'Clients' })).toBeVisible();

  await logout(page);

  await page.goto('/clients');
  await page.waitForURL(/\/login$/);
});
