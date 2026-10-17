import { readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';

export interface E2EAccount {
  email: string;
  password: string;
  userId?: string;
}

export interface E2EFixtures {
  admin: E2EAccount;
  manager: E2EAccount;
  employee: E2EAccount;
  firstLogin: E2EAccount & { tempPassword: string };
  unassigned: E2EAccount;
  editor: E2EAccount;
  marketer: E2EAccount;
  clientA: { id: string; name: string };
  clientB: { id: string; name: string };
  projectA: { id: string; name: string };
  jobRoleA: { id: string; name: string };
  jobRoleB: { id: string; name: string };
}

let cached: E2EFixtures | null = null;

/** Fixtures written by `apps/api` `e2e-setup` (isolated database). */
export function loadFixtures(): E2EFixtures {
  if (!cached) {
    const raw = readFileSync(new URL('./fixtures.json', import.meta.url), 'utf8');
    cached = JSON.parse(raw) as E2EFixtures;
  }

  return cached;
}

/** Sign in through the UI and wait for the post-login landing page. */
export async function loginAs(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByRole('textbox', { name: 'Password' }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/(change-password)?$/);
}

/** Sign out through the sidebar/top-bar button. */
export async function logout(page: Page): Promise<void> {
  await page.getByRole('button', { name: /sign out/i }).click();
  await page.waitForURL(/\/login$/);
}

export function uniqueName(prefix: string): string {
  return `${prefix} ${Date.now().toString(36)}`;
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Open a task detail page deterministically (direct navigation). */
export async function openTask(page: Page, title: string): Promise<void> {
  const href = await page
    .getByRole('link', { name: new RegExp(escapeRegExp(title)) })
    .first()
    .getAttribute('href');
  const id = href?.split('/').pop() ?? '';

  if (!/^[0-9a-f]{24}$/.test(id)) {
    throw new Error(`Could not resolve task link for ${title}`);
  }

  await page.goto(href ?? '/');
  await page.reload();
}

/** Add a prerequisite through the search-and-pick UI, verifying each step. */
export async function addPrerequisite(page: Page, title: string): Promise<void> {
  // Let background refetches settle: interacting mid-fetch has been observed
  // to coincide with lost form state on task pages.
  await page.waitForLoadState('networkidle');
  const search = page.getByLabel('Add prerequisite (same project only)');
  await search.fill(title);
  await expect.poll(async () => search.inputValue(), { timeout: 5000 }).toBe(title);
  await page
    .locator('li', { hasText: title })
    .filter({ has: page.getByRole('button', { name: 'Select' }) })
    .getByRole('button', { name: 'Select' })
    .click();
  await expect(page.getByText(`Selected: ${title}`)).toBeVisible();
  await page.getByRole('button', { name: 'Add dependency' }).click();
  // Wait for the edge to exist before returning: a subsequent add on the same
  // page would otherwise have its search text cleared by this add's success
  // reset racing in flight.
  await expect(page.locator('li', { hasText: title }).first()).toBeVisible();
}
