import { expect, test, type PlaywrightTestArgs } from '@playwright/test';
import { loadFixtures, loginAs, uniqueName } from './helpers';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

async function createTaskOnProjectA(
  playwright: PlaywrightTestArgs['playwright'],
  title: string,
): Promise<string> {
  const { admin, projectA } = loadFixtures();
  const api = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:5174' });
  expect(
    (
      await api.post('/api/auth/sign-in/email', {
        data: { email: admin.email, password: admin.password },
      })
    ).ok(),
  ).toBe(true);
  const created = await api.post(`/api/v1/projects/${projectA.id}/tasks`, {
    data: { title },
  });
  expect(created.status()).toBe(201);
  const payload = (await created.json()) as { data: { id: string } };
  await api.dispose();
  return payload.data.id;
}

/** Phase 3 scenarios 27 (mobile dependency view) and 28 (mobile assignment). */
test('scenario 27: mobile dependency view works', async ({ page, playwright }) => {
  const { admin } = loadFixtures();
  const taskId = await createTaskOnProjectA(playwright, uniqueName('E2E Mobile dep'));

  await loginAs(page, admin.email, admin.password);
  await page.goto(`/tasks/${taskId}`);
  await expect(page.getByRole('heading', { name: 'Dependencies' })).toBeVisible();
});

test('scenario 28: mobile assignment view works', async ({ page, playwright }) => {
  const { admin } = loadFixtures();
  const taskId = await createTaskOnProjectA(playwright, uniqueName('E2E Mobile assign'));

  await loginAs(page, admin.email, admin.password);
  await page.goto(`/tasks/${taskId}`);
  await expect(page.getByRole('heading', { name: 'Assignment' })).toBeVisible();
});
