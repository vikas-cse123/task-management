import { defineConfig, devices } from '@playwright/test';

/**
 * Phase 1 end-to-end suite (Step 6).
 *
 * The API (`http://127.0.0.1:4000`) and the Vite dev server
 * (`http://127.0.0.1:5173`, proxying `/api` to the API) are started manually
 * against an isolated database, then `apps/api` `e2e-setup` rebuilds the
 * fixtures. See `docs/08-testing-strategy.md` for the exact commands.
 *
 * Tests run serially (`workers: 1`) because scenarios share fixture users and
 * clients; mutating scenarios create their own entities where possible.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://127.0.0.1:5174',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  reporter: [['list']],
});
