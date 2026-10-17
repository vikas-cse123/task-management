import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';

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
