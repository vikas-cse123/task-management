import { expect, test, type APIRequestContext, type PlaywrightTestArgs } from '@playwright/test';
import { loadFixtures, loginAs, logout, uniqueName } from './helpers';

/**
 * Phase 5 scenarios (Steps 25–30): notification center, consent and admin
 * configuration.
 *
 * Workflow events are produced through the same authenticated HTTP API the SPA
 * uses (task generation, completion, revision), then the resulting in-app
 * notification centre is verified in a real browser. Deadline scans,
 * escalations and delivery retries use controllable clocks and are covered by
 * the deterministic MongoDB integration suites instead of the browser.
 */

const BASE = 'http://127.0.0.1:5174';

async function apiAs(
  playwright: PlaywrightTestArgs['playwright'],
  email: string,
  password: string,
): Promise<APIRequestContext> {
  const context = await playwright.request.newContext({ baseURL: BASE });
  const res = await context.post('/api/auth/sign-in/email', { data: { email, password } });
  expect(res.ok()).toBe(true);
  return context;
}

function futureIso(days = 14): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

interface TaskRow {
  id: string;
  title: string;
  status: string;
  assignedUserId: string | null;
}

async function projectTasks(context: APIRequestContext, projectId: string): Promise<TaskRow[]> {
  const res = await context.get(`/api/v1/projects/${projectId}/tasks?limit=100`);
  const body = (await res.json()) as { data: TaskRow[] };
  return body.data;
}

async function createCampaign(
  adminCtx: APIRequestContext,
  overrides: { performanceMarketer: string; scriptWriter: string; videoEditor: string },
): Promise<string> {
  const { clientA, templates, manager } = loadFixtures();
  const created = await adminCtx.post('/api/v1/projects/from-template', {
    data: {
      clientId: clientA.id,
      templateId: templates.campaign.id,
      name: uniqueName('E2E Notify Campaign'),
      destination: 'Singapore',
      startAt: futureIso(),
      videoAdCount: 1,
      creativeTypes: ['video'],
      managerId: manager.userId,
      roleOverrides: [
        { jobRoleKey: 'performance_marketer', userId: overrides.performanceMarketer },
        { jobRoleKey: 'video_ad_script_writer', userId: overrides.scriptWriter },
        { jobRoleKey: 'video_editor', userId: overrides.videoEditor },
      ],
      idempotencyKey: `notify-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
    },
  });
  expect(created.status()).toBe(201);
  return ((await created.json()) as { data: { project: { id: string } } }).data.project.id;
}

function taskByTitle(tasks: TaskRow[], title: string): TaskRow {
  const found = tasks.find((task) => task.title === title);
  expect(found, `task "${title}" should exist`).toBeTruthy();
  return found as TaskRow;
}

test('admin configures the WhatsApp channel and sees template mappings', async ({ page }) => {
  const { admin } = loadFixtures();

  await loginAs(page, admin.email, admin.password);
  await page.goto('/settings');

  await expect(page.getByRole('heading', { name: 'WhatsApp notifications' })).toBeVisible();
  await expect(page.getByText('Automatic messages')).toBeVisible();
  await expect(page.getByText('Task assigned').first()).toBeVisible();

  await page.getByLabel('Enable the WhatsApp channel').check();
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Settings saved.')).toBeVisible();
});

test('only admins can reach notification settings', async ({ page }) => {
  const { employee } = loadFixtures();

  await loginAs(page, employee.email, employee.password);
  await page.goto('/settings');

  await expect(page.getByRole('heading', { name: /Forbidden/ })).toBeVisible();
});

test('employee manages WhatsApp consent opt-in and opt-out', async ({ page }) => {
  const { employee } = loadFixtures();

  await loginAs(page, employee.email, employee.password);
  await page.goto('/profile');

  const number = page.getByLabel('WhatsApp number (E.164)');
  const optIn = page.getByLabel('Send me WhatsApp notifications');

  await number.fill('+919812345678');
  await optIn.check();
  await page.getByRole('button', { name: 'Save consent' }).click();
  await expect(page.getByText('Consent updated.')).toBeVisible();

  await page.reload();
  await expect(page.getByLabel('WhatsApp number (E.164)')).toHaveValue('+919812345678');
  await expect(page.getByLabel('Send me WhatsApp notifications')).toBeChecked();

  await page.getByLabel('Send me WhatsApp notifications').uncheck();
  await page.getByRole('button', { name: 'Save consent' }).click();
  await expect(page.getByText('Consent updated.')).toBeVisible();

  await page.reload();
  await expect(page.getByLabel('Send me WhatsApp notifications')).not.toBeChecked();
});

test('assignment and readiness notifications reach the correct assignee', async ({
  playwright,
  page,
}) => {
  const { admin, performanceMarketer, scriptWriter, videoEditor } = loadFixtures();
  const adminCtx = await apiAs(playwright, admin.email, admin.password);

  const projectId = await createCampaign(adminCtx, {
    performanceMarketer: performanceMarketer.userId ?? '',
    scriptWriter: scriptWriter.userId ?? '',
    videoEditor: videoEditor.userId ?? '',
  });

  const tasks = await projectTasks(adminCtx, projectId);
  const brief = taskByTitle(tasks, 'Campaign Brief & Competitor Research');
  const script = taskByTitle(tasks, 'Write Singapore Video Ad Script');
  const editTask = taskByTitle(tasks, 'Edit Singapore Video Ad');

  expect(brief.assignedUserId).toBe(performanceMarketer.userId);
  expect(script.assignedUserId).toBe(scriptWriter.userId);
  expect(editTask.assignedUserId).toBe(videoEditor.userId);

  // Completing the brief makes the script actionable → ready notification.
  expect((await adminCtx.post(`/api/v1/tasks/${brief.id}/start`, { data: {} })).status()).toBe(200);
  expect((await adminCtx.post(`/api/v1/tasks/${brief.id}/complete`, { data: {} })).status()).toBe(
    200,
  );

  await loginAs(page, scriptWriter.email, scriptWriter.password);
  await page.goto('/notifications');

  await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();
  await expect(page.getByText('Task assigned').first()).toBeVisible();
  await expect(page.getByText('Task ready to start').first()).toBeVisible();
  await expect(page.getByText(/Write Singapore Video Ad Script/).first()).toBeVisible();

  // The unread badge is rendered in the sidebar.
  await expect(
    page.getByRole('link', { name: /Notifications/ }).locator('span.rounded-full'),
  ).toBeVisible();

  // The still-blocked video edit task must not have produced a ready notice.
  await logout(page);
  await loginAs(page, videoEditor.email, videoEditor.password);
  await page.goto('/notifications');
  await expect(page.getByText('Task ready to start')).toHaveCount(0);
});

test('revision requests notify the assignee with the reason', async ({ playwright, page }) => {
  const { admin, manager, performanceMarketer, scriptWriter, videoEditor } = loadFixtures();
  const adminCtx = await apiAs(playwright, admin.email, admin.password);
  const managerCtx = await apiAs(playwright, manager.email, manager.password);

  const projectId = await createCampaign(adminCtx, {
    performanceMarketer: performanceMarketer.userId ?? '',
    scriptWriter: scriptWriter.userId ?? '',
    videoEditor: videoEditor.userId ?? '',
  });

  const tasks = await projectTasks(adminCtx, projectId);
  const brief = taskByTitle(tasks, 'Campaign Brief & Competitor Research');
  const script = taskByTitle(tasks, 'Write Singapore Video Ad Script');

  await adminCtx.post(`/api/v1/tasks/${brief.id}/start`, { data: {} });
  await adminCtx.post(`/api/v1/tasks/${brief.id}/complete`, { data: {} });

  const scriptWriterCtx = await apiAs(playwright, scriptWriter.email, scriptWriter.password);
  expect(
    (await scriptWriterCtx.post(`/api/v1/tasks/${script.id}/start`, { data: {} })).status(),
  ).toBe(200);
  expect(
    (await scriptWriterCtx.post(`/api/v1/tasks/${script.id}/submit`, { data: {} })).status(),
  ).toBe(200);

  const reason = 'Please revise the hook and tighten the CTA';
  expect(
    (await managerCtx.post(`/api/v1/tasks/${script.id}/revise`, { data: { reason } })).status(),
  ).toBe(200);

  await loginAs(page, scriptWriter.email, scriptWriter.password);
  await page.goto('/notifications');

  await expect(page.getByText('Revision requested').first()).toBeVisible();
  await expect(page.getByText(new RegExp(reason)).first()).toBeVisible();
});

test('notification center supports read and mark-all-read with unread filtering', async ({
  playwright,
  page,
}) => {
  const { admin, scriptWriter, performanceMarketer, videoEditor } = loadFixtures();
  const adminCtx = await apiAs(playwright, admin.email, admin.password);

  const projectId = await createCampaign(adminCtx, {
    performanceMarketer: performanceMarketer.userId ?? '',
    scriptWriter: scriptWriter.userId ?? '',
    videoEditor: videoEditor.userId ?? '',
  });
  expect(projectId).toMatch(/^[0-9a-f]{24}$/);

  await loginAs(page, scriptWriter.email, scriptWriter.password);
  await page.goto('/notifications');

  await page.getByLabel('Show unread only').check();
  await expect(page.getByText('Task assigned').first()).toBeVisible();

  await page.getByRole('button', { name: 'Mark all read' }).click();
  await expect(
    page.getByRole('link', { name: /Notifications/ }).locator('span.rounded-full'),
  ).toBeHidden();

  // With everything read, the unread-only filter is empty.
  await page.getByLabel('Show unread only').check();
  await expect(page.getByText('Nothing here yet.')).toBeVisible();
});

test('notifications are isolated per employee', async ({ page }) => {
  const { unassigned } = loadFixtures();

  await loginAs(page, unassigned.email, unassigned.password);
  await page.goto('/notifications');

  await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();
  await expect(page.getByText('Nothing here yet.')).toBeVisible();
});

test('admin delivery log lists queued notifications', async ({ playwright, page }) => {
  const { admin, scriptWriter, performanceMarketer, videoEditor } = loadFixtures();
  const adminCtx = await apiAs(playwright, admin.email, admin.password);

  // Ensure the channel is enabled so an outbox record is created.
  expect(
    (await adminCtx.patch('/api/v1/notification-settings', { data: { enabled: true } })).status(),
  ).toBe(200);

  await createCampaign(adminCtx, {
    performanceMarketer: performanceMarketer.userId ?? '',
    scriptWriter: scriptWriter.userId ?? '',
    videoEditor: videoEditor.userId ?? '',
  });

  await loginAs(page, admin.email, admin.password);
  await page.goto('/settings');

  const log = page.getByRole('heading', { name: 'Delivery log' }).locator('..');
  await expect(log.getByText('Task assigned').first()).toBeVisible();
});

test('mobile: notification center and consent screen adapt to phone width', async ({ page }) => {
  const { scriptWriter } = loadFixtures();
  await page.setViewportSize({ width: 390, height: 780 });

  await loginAs(page, scriptWriter.email, scriptWriter.password);
  await page.goto('/notifications');
  await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();

  await page.goto('/profile');
  await expect(page.getByRole('heading', { name: 'WhatsApp notifications' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save consent' })).toBeVisible();
});
