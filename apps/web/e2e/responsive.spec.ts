import { expect, test } from '@playwright/test';
import { loadFixtures, loginAs } from './helpers';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

/** Scenario 11: mobile responsiveness through the drawer navigation. */
test('scenario 11: mobile drawer navigation reaches every Phase 1 screen', async ({ page }) => {
  const { admin } = loadFixtures();

  await loginAs(page, admin.email, admin.password);
  await expect(page).toHaveURL(/\/$/);

  // Sidebar is hidden on mobile; the hamburger opens the drawer instead.
  await expect(page.getByRole('navigation', { name: 'Primary' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Open navigation menu' }).click();

  const drawer = page.getByRole('navigation', { name: 'Primary' });
  await expect(drawer).toBeVisible();
  await drawer.getByText('Clients').click();
  await page.waitForURL(/\/clients$/);
  await expect(page.getByRole('heading', { name: 'Clients' })).toBeVisible();

  await page.getByRole('button', { name: 'Open navigation menu' }).click();
  await page.getByRole('navigation', { name: 'Primary' }).getByText('Team').click();
  await page.waitForURL(/\/team$/);
  await expect(page.getByRole('heading', { name: 'Team' })).toBeVisible();
});
