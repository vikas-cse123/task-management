import {
  expect,
  test,
  type APIRequestContext,
  type Page,
  type PlaywrightTestArgs,
} from '@playwright/test';
import { loadFixtures, loginAs, uniqueName } from './helpers';

/**
 * Phase 4 scenarios (Steps 22–24): generated project workflows.
 *
 * Creation/preview flows run in a real browser; workflow transitions,
 * idempotency and authorization run through the same authenticated HTTP API the
 * SPA uses, then the results are verified against the running server.
 */

const BASE = 'http://127.0.0.1:5174';

async function apiAs(
  playwright: PlaywrightTestArgs['playwright'],
  email: string,
  password: string,
) {
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
  parentTaskId: string | null;
  assignedUserId: string | null;
  needsAssignment: boolean;
}

async function projectTasks(context: APIRequestContext, projectId: string): Promise<TaskRow[]> {
  const res = await context.get(`/api/v1/projects/${projectId}/tasks?limit=100`);
  const body = (await res.json()) as { data: TaskRow[] };
  return body.data;
}

async function createCampaignFromUi(
  page: Page,
  name: string,
  options: { videoCount?: number; destination?: string } = {},
): Promise<string> {
  const { admin, clientA, templates } = loadFixtures();

  await loginAs(page, admin.email, admin.password);
  await page.goto('/projects');
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByRole('button', { name: 'From template' }).click();

  await page.getByLabel('Client').selectOption({ label: clientA.name });
  await page.getByLabel('Template').selectOption(templates.campaign.id);
  await page.getByLabel('Project name').fill(name);
  await page.getByLabel('Destination').fill(options.destination ?? 'Singapore');
  await page.getByLabel('Start date').fill('2026-06-01T09:00');

  if (options.videoCount && options.videoCount !== 1) {
    await page.getByLabel('Video ad count').fill(String(options.videoCount));
  }

  await page.getByRole('button', { name: 'Preview workflow' }).click();
  await expect(page.locator('[data-testid="template-preview"]')).toBeVisible();

  await page.getByRole('button', { name: 'Create project' }).click();
  await page.waitForURL(/\/projects\/[0-9a-f]{24}$/);

  return page.url().split('/').pop() ?? '';
}

test('scenarios 14-20: create a campaign from the template and verify generated work', async ({
  page,
}) => {
  const name = uniqueName('E2E Singapore Meta Ads Campaign');
  await createCampaignFromUi(page, name);

  await expect(page.getByRole('heading', { name })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Campaign Brief & Competitor Research' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Produce Singapore Video Ad' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Write Singapore Video Ad Script' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Edit Singapore Video Ad' })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Write 5 Singapore Meta Ad Copies per Ad' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Campaign Setup, Flow Tracking & Dataset for Singapore' }),
  ).toBeVisible();
});

test('scenarios 16-17: preview highlights missing employee mapping', async ({ page }) => {
  const { admin, clientA, templates } = loadFixtures();

  await loginAs(page, admin.email, admin.password);
  await page.goto('/projects');
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByRole('button', { name: 'From template' }).click();
  await page.getByLabel('Client').selectOption({ label: clientA.name });
  await page.getByLabel('Template').selectOption(templates.campaign.id);
  await page.getByLabel('Project name').fill(uniqueName('E2E Preview Campaign'));
  await page.getByLabel('Destination').fill('Singapore');
  await page.getByLabel('Start date').fill('2026-06-01T09:00');
  await page.getByRole('button', { name: 'Preview workflow' }).click();

  const preview = page.locator('[data-testid="template-preview"]');
  await expect(preview).toBeVisible();
  await expect(preview.getByText('Needs Assignment').first()).toBeVisible();
});

test('scenario 25: multiple video ads produce distinct production and subtask chains', async ({
  page,
}) => {
  const name = uniqueName('E2E Three Video Campaign');
  await createCampaignFromUi(page, name, { videoCount: 3 });

  await expect(page.getByRole('link', { name: 'Produce Singapore Video Ad 1' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Produce Singapore Video Ad 2' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Produce Singapore Video Ad 3' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Write Singapore Video Ad 1 Script' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Write Singapore Video Ad 3 Script' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Edit Singapore Video Ad 3' })).toBeVisible();
});

test('scenario 27-29: create an onboarding project from the template', async ({ page }) => {
  const { admin, clientA, templates } = loadFixtures();
  const name = uniqueName('E2E Onboarding Project');

  await loginAs(page, admin.email, admin.password);
  await page.goto('/projects');
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByRole('button', { name: 'From template' }).click();
  await page.getByLabel('Client').selectOption({ label: clientA.name });
  await page.getByLabel('Template').selectOption(templates.onboarding.id);
  await page.getByLabel('Project name').fill(name);
  await page.getByLabel('Start date').fill('2026-06-01T09:00');
  await page.getByRole('button', { name: 'Preview workflow' }).click();
  await expect(page.locator('[data-testid="template-preview"]')).toBeVisible();
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.waitForURL(/\/projects\/[0-9a-f]{24}$/);

  await expect(
    page.getByRole('link', { name: 'Collect Client Requirements, Assets & Access' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Personalize Travel Agency CRM' })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Final Validation & Onboarding Handover' }),
  ).toBeVisible();
});

test('scenarios 21-24: completing the brief unlocks parallel work and approving the script unlocks editing', async ({
  playwright,
}) => {
  const { admin, manager, performanceMarketer, scriptWriter, videoEditor, clientA, templates } =
    loadFixtures();
  const projectName = uniqueName('E2E Workflow Campaign');

  const adminCtx = await apiAs(playwright, admin.email, admin.password);
  const created = await adminCtx.post('/api/v1/projects/from-template', {
    data: {
      clientId: clientA.id,
      templateId: templates.campaign.id,
      name: projectName,
      destination: 'Singapore',
      startAt: futureIso(),
      videoAdCount: 1,
      creativeTypes: ['video'],
      managerId: manager.userId,
      roleOverrides: [
        { jobRoleKey: 'performance_marketer', userId: performanceMarketer.userId },
        { jobRoleKey: 'video_ad_script_writer', userId: scriptWriter.userId },
        { jobRoleKey: 'video_editor', userId: videoEditor.userId },
      ],
      idempotencyKey: `wf-${Date.now().toString(36)}`,
    },
  });
  expect(created.status()).toBe(201);
  const projectId = ((await created.json()) as { data: { project: { id: string } } }).data.project
    .id;

  let tasks = await projectTasks(adminCtx, projectId);
  const byTitle = (title: string): TaskRow => {
    const found = tasks.find((task) => task.title === title);
    expect(found, `task "${title}" should exist`).toBeTruthy();
    return found as TaskRow;
  };

  expect(byTitle('Campaign Brief & Competitor Research').status).toBe('todo');
  expect(byTitle('Write Singapore Video Ad Script').status).toBe('blocked');
  expect(byTitle('Edit Singapore Video Ad').status).toBe('blocked');
  expect(byTitle('Write 5 Singapore Meta Ad Copies per Ad').status).toBe('blocked');
  expect(byTitle('Campaign Setup, Flow Tracking & Dataset for Singapore').status).toBe('blocked');

  expect(byTitle('Campaign Brief & Competitor Research').assignedUserId).toBe(
    performanceMarketer.userId,
  );
  expect(byTitle('Write Singapore Video Ad Script').assignedUserId).toBe(scriptWriter.userId);
  expect(byTitle('Edit Singapore Video Ad').assignedUserId).toBe(videoEditor.userId);

  const brief = byTitle('Campaign Brief & Competitor Research');
  expect((await adminCtx.post(`/api/v1/tasks/${brief.id}/start`, { data: {} })).status()).toBe(200);
  expect((await adminCtx.post(`/api/v1/tasks/${brief.id}/complete`, { data: {} })).status()).toBe(
    200,
  );

  tasks = await projectTasks(adminCtx, projectId);
  expect(byTitle('Write Singapore Video Ad Script').status).toBe('todo');
  expect(byTitle('Write 5 Singapore Meta Ad Copies per Ad').status).toBe('todo');
  expect(byTitle('Campaign Setup, Flow Tracking & Dataset for Singapore').status).toBe('todo');
  expect(byTitle('Edit Singapore Video Ad').status).toBe('blocked');
  expect(byTitle('Launch Singapore Meta Campaign').status).toBe('blocked');

  const script = byTitle('Write Singapore Video Ad Script');
  expect((await adminCtx.post(`/api/v1/tasks/${script.id}/start`, { data: {} })).status()).toBe(
    200,
  );
  expect((await adminCtx.post(`/api/v1/tasks/${script.id}/submit`, { data: {} })).status()).toBe(
    200,
  );

  const managerCtx = await apiAs(playwright, manager.email, manager.password);
  expect((await managerCtx.post(`/api/v1/tasks/${script.id}/approve`, { data: {} })).status()).toBe(
    200,
  );

  tasks = await projectTasks(adminCtx, projectId);
  expect(byTitle('Edit Singapore Video Ad').status).toBe('todo');
  expect(byTitle('Edit Singapore Video Ad').assignedUserId).toBe(videoEditor.userId);
  expect(byTitle('Launch Singapore Meta Campaign').status).toBe('blocked');
});

test('scenario 31: idempotent retry returns the same project and conflicting payloads are rejected', async ({
  playwright,
}) => {
  const { admin, clientA, templates } = loadFixtures();
  const adminCtx = await apiAs(playwright, admin.email, admin.password);
  const key = `idem-${Date.now().toString(36)}`;
  const payload = {
    clientId: clientA.id,
    templateId: templates.campaign.id,
    name: uniqueName('E2E Idempotent Campaign'),
    destination: 'Singapore',
    startAt: futureIso(),
    videoAdCount: 1,
    creativeTypes: ['video'],
    idempotencyKey: key,
  };

  const first = await adminCtx.post('/api/v1/projects/from-template', { data: payload });
  expect(first.status()).toBe(201);
  const firstBody = (await first.json()) as {
    data: { project: { id: string }; idempotentReplay: boolean };
  };
  expect(firstBody.data.idempotentReplay).toBe(false);

  const second = await adminCtx.post('/api/v1/projects/from-template', { data: payload });
  expect(second.status()).toBe(201);
  const secondBody = (await second.json()) as {
    data: { project: { id: string }; idempotentReplay: boolean };
  };
  expect(secondBody.data.idempotentReplay).toBe(true);
  expect(secondBody.data.project.id).toBe(firstBody.data.project.id);

  const conflict = await adminCtx.post('/api/v1/projects/from-template', {
    data: { ...payload, destination: 'Bali' },
  });
  expect(conflict.status()).toBe(409);
});

test('scenario 36: the create-project wizard works on a mobile viewport', async ({ page }) => {
  const { admin, clientA, templates } = loadFixtures();
  await page.setViewportSize({ width: 390, height: 780 });

  await loginAs(page, admin.email, admin.password);
  await page.goto('/projects');
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByRole('button', { name: 'From template' }).click();
  await page.getByLabel('Client').selectOption({ label: clientA.name });
  await page.getByLabel('Template').selectOption(templates.campaign.id);
  await page.getByLabel('Project name').fill(uniqueName('E2E Mobile Campaign'));
  await page.getByLabel('Destination').fill('Goa');
  await page.getByLabel('Start date').fill('2026-06-01T09:00');
  await page.getByRole('button', { name: 'Preview workflow' }).click();

  await expect(page.locator('[data-testid="template-preview"]')).toBeVisible();
  await expect(
    page
      .locator('[data-testid="template-preview"]')
      .getByText('Campaign Brief & Competitor Research', {
        exact: true,
      }),
  ).toBeVisible();
});
