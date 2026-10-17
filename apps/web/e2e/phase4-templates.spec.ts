import { expect, test } from '@playwright/test';
import { escapeRegExp, loadFixtures, loginAs, uniqueName } from './helpers';

/**
 * Phase 4 scenarios (Step 23/24): template administration in a real browser.
 *
 * Covers the seeded official templates, version history, the draft editor
 * (tasks, subtasks, roles, approvals, dependencies), validation, publish and
 * viewport-agnostic access. Runs serially against rebuilt fixtures.
 */

function templateKey(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}`;
}

test('scenario 3: admin sees the seeded official templates with version history', async ({
  page,
}) => {
  const { admin } = loadFixtures();

  await loginAs(page, admin.email, admin.password);
  await page.getByRole('link', { name: 'Templates' }).click();
  await page.waitForURL(/\/templates$/);

  await expect(page.getByRole('link', { name: 'Destination Meta Ads Campaign' })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Client Onboarding & Technical Setup' }),
  ).toBeVisible();

  await page.getByRole('link', { name: 'Destination Meta Ads Campaign' }).click();
  await page.waitForURL(/\/templates\/[0-9a-f]{24}$/);

  await expect(page.getByText('Version history')).toBeVisible();
  await expect(page.getByText('v1 · published')).toBeVisible();
  await expect(page.getByText('Published v1')).toBeVisible();
});

test('scenarios 4-12: admin builds, validates and publishes a template from the UI', async ({
  page,
}) => {
  const { admin } = loadFixtures();
  const key = templateKey('ui_tpl');
  const name = uniqueName('E2E UI Template');

  await loginAs(page, admin.email, admin.password);
  await page.goto('/templates');

  await page.getByRole('button', { name: 'New template' }).click();
  const form = page.locator('form');
  await form.getByLabel('Template key').fill(key);
  await form.getByLabel('Template name').fill(name);
  await form.getByLabel('Type').selectOption('campaign');
  await form.getByRole('button', { name: 'Create template' }).click();

  await page.getByRole('link', { name: new RegExp(escapeRegExp(name)) }).click();
  await page.waitForURL(/\/templates\/[0-9a-f]{24}$/);

  // Parent task.
  await page.getByRole('button', { name: 'Add task' }).click();
  let first = page.locator('[data-testid^="template-node-"]').first();
  await first.getByLabel('Node key').fill('brief');
  first = page.locator('[data-testid="template-node-brief"]');
  await first.getByLabel('Title template').fill('Prepare {{destination}} Brief');
  await first.getByLabel('Functional job role').selectOption('performance_marketer');

  // Subtask with approval.
  await page.getByRole('button', { name: 'Add task' }).click();
  let second = page.locator('[data-testid^="template-node-"]').nth(1);
  await second.getByLabel('Node key').fill('script');
  second = page.locator('[data-testid="template-node-script"]');
  await second.getByLabel('Title template').fill('Write {{destination}} Script');
  await second.getByLabel('Parent task').selectOption('brief');
  await second.getByLabel('Functional job role').selectOption('video_ad_script_writer');
  await second.getByLabel('Approval required').check();
  await expect(second.getByLabel('Approver rule')).toBeEnabled();

  // Second top-level task.
  await page.getByRole('button', { name: 'Add task' }).click();
  let third = page.locator('[data-testid^="template-node-"]').nth(2);
  await third.getByLabel('Node key').fill('launch');
  third = page.locator('[data-testid="template-node-launch"]');
  await third.getByLabel('Title template').fill('Launch {{destination}}');
  await third.getByLabel('Functional job role').selectOption('performance_marketer');

  // Dependency: launch depends on brief (two top-level tasks).
  await page.getByRole('button', { name: 'Add prerequisite' }).click();
  await page.getByLabel('Prerequisite (finishes first)').selectOption('brief');
  await page.getByLabel('Dependent task (unlocks after)').selectOption('launch');

  // Save, validate, publish.
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Draft saved.')).toBeVisible();

  await page.getByRole('button', { name: 'Validate' }).click();
  await expect(page.getByText(/Validation passed for v1/)).toBeVisible();

  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByText(/Published\. A fresh draft/)).toBeVisible();

  await expect(page.getByText('Published v1')).toBeVisible();
  await expect(page.getByText('v1 · published')).toBeVisible();
});

test('scenario 10: the editor rejects a circular dependency', async ({ page }) => {
  const { admin } = loadFixtures();
  const key = templateKey('cycle_tpl');
  const name = uniqueName('E2E Cycle Template');

  await loginAs(page, admin.email, admin.password);
  await page.goto('/templates');
  await page.getByRole('button', { name: 'New template' }).click();
  const form = page.locator('form');
  await form.getByLabel('Template key').fill(key);
  await form.getByLabel('Template name').fill(name);
  await form.getByRole('button', { name: 'Create template' }).click();
  await page.getByRole('link', { name: new RegExp(escapeRegExp(name)) }).click();
  await page.waitForURL(/\/templates\/[0-9a-f]{24}$/);

  await page.getByRole('button', { name: 'Add task' }).click();
  let alpha = page.locator('[data-testid^="template-node-"]').first();
  await alpha.getByLabel('Node key').fill('alpha');
  alpha = page.locator('[data-testid="template-node-alpha"]');
  await alpha.getByLabel('Title template').fill('Prepare {{destination}} Alpha');

  await page.getByRole('button', { name: 'Add task' }).click();
  let beta = page.locator('[data-testid^="template-node-"]').nth(1);
  await beta.getByLabel('Node key').fill('beta');
  beta = page.locator('[data-testid="template-node-beta"]');
  await beta.getByLabel('Title template').fill('Prepare {{destination}} Beta');

  // alpha -> beta and beta -> alpha create a cycle.
  await page.getByRole('button', { name: 'Add prerequisite' }).click();
  await page.getByLabel('Prerequisite (finishes first)').selectOption('alpha');
  await page.getByLabel('Dependent task (unlocks after)').selectOption('beta');
  await page.getByRole('button', { name: 'Add prerequisite' }).click();
  await page.getByLabel('Prerequisite (finishes first)').nth(1).selectOption('beta');
  await page.getByLabel('Dependent task (unlocks after)').nth(1).selectOption('alpha');

  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText(/circular workflow/i)).toBeVisible();
});

test('scenario 35: template list is usable on a mobile viewport', async ({ page }) => {
  const { admin } = loadFixtures();
  await page.setViewportSize({ width: 390, height: 780 });

  await loginAs(page, admin.email, admin.password);
  await page.getByRole('button', { name: 'Open navigation menu' }).click();
  await page.getByRole('link', { name: 'Templates' }).click();
  await page.waitForURL(/\/templates$/);

  await expect(page.getByRole('heading', { name: 'Templates' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Destination Meta Ads Campaign' })).toBeVisible();
});
