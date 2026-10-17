import { expect, test, type Page } from '@playwright/test';
import { loadFixtures, loginAs, logout, uniqueName } from './helpers';

/**
 * Phase 2 scenarios 10–18 and 21: the §12.2 integration flow.
 *
 * Each test builds fresh entities (unique names) so the suite stays
 * order-independent.
 */

async function createProject(page: Page, clientName: string, projectName: string): Promise<void> {
  await page.goto('/projects');
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByLabel('Client').selectOption({ label: clientName });
  await page.getByLabel('Project name').fill(projectName);
  await page.getByRole('button', { name: 'Create project' }).click();
  await page
    .getByRole('link', { name: new RegExp(projectName) })
    .first()
    .click();
  await page.waitForURL(/\/projects\/[0-9a-f]{24}$/);
}

async function createTask(
  page: Page,
  options: {
    title: string;
    assigneeLabel?: string;
    roleId?: string;
    approval?: boolean;
    approverId?: string;
  },
): Promise<void> {
  await page.getByRole('button', { name: 'New task' }).click();
  await page.getByLabel('Title').fill(options.title);

  if (options.roleId) {
    await page.getByLabel('Functional job role').selectOption(options.roleId);
  }

  if (options.assigneeLabel) {
    await page.getByLabel('Assigned employee').selectOption({ label: options.assigneeLabel });
  }

  await page.getByLabel('Due date and time').fill('2026-10-26T17:00');

  if (options.approval) {
    await page.getByLabel('Approval required before completion').check();

    if (options.approverId) {
      await page.getByLabel('Designated approver user id').fill(options.approverId);
    }
  }

  await page.getByRole('button', { name: 'Create task' }).click();
  await expect(page.getByRole('link', { name: new RegExp(options.title) }).first()).toBeVisible();
}

async function openTask(page: Page, title: string): Promise<void> {
  await page
    .getByRole('link', { name: new RegExp(title) })
    .first()
    .click();
  await page.waitForURL(/\/tasks\/[0-9a-f]{24}$/);
}

test('scenarios 10–14: employee works, submits, manager approves', async ({ page }) => {
  const { admin, clientA, employee, manager, jobRoleA } = loadFixtures();
  const projectName = uniqueName('E2E Flow Project');
  const scriptTitle = uniqueName('E2E Flow script');

  await loginAs(page, admin.email, admin.password);
  await createProject(page, clientA.name, projectName);
  await createTask(page, {
    title: scriptTitle,
    assigneeLabel: `E2E Employee (${employee.email})`,
    roleId: jobRoleA.id,
    approval: true,
    approverId: manager.userId,
  });
  await logout(page);

  // 10. The writer sees their subtask in My Tasks.
  await loginAs(page, employee.email, employee.password);
  await page.goto('/my-tasks');
  await expect(page.getByRole('link', { name: new RegExp(scriptTitle) })).toBeVisible();

  // 11–12. Start work, then submit for approval.
  await openTask(page, scriptTitle);
  await page.getByRole('button', { name: 'Start work' }).click();
  await expect(page.getByText('In Progress').first()).toBeVisible();
  await page.getByRole('button', { name: 'Submit for approval' }).click();
  await expect(page.getByText('Awaiting Approval').first()).toBeVisible();
  await logout(page);

  // 13–14. The designated approver sees it and approves.
  await loginAs(page, manager.email, manager.password);
  await page.goto('/approvals');
  const card = page.locator('li', { hasText: scriptTitle });
  await expect(card.getByRole('link', { name: new RegExp(scriptTitle) })).toBeVisible();
  await card.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByRole('link', { name: new RegExp(scriptTitle) })).toHaveCount(0);
});

test('scenarios 15–17: revision cycle and parent progress', async ({ page }) => {
  const { admin, clientA, editor, manager, jobRoleB } = loadFixtures();
  const projectName = uniqueName('E2E Revision Project');
  const parentTitle = uniqueName('E2E Revision parent');
  const editTitle = uniqueName('E2E Revision edit');

  await loginAs(page, admin.email, admin.password);
  await createProject(page, clientA.name, projectName);

  await page.getByRole('button', { name: 'New task' }).click();
  await page.getByLabel('Title').fill(parentTitle);
  await page.getByRole('button', { name: 'Create task' }).click();
  await page
    .getByRole('link', { name: new RegExp(parentTitle) })
    .first()
    .click();
  await page.waitForURL(/\/tasks\/[0-9a-f]{24}$/);

  await page.getByRole('button', { name: 'New subtask' }).click();
  await page.getByLabel('Title').fill(editTitle);
  await page.getByLabel('Functional job role').selectOption(jobRoleB.id);
  await page
    .getByLabel('Assigned employee')
    .selectOption({ label: `E2E Editor (${editor.email})` });
  await page.getByLabel('Due date and time').fill('2026-10-26T17:00');
  await page.getByLabel('Approval required before completion').check();
  await page.getByLabel('Designated approver user id').fill(manager.userId ?? '');
  await page.getByRole('button', { name: 'Create subtask' }).click();
  await logout(page);

  await loginAs(page, editor.email, editor.password);
  await page.goto('/my-tasks');
  await openTask(page, editTitle);
  await page.getByRole('button', { name: 'Start work' }).click();
  await page.getByRole('button', { name: 'Submit for approval' }).click();
  await logout(page);

  // 15. Manager requests revision with a mandatory reason.
  await loginAs(page, manager.email, manager.password);
  await page.goto('/approvals');
  const reviseCard = page.locator('li', { hasText: editTitle });
  await reviseCard.getByRole('button', { name: 'Request revision' }).click();
  await page.getByLabel('Revision reason (required)').fill('Stronger opening needed');
  await reviseCard.getByRole('button', { name: 'Request revision', exact: true }).click();
  await logout(page);

  // 16. Editor resubmits; manager approves.
  await loginAs(page, editor.email, editor.password);
  await page.goto('/my-tasks');
  await openTask(page, editTitle);
  await expect(page.getByText('In Progress').first()).toBeVisible();
  await page.getByRole('button', { name: 'Submit for approval' }).click();
  await logout(page);

  await loginAs(page, manager.email, manager.password);
  await page.goto('/approvals');
  await page.locator('li', { hasText: editTitle }).getByRole('button', { name: 'Approve' }).click();
  await logout(page);

  // 17. Parent progress reflects the completed child.
  await loginAs(page, admin.email, admin.password);
  await page.goto('/projects');
  await page
    .getByRole('link', { name: new RegExp(projectName) })
    .first()
    .click();
  await page.waitForURL(/\/projects\/[0-9a-f]{24}$/);
  await page
    .getByRole('link', { name: new RegExp(parentTitle) })
    .first()
    .click();
  await page.waitForURL(/\/tasks\/[0-9a-f]{24}$/);
  await expect(page.getByText('Subtasks · 1/1 (100%)')).toBeVisible();
});

test('scenario 18: parent cannot complete with unfinished required subtasks', async ({ page }) => {
  const { admin, clientA, employee, jobRoleA } = loadFixtures();
  const projectName = uniqueName('E2E Guard Project');
  const parentTitle = uniqueName('E2E Guard parent');
  const childTitle = uniqueName('E2E Guard child');

  await loginAs(page, admin.email, admin.password);
  await createProject(page, clientA.name, projectName);

  await page.getByRole('button', { name: 'New task' }).click();
  await page.getByLabel('Title').fill(parentTitle);
  await page.getByRole('button', { name: 'Create task' }).click();
  await page
    .getByRole('link', { name: new RegExp(parentTitle) })
    .first()
    .click();
  await page.waitForURL(/\/tasks\/[0-9a-f]{24}$/);

  await page.getByRole('button', { name: 'New subtask' }).click();
  await page.getByLabel('Title').fill(childTitle);
  await page.getByLabel('Functional job role').selectOption(jobRoleA.id);
  await page
    .getByLabel('Assigned employee')
    .selectOption({ label: `E2E Employee (${employee.email})` });
  await page.getByRole('button', { name: 'Create subtask' }).click();
  await expect(page.getByRole('link', { name: new RegExp(childTitle) }).first()).toBeVisible();

  // The parent needs an assignee before it becomes actionable.
  await page
    .getByLabel('Employee', { exact: true })
    .selectOption({ label: `E2E Employee (${employee.email})` });
  await page.getByLabel('Job role').selectOption(jobRoleA.id);
  await page.getByRole('button', { name: 'Save assignment' }).click();

  await page.getByRole('button', { name: 'Start work' }).click();
  await page.getByRole('button', { name: 'Complete' }).click();
  await expect(page.getByText(/cannot be completed while/)).toBeVisible();
});

test('scenario 21: unauthorized approval is rejected over the API', async ({ playwright }) => {
  const { admin, employee, manager, jobRoleA, projectA } = loadFixtures();

  const setup = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:5174' });
  expect(
    (
      await setup.post('/api/auth/sign-in/email', {
        data: { email: admin.email, password: admin.password },
      })
    ).ok(),
  ).toBe(true);

  const created = await setup.post(`/api/v1/projects/${projectA.id}/tasks`, {
    data: {
      title: `E2E Guarded task ${Date.now().toString(36)}`,
      assignedUserId: employee.userId,
      assignedJobRoleId: jobRoleA.id,
      approvalRequired: true,
      approverId: manager.userId,
    },
  });
  expect(created.status()).toBe(201);
  const createdPayload = (await created.json()) as { data: { id: string } };
  await setup.dispose();

  const context = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:5174' });
  const signedIn = await context.post('/api/auth/sign-in/email', {
    data: { email: employee.email, password: employee.password },
  });
  expect(signedIn.ok()).toBe(true);

  const res = await context.post(`/api/v1/tasks/${createdPayload.data.id}/approve`, { data: {} });
  expect(res.status()).toBe(403);
  await context.dispose();
});
