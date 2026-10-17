import { expect, test } from '@playwright/test';
import { loadFixtures, loginAs, logout, uniqueName } from './helpers';

/**
 * Phase 2 scenarios 4–9 (task creation, assignment, priority/deadline,
 * parent + subtasks) and 20 (employee cannot view unrelated tasks).
 */
test('scenarios 4–6: admin creates a task with assignee, priority and deadline', async ({
  page,
}) => {
  const { admin, projectA, employee, jobRoleA } = loadFixtures();
  const title = uniqueName('E2E Write copies');

  await loginAs(page, admin.email, admin.password);
  await page.goto(`/projects/${projectA.id}`);
  await page.getByRole('button', { name: 'New task' }).click();

  await page.getByLabel('Title').fill(title);
  await page.getByLabel('Functional job role').selectOption(jobRoleA.id);
  await page
    .getByLabel('Assigned employee')
    .selectOption({ label: `E2E Employee (${employee.email})` });
  await page.getByLabel('Due date and time').fill('2026-10-26T17:00');
  await page.getByLabel('Priority').selectOption('high');
  await page.getByRole('button', { name: 'Create task' }).click();

  await page
    .getByRole('link', { name: new RegExp(title) })
    .first()
    .click();
  await page.waitForURL(/\/tasks\/[0-9a-f]{24}$/);

  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await expect(page.getByText(`E2E Employee (${employee.email})`).first()).toBeVisible();
  await expect(page.getByText(/Priority High/)).toBeVisible();
});

test('scenarios 7–9: parent with two subtasks and different assignees', async ({ page }) => {
  const { admin, projectA, employee, editor, jobRoleA, jobRoleB } = loadFixtures();
  const parentTitle = uniqueName('E2E Produce Ad');
  const scriptTitle = uniqueName('E2E Write script');
  const editTitle = uniqueName('E2E Edit video');

  await loginAs(page, admin.email, admin.password);
  await page.goto(`/projects/${projectA.id}`);
  await page.getByRole('button', { name: 'New task' }).click();
  await page.getByLabel('Title').fill(parentTitle);
  await page.getByRole('button', { name: 'Create task' }).click();
  await page
    .getByRole('link', { name: new RegExp(parentTitle) })
    .first()
    .click();
  await page.waitForURL(/\/tasks\/[0-9a-f]{24}$/);

  for (const [subTitle, assignee, roleId] of [
    [scriptTitle, `E2E Employee (${employee.email})`, jobRoleA.id],
    [editTitle, `E2E Editor (${editor.email})`, jobRoleB.id],
  ] as const) {
    await page.getByRole('button', { name: 'New subtask' }).click();
    await page.getByLabel('Title').fill(subTitle);
    await page.getByLabel('Functional job role').selectOption(roleId);
    await page.getByLabel('Assigned employee').selectOption({ label: assignee });
    await page.getByRole('button', { name: 'Create subtask' }).click();
    await expect(page.getByRole('link', { name: new RegExp(subTitle) }).first()).toBeVisible();
  }

  await expect(page.getByText('Subtasks · 0/2 (0%)')).toBeVisible();
});

test('scenario 20: employee cannot view unrelated tasks', async ({ page }) => {
  const { admin, editor, marketer, jobRoleA, projectA } = loadFixtures();
  const title = uniqueName('E2E Private task');

  await loginAs(page, admin.email, admin.password);
  await page.goto(`/projects/${projectA.id}`);
  await page.getByRole('button', { name: 'New task' }).click();
  await page.getByLabel('Title').fill(title);
  await page.getByLabel('Functional job role').selectOption(jobRoleA.id);
  await page
    .getByLabel('Assigned employee')
    .selectOption({ label: `E2E Marketer (${marketer.email})` });
  await page.getByRole('button', { name: 'Create task' }).click();
  await page
    .getByRole('link', { name: new RegExp(title) })
    .first()
    .click();
  await page.waitForURL(/\/tasks\/[0-9a-f]{24}$/);
  const hiddenId = page.url().split('/').pop() ?? '';
  expect(hiddenId).toMatch(/^[0-9a-f]{24}$/);
  await logout(page);

  await loginAs(page, editor.email, editor.password);
  await page.goto(`/tasks/${hiddenId}`);
  await expect(page.getByText('Task not found')).toBeVisible();
});
