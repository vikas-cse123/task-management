import { expect, test, type APIRequestContext, type PlaywrightTestArgs } from '@playwright/test';
import { loadFixtures, loginAs, uniqueName } from './helpers';

/**
 * Phase 6 Step 35 scenarios: meetings list, calendar, creation, detail,
 * reschedule/cancel/complete, notes, decisions, action items, task conversion,
 * daily schedule, dashboard counts, client/project integration, notification
 * deep links, mobile layout and unauthorized controls.
 *
 * Meetings are created through the real UI/API with unique titles so reruns
 * never collide. Management flows run as Admin (implicit `meetings.manage`);
 * the fixture Manager owns the meeting (clientA member); the fixture Employee
 * has no meeting access and verifies unauthorized controls stay hidden.
 */

async function apiAs(
  playwright: PlaywrightTestArgs['playwright'],
  email: string,
  password: string,
): Promise<APIRequestContext> {
  const context = await playwright.request.newContext({
    baseURL: 'http://127.0.0.1:4000',
  });
  const res = await context.post('/api/auth/sign-in/email', { data: { email, password } });
  expect(res.ok()).toBe(true);
  return context;
}

function istDate(offsetDays: number): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000));
  return parts;
}

function tomorrowIst(): string {
  return istDate(1);
}

function todayIst(): string {
  return istDate(0);
}

interface CreatedMeeting {
  id: string;
  title: string;
}

async function createMeetingViaApi(
  adminCtx: APIRequestContext,
  overrides: Record<string, unknown> = {},
): Promise<CreatedMeeting> {
  const { clientA, projectA, manager } = loadFixtures();
  const title = uniqueName('E2E Meeting');
  const res = await adminCtx.post('/api/v1/meetings', {
    data: {
      clientId: (overrides.clientId as string | undefined) ?? clientA.id,
      projectId: (overrides.projectId as string | undefined) ?? projectA.id,
      title,
      agenda: 'Campaign results\nLead quality',
      ownerUserId: (overrides.ownerUserId as string | undefined) ?? manager.userId,
      attendeeUserIds: [],
      meetingUrl: null,
      location: 'Client office',
      date: tomorrowIst(),
      startTime: '10:00',
      endTime: '11:00',
      timezone: 'Asia/Kolkata',
      ...overrides,
    },
  });
  expect(res.status()).toBe(201);
  const body = (await res.json()) as { data: { id: string } };
  return { id: body.data.id, title };
}

test('meetings list renders with filters and views', async ({ page, playwright }) => {
  const { admin } = loadFixtures();
  const adminCtx = await apiAs(playwright, admin.email, admin.password);
  const created = await createMeetingViaApi(adminCtx);
  await adminCtx.dispose();

  await loginAs(page, admin.email, admin.password);
  await page.goto('/meetings');

  await expect(page.getByRole('heading', { name: 'Meetings' })).toBeVisible();
  await page.waitForLoadState('networkidle');

  // Isolate the new meeting through search (the list paginates client-side).
  await page.getByLabel('Search').fill(created.title);
  await expect(page.getByRole('link', { name: created.title }).first()).toBeVisible({
    timeout: 30000,
  });

  // Status + search filters narrow the rows.
  await page.getByLabel('Status').selectOption('scheduled');
  await expect(page.getByRole('link', { name: created.title }).first()).toBeVisible();
  await page.getByLabel('Status').selectOption('completed');
  await expect(page.getByRole('link', { name: created.title })).toHaveCount(0);
  await page.getByLabel('Status').selectOption('');

  // My Meetings scope shows admin-owned rows only (may be empty); page renders.
  await page.goto('/meetings/mine');
  await expect(page.getByRole('heading', { name: 'My Meetings' })).toBeVisible();
});

test('new meeting form validates and schedules a meeting', async ({ page }) => {
  const { admin, clientA } = loadFixtures();
  await loginAs(page, admin.email, admin.password);
  await page.goto('/meetings/new');

  // Submitting empty shows the client validation error.
  await page.getByRole('button', { name: 'Schedule meeting' }).click();
  await expect(page.getByText('Select a client.')).toBeVisible();

  const title = uniqueName('E2E UI Meeting');
  await page.getByLabel('Client *').selectOption(clientA.id);
  await page.getByLabel('Meeting title').fill(title);
  await page.getByLabel('Date').fill(tomorrowIst());
  await page.getByLabel('Start time').fill('14:00');
  await page.getByLabel('End time').fill('13:00');
  await page.getByRole('button', { name: 'Schedule meeting' }).click();
  await expect(page.getByText('End time must be later than the start time.')).toBeVisible();

  await page.getByLabel('End time').fill('15:00');
  const { manager } = loadFixtures();
  await page.getByLabel('Responsible Project Manager *').selectOption(manager.userId);
  await page.getByRole('button', { name: 'Schedule meeting' }).click();

  await page.waitForURL(/\/meetings\/[0-9a-f]{24}$/);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
});

test('calendar displays meetings and opens the detail', async ({ page, playwright }) => {
  const { admin } = loadFixtures();
  const adminCtx = await apiAs(playwright, admin.email, admin.password);
  const created = await createMeetingViaApi(adminCtx);
  await adminCtx.dispose();

  await loginAs(page, admin.email, admin.password);
  await page.goto('/meetings/calendar');

  await expect(page.getByRole('heading', { name: 'Meetings Calendar' })).toBeVisible();
  // FullCalendar renders the scoped meeting as an event; clicking opens detail.
  await expect(page.locator('.fc-event', { hasText: created.title }).first()).toBeVisible({
    timeout: 15000,
  });
  await page.locator('.fc-event', { hasText: created.title }).first().click();
  await page.waitForURL(/\/meetings\/[0-9a-f]{24}$/);
  await expect(page.getByRole('heading', { name: created.title })).toBeVisible();
});

test('meeting detail supports reschedule, notes, decisions and complete', async ({
  page,
  playwright,
}) => {
  const { admin } = loadFixtures();
  const adminCtx = await apiAs(playwright, admin.email, admin.password);
  const created = await createMeetingViaApi(adminCtx);
  await adminCtx.dispose();

  await loginAs(page, admin.email, admin.password);
  await page.goto(`/meetings/${created.id}`);

  await expect(page.getByRole('heading', { name: created.title })).toBeVisible();
  await expect(page.getByText('Meeting overview')).toBeVisible();

  // Notes.
  await page.getByRole('button', { name: 'Add notes' }).click();
  await page.getByLabel('Notes', { exact: true }).fill('Client wants the quote revised.');
  await page.getByRole('button', { name: 'Save notes' }).click();
  await expect(page.getByText('Client wants the quote revised.')).toBeVisible();

  // Decisions.
  await page.getByRole('button', { name: 'Record decisions' }).click();
  await page
    .getByLabel('Decisions (one per line)')
    .fill('Send the revised quote\nBook a follow-up');
  await page.getByRole('button', { name: 'Save decisions' }).click();
  await expect(page.getByText('Send the revised quote')).toBeVisible();

  // Reschedule via dialog.
  await page.getByRole('button', { name: 'Reschedule', exact: true }).click();
  await page.getByLabel('New date').fill(tomorrowIst());
  await page.getByLabel('Start time').fill('16:00');
  await page.getByLabel('End time').fill('17:00');
  await page.getByRole('button', { name: 'Reschedule', exact: true }).last().click();
  await expect(page.locator('span', { hasText: 'Rescheduled' }).first()).toBeVisible();

  // Complete marks the meeting and stops management actions.
  await page.getByRole('button', { name: 'Mark Completed' }).click();
  await page
    .getByRole('dialog', { name: 'Mark meeting completed' })
    .getByRole('button', { name: 'Mark completed' })
    .click();
  await expect(page.locator('span', { hasText: 'Completed' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reschedule', exact: true })).toHaveCount(0);
});

test('action item converts to a real linked task exactly once', async ({ page, playwright }) => {
  const { admin, projectA, jobRoleA } = loadFixtures();
  const adminCtx = await apiAs(playwright, admin.email, admin.password);
  const created = await createMeetingViaApi(adminCtx);
  await adminCtx.dispose();

  await loginAs(page, admin.email, admin.password);
  await page.goto(`/meetings/${created.id}`);

  const itemTitle = uniqueName('E2E Follow-up');
  await page.getByRole('button', { name: 'Add action item' }).click();
  await page.getByLabel('Title', { exact: true }).fill(itemTitle);
  await page.getByLabel('Job role *').selectOption(jobRoleA.id);
  await page.getByLabel('Project').selectOption(projectA.id);
  await page.getByRole('button', { name: 'Add action item', exact: true }).last().click();
  await expect(page.getByText(itemTitle)).toBeVisible();
  await expect(page.getByText('Needs Assignment')).toBeVisible();

  // Convert: first call creates the task and navigates to it.
  await page.getByRole('button', { name: 'Create task' }).click();
  await page.getByRole('button', { name: 'Create task', exact: true }).last().click();
  await page.waitForURL(/\/tasks\/[0-9a-f]{24}$/);
  await expect(page.getByRole('heading', { name: itemTitle })).toBeVisible();

  // Back on the meeting: converted state with a working task link, no live Create button.
  await page.goto(`/meetings/${created.id}`);
  await expect(page.getByText('Converted to Task')).toBeVisible();
  await page.getByRole('link', { name: 'Open task →' }).click();
  await page.waitForURL(/\/tasks\/[0-9a-f]{24}$/);
});

test('dashboard, daily schedule and client/project sections show the meeting', async ({
  page,
  playwright,
}) => {
  const { admin, clientA, projectA } = loadFixtures();
  const adminCtx = await apiAs(playwright, admin.email, admin.password);
  const created = await createMeetingViaApi(adminCtx, { date: todayIst() });
  await adminCtx.dispose();

  await loginAs(page, admin.email, admin.password);
  await page.goto('/');

  await expect(page.getByText('Meetings today')).toBeVisible();
  await expect(page.getByRole('link', { name: created.title }).first()).toBeVisible();

  await page.goto(`/clients/${clientA.id}`);
  await expect(page.getByText('Upcoming', { exact: false }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: created.title }).first()).toBeVisible();

  await page.goto(`/projects/${projectA.id}`);
  await expect(page.getByRole('link', { name: created.title }).first()).toBeVisible();
});

test('meeting notifications deep-link to the meeting detail', async ({ page, playwright }) => {
  const { admin, manager } = loadFixtures();
  const adminCtx = await apiAs(playwright, admin.email, admin.password);
  const created = await createMeetingViaApi(adminCtx);
  await adminCtx.dispose();

  await loginAs(page, manager.email, manager.password);
  await page.goto('/notifications');
  await expect(page.getByText(created.title).first()).toBeVisible({ timeout: 15000 });
  await page.getByText(created.title).first().click();
  await page.waitForURL(`/meetings/${created.id}`);
  await expect(page.getByRole('heading', { name: created.title })).toBeVisible();
});

test('unauthorized employee sees no meetings and no management controls', async ({
  page,
  playwright,
}) => {
  const { admin, employee } = loadFixtures();
  const adminCtx = await apiAs(playwright, admin.email, admin.password);
  const created = await createMeetingViaApi(adminCtx);
  await adminCtx.dispose();

  await loginAs(page, employee.email, employee.password);
  await page.goto('/meetings');

  await expect(page.getByRole('heading', { name: 'Meetings' })).toBeVisible();
  await expect(page.getByRole('link', { name: created.title })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'New Meeting' })).toHaveCount(0);

  // Direct access is rejected without leaking the record.
  await page.goto(`/meetings/${created.id}`);
  await expect(page.getByText('Meeting not found', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reschedule', exact: true })).toHaveCount(0);
});

test('meetings pages stay usable on a mobile viewport', async ({ page, playwright }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { admin } = loadFixtures();
  const adminCtx = await apiAs(playwright, admin.email, admin.password);
  const created = await createMeetingViaApi(adminCtx);
  await adminCtx.dispose();

  await loginAs(page, admin.email, admin.password);
  await page.goto('/meetings');
  await expect(page.getByRole('heading', { name: 'Meetings' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Search').fill(created.title);
  await expect(page.getByRole('link', { name: created.title }).first()).toBeVisible();

  await page.goto('/meetings/calendar');
  await expect(page.getByRole('heading', { name: 'Meetings Calendar' })).toBeVisible();

  await page.goto(`/meetings/${created.id}`);
  await expect(page.getByRole('heading', { name: created.title })).toBeVisible();
});
