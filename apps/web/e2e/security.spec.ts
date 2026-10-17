import { expect, test, type APIRequestContext, type PlaywrightTestArgs } from '@playwright/test';
import { loadFixtures } from './helpers';

/**
 * HTTP-level security audit evidence against the running application.
 *
 * Mirrors the API unit-test guarantees (signup disabled, admin paths blocked)
 * and proves scope enforcement end to end: capability gates, IDOR-safe 404s,
 * and no privilege escalation through URL tampering.
 */
async function signedIn(
  playwright: PlaywrightTestArgs['playwright'],
  email: string,
  password: string,
): Promise<APIRequestContext> {
  const context = await playwright.request.newContext({
    baseURL: 'http://127.0.0.1:5174',
  });
  const res = await context.post('/api/auth/sign-in/email', {
    data: { email, password },
  });
  expect(res.ok()).toBe(true);
  return context;
}

test('public sign-up stays disabled and admin plugin paths stay blocked', async ({ request }) => {
  const signUp = await request.post('/api/auth/sign-up/email', {
    data: { email: 'intruder@test.local', password: 'IntruderPass!1', name: 'Intruder' },
  });
  expect(signUp.status()).toBe(400);

  for (const path of ['/api/auth/admin/create-user', '/api/auth/admin/list-users']) {
    const res = await request.post(path, { data: {} });
    expect(res.status(), path).toBe(404);
  }
});

test('unauthenticated requests are rejected without leaking data', async ({ request }) => {
  for (const path of ['/api/v1/me', '/api/v1/clients', '/api/v1/users']) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(401);
  }
});

test('managers cannot create clients but can edit authorized ones', async ({ playwright }) => {
  const { manager, clientA } = loadFixtures();
  const authed = await signedIn(playwright, manager.email, manager.password);

  const created = await authed.post('/api/v1/clients', { data: { name: 'Nope' } });
  expect(created.status()).toBe(403);

  const updated = await authed.patch(`/api/v1/clients/${clientA.id}`, {
    data: { name: clientA.name },
  });
  expect(updated.status()).toBe(200);
  await authed.dispose();
});

test('out-of-scope access returns 404, never another client data', async ({ playwright }) => {
  const { manager, employee, clientB } = loadFixtures();
  const asManager = await signedIn(playwright, manager.email, manager.password);
  const asEmployee = await signedIn(playwright, employee.email, employee.password);

  expect((await asManager.get(`/api/v1/clients/${clientB.id}`)).status()).toBe(404);
  expect(
    (
      await asManager.patch(`/api/v1/clients/${clientB.id}`, { data: { name: 'Tampered' } })
    ).status(),
  ).toBe(404);
  expect((await asManager.get(`/api/v1/clients/${clientB.id}/team`)).status()).toBe(404);
  expect((await asEmployee.get(`/api/v1/users`)).status()).toBe(403);
  expect((await asEmployee.get(`/api/v1/clients/${clientB.id}`)).status()).toBe(404);
  await asManager.dispose();
  await asEmployee.dispose();
});
