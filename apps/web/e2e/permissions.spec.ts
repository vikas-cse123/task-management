import { expect, test } from '@playwright/test';
import { loadFixtures, loginAs } from './helpers';

/** Scenario 9: employee permission restrictions. */
test('scenario 9: employees are restricted to their own scope', async ({ page }) => {
  // Dedicated fixture user with no team memberships, unaffected by other scenarios.
  const { unassigned, clientA } = loadFixtures();

  await loginAs(page, unassigned.email, unassigned.password);

  // No Team navigation and the route itself is forbidden.
  await expect(page.getByRole('navigation', { name: 'Primary' }).getByText('Team')).toHaveCount(0);
  await page.goto('/team');
  await expect(page.getByRole('heading', { name: /Forbidden/ })).toBeVisible();

  // No client creation and no unassigned clients.
  await page.goto('/clients');
  await expect(page.getByRole('button', { name: 'New client' })).toHaveCount(0);
  await expect(page.getByText('No clients found.')).toBeVisible();

  // Direct URL access to an unrelated client is refused.
  await page.goto(`/clients/${clientA.id}`);
  await expect(page.getByText('Client not found')).toBeVisible();
});
