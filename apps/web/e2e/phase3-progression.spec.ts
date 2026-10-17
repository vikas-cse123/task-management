import { expect, test, type Page, type PlaywrightTestArgs } from '@playwright/test';
import { addPrerequisite, loadFixtures, loginAs, logout, openTask, uniqueName } from './helpers';

/**
 * Phase 3 scenarios 8–17: automatic workflow progression.
 */

async function createProject(page: Page, clientName: string, projectName: string): Promise<void> {
  await page.goto('/projects');
  await page.getByRole('button', { name: 'New project' }).click();
  const form = page.locator('form');
  await form.getByLabel('Client').selectOption({ label: clientName });
  await form.getByLabel('Project name').fill(projectName);
  await form.getByRole('button', { name: 'Create project' }).click();
  await page
    .getByRole('link', { name: new RegExp(projectName) })
    .first()
    .click();
  await page.waitForURL(/\/projects\/[0-9a-f]{24}$/);
}

async function createTask(
  page: Page,
  title: string,
  assign?: { label: string; roleId: string },
): Promise<void> {
  await page.getByRole('button', { name: 'New task' }).click();
  await page.getByLabel('Title').fill(title);

  if (assign) {
    await page.getByLabel('Functional job role').selectOption(assign.roleId);
    await page.getByLabel('Assigned employee').selectOption({ label: assign.label });
  }

  await page.getByRole('button', { name: 'Create task' }).click();
  await expect(page.getByRole('link', { name: new RegExp(title) }).first()).toBeVisible();
}

function employeeLabel(name: string, email: string): string {
  return `${name} (${email})`;
}

async function designate(
  playwright: PlaywrightTestArgs['playwright'],
  clientId: string,
  jobRoleId: string,
  userId: string,
): Promise<void> {
  const { admin } = loadFixtures();
  const api = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:5174' });
  expect(
    (
      await api.post('/api/auth/sign-in/email', {
        data: { email: admin.email, password: admin.password },
      })
    ).ok(),
  ).toBe(true);
  const res = await api.post(`/api/v1/clients/${clientId}/roles`, {
    data: { jobRoleId, userId, isPrimary: true },
  });
  expect(res.status()).toBe(201);
  await api.dispose();
}

test('scenarios 8+9: completing a prerequisite readies the successor', async ({ page }) => {
  const { admin, clientA, employee, jobRoleA } = loadFixtures();
  const projectName = uniqueName('E2E Ready Project');
  const briefTitle = uniqueName('E2E Ready brief');
  const scriptTitle = uniqueName('E2E Ready script');

  await loginAs(page, admin.email, admin.password);
  await createProject(page, clientA.name, projectName);
  await createTask(page, briefTitle, {
    label: employeeLabel('E2E Employee', employee.email),
    roleId: jobRoleA.id,
  });
  await createTask(page, scriptTitle);

  await openTask(page, scriptTitle);
  await addPrerequisite(page, briefTitle);

  await openTask(page, briefTitle);
  await page.getByRole('button', { name: 'Start work' }).click();
  await page.getByRole('button', { name: 'Complete' }).click();

  await openTask(page, scriptTitle);
  await expect(page.getByText(/Waiting on/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Start work' })).toBeVisible();
});

test('scenarios 10+11: approval unlocks, submission alone does not', async ({ page }) => {
  const { admin, clientA, employee, manager, jobRoleA } = loadFixtures();
  const projectName = uniqueName('E2E Appr unlock Project');
  const briefTitle = uniqueName('E2E Appr brief');
  const scriptTitle = uniqueName('E2E Appr script');

  await loginAs(page, admin.email, admin.password);
  await createProject(page, clientA.name, projectName);

  await page.getByRole('button', { name: 'New task' }).click();
  await page.getByLabel('Title').fill(briefTitle);
  await page.getByLabel('Functional job role').selectOption(jobRoleA.id);
  await page
    .getByLabel('Assigned employee')
    .selectOption({ label: `E2E Employee (${employee.email})` });
  await page.getByLabel('Approval required before completion').check();
  await page.getByLabel('Designated approver user id').fill(manager.userId ?? '');
  await page.getByRole('button', { name: 'Create task' }).click();

  await createTask(page, scriptTitle);
  await openTask(page, scriptTitle);
  await addPrerequisite(page, briefTitle);
  await logout(page);

  await loginAs(page, employee.email, employee.password);
  await page.goto('/my-tasks');
  await page.getByLabel('Search').fill(briefTitle);
  await page
    .getByRole('link', { name: new RegExp(briefTitle) })
    .first()
    .click();
  await page.waitForURL(/\/tasks\/[0-9a-f]{24}$/);
  await page.getByRole('button', { name: 'Start work' }).click();
  await page.getByRole('button', { name: 'Submit for approval' }).click();
  await logout(page);

  // Submission alone: the successor stays blocked.
  await loginAs(page, admin.email, admin.password);
  await page.goto('/projects');
  await page
    .getByRole('link', { name: new RegExp(projectName) })
    .first()
    .click();
  await page.waitForURL(/\/projects\/[0-9a-f]{24}$/);
  await openTask(page, scriptTitle);
  await expect(page.getByText(/Waiting on/)).toBeVisible();
  await logout(page);

  await loginAs(page, manager.email, manager.password);
  await page.goto('/approvals');
  await page
    .locator('li', { hasText: briefTitle })
    .getByRole('button', { name: 'Approve' })
    .click();
  await logout(page);

  await loginAs(page, admin.email, admin.password);
  await page.goto('/projects');
  await page
    .getByRole('link', { name: new RegExp(projectName) })
    .first()
    .click();
  await page.waitForURL(/\/projects\/[0-9a-f]{24}$/);
  await openTask(page, scriptTitle);
  await expect(page.getByText(/Waiting on/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Start work' })).toBeVisible();
});

test('scenarios 12+13: launch waits for every prerequisite', async ({ page }) => {
  const { admin, clientA, employee, jobRoleA } = loadFixtures();
  const projectName = uniqueName('E2E Launch Project');
  const names = {
    video: uniqueName('E2E Launch video'),
    copies: uniqueName('E2E Launch copies'),
    setup: uniqueName('E2E Launch setup'),
    launch: uniqueName('E2E Launch campaign'),
  };

  await loginAs(page, admin.email, admin.password);
  await createProject(page, clientA.name, projectName);

  for (const title of [names.video, names.copies, names.setup, names.launch]) {
    await createTask(page, title, {
      label: employeeLabel('E2E Employee', employee.email),
      roleId: jobRoleA.id,
    });
  }

  await openTask(page, names.launch);

  for (const prereq of [names.video, names.copies, names.setup]) {
    await addPrerequisite(page, prereq);
  }

  const completeTask = async (title: string): Promise<void> => {
    await page.goto('/projects');
    await page
      .getByRole('link', { name: new RegExp(projectName) })
      .first()
      .click();
    await page.waitForURL(/\/projects\/[0-9a-f]{24}$/);
    await openTask(page, title);
    await page.getByRole('button', { name: 'Start work' }).click();
    await page.getByRole('button', { name: 'Complete' }).click();
  };

  await completeTask(names.video);
  await completeTask(names.copies);

  await page.goto('/projects');
  await page
    .getByRole('link', { name: new RegExp(projectName) })
    .first()
    .click();
  await page.waitForURL(/\/projects\/[0-9a-f]{24}$/);
  await openTask(page, names.launch);
  await expect(page.getByRole('status')).toContainText(new RegExp(names.setup));
  await expect(page.getByRole('button', { name: 'Start work' })).toHaveCount(0);

  await completeTask(names.setup);

  await page.goto('/projects');
  await page
    .getByRole('link', { name: new RegExp(projectName) })
    .first()
    .click();
  await page.waitForURL(/\/projects\/[0-9a-f]{24}$/);
  await openTask(page, names.launch);
  await expect(page.getByText(/Waiting on/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Start work' })).toBeVisible();
});

test('scenario 14: readiness auto-assigns the designated employee', async ({
  page,
  playwright,
}) => {
  const { admin, clientA, editor, employee, jobRoleA, jobRoleB } = loadFixtures();
  const projectName = uniqueName('E2E Autoassign Project');
  const briefTitle = uniqueName('E2E Autoassign brief');
  const editTitle = uniqueName('E2E Autoassign edit');

  await designate(playwright, clientA.id, jobRoleB.id, editor.userId ?? '');

  await loginAs(page, admin.email, admin.password);
  await createProject(page, clientA.name, projectName);
  await createTask(page, briefTitle, {
    label: employeeLabel('E2E Employee', employee.email),
    roleId: jobRoleA.id,
  });

  await page.getByRole('button', { name: 'New task' }).click();
  await page.getByLabel('Title').fill(editTitle);
  await page.getByLabel('Functional job role').selectOption(jobRoleB.id);
  await page.getByLabel('Auto-assign from the client role mapping when unassigned').check();
  await page.getByRole('button', { name: 'Create task' }).click();
  await openTask(page, editTitle);
  await addPrerequisite(page, briefTitle);

  await openTask(page, briefTitle);
  await page.getByRole('button', { name: 'Start work' }).click();
  await page.getByRole('button', { name: 'Complete' }).click();

  await openTask(page, editTitle);
  await expect(page.getByText(`E2E Editor (${editor.email})`).first()).toBeVisible();
});

test('scenarios 15+16: missing mapping warns, manager resolves manually', async ({
  page,
  playwright,
}) => {
  const { admin, clientA, employee, jobRoleA } = loadFixtures();
  const projectName = uniqueName('E2E NeedsAssign Project');
  const editTitle = uniqueName('E2E NeedsAssign edit');

  // Guarantee the precondition regardless of suite order: no primary
  // designation for this role on this client.
  const api = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:5174' });
  expect(
    (
      await api.post('/api/auth/sign-in/email', {
        data: { email: admin.email, password: admin.password },
      })
    ).ok(),
  ).toBe(true);
  const assigned = await api.get(`/api/v1/clients/${clientA.id}/roles`);
  expect(assigned.ok()).toBe(true);
  const assignedPayload = (await assigned.json()) as {
    data: Array<{ id: string; jobRoleId: string; isPrimary: boolean; isActive: boolean }>;
  };

  for (const entry of assignedPayload.data) {
    if (entry.jobRoleId === jobRoleA.id && entry.isPrimary && entry.isActive) {
      const removed = await api.delete(`/api/v1/clients/${clientA.id}/roles/${entry.id}`);
      expect(removed.ok()).toBe(true);
    }
  }

  await api.dispose();

  await loginAs(page, admin.email, admin.password);
  await createProject(page, clientA.name, projectName);

  await page.getByRole('button', { name: 'New task' }).click();
  await page.getByLabel('Title').fill(editTitle);
  await page.getByLabel('Functional job role').selectOption(jobRoleA.id);
  await page.getByLabel('Auto-assign from the client role mapping when unassigned').check();
  await page.getByRole('button', { name: 'Create task' }).click();
  await openTask(page, editTitle);

  await expect(page.getByRole('heading', { name: 'Needs Assignment' })).toBeVisible();
  await expect(page.getByText(/A Manager must choose an eligible employee manually/)).toBeVisible();

  await page.getByLabel('Employee', { exact: true }).selectOption({
    label: `E2E Employee (${employee.email})`,
  });
  await page.getByLabel('Job role').selectOption(jobRoleA.id);
  await page.getByRole('button', { name: 'Save assignment' }).click();
  await expect(page.getByText(`E2E Employee (${employee.email})`).first()).toBeVisible();
});

test('scenario 17: manual assignment survives readiness', async ({ page, playwright }) => {
  const { admin, clientA, marketer, employee, jobRoleA } = loadFixtures();
  const projectName = uniqueName('E2E Preserve Project');
  const briefTitle = uniqueName('E2E Preserve brief');
  const editTitle = uniqueName('E2E Preserve edit');

  await designate(playwright, clientA.id, jobRoleA.id, employee.userId ?? '');

  await loginAs(page, admin.email, admin.password);
  await createProject(page, clientA.name, projectName);
  await createTask(page, briefTitle, {
    label: employeeLabel('E2E Employee', employee.email),
    roleId: jobRoleA.id,
  });

  await page.getByRole('button', { name: 'New task' }).click();
  await page.getByLabel('Title').fill(editTitle);
  await page.getByLabel('Functional job role').selectOption(jobRoleA.id);
  await page
    .getByLabel('Assigned employee')
    .selectOption({ label: `E2E Marketer (${marketer.email})` });
  await page.getByLabel('Auto-assign from the client role mapping when unassigned').check();
  await page.getByRole('button', { name: 'Create task' }).click();
  await openTask(page, editTitle);
  await addPrerequisite(page, briefTitle);

  await openTask(page, briefTitle);
  await page.getByRole('button', { name: 'Start work' }).click();
  await page.getByRole('button', { name: 'Complete' }).click();

  await openTask(page, editTitle);
  await expect(page.getByText(`E2E Marketer (${marketer.email})`).first()).toBeVisible();
});
