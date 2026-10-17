import { expect, test } from '@playwright/test';
import { loadFixtures, loginAs } from './helpers';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

/** Phase 2 scenarios 22 (mobile tasks) and 23 (mobile projects). */
test('scenario 22: mobile task interface works', async ({ page }) => {
  const { employee } = loadFixtures();

  await loginAs(page, employee.email, employee.password);

  await page.getByRole('button', { name: 'Open navigation menu' }).click();
  await page.getByRole('navigation', { name: 'Primary' }).getByText('My Tasks').click();
  await page.waitForURL(/\/my-tasks$/);
  await expect(page.getByRole('heading', { name: 'My Tasks' })).toBeVisible();
});

test('scenario 23: mobile project interface works', async ({ page }) => {
  const { manager, projectA } = loadFixtures();

  await loginAs(page, manager.email, manager.password);

  await page.getByRole('button', { name: 'Open navigation menu' }).click();
  await page.getByRole('navigation', { name: 'Primary' }).getByText('Projects').click();
  await page.waitForURL(/\/projects$/);

  await page
    .getByRole('link', { name: new RegExp(projectA.name) })
    .first()
    .click();
  await page.waitForURL(`/projects/${projectA.id}`);
  await expect(page.getByRole('heading', { name: projectA.name })).toBeVisible();
});
