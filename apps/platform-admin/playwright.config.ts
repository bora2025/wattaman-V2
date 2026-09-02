import { defineConfig, devices } from '@playwright/test';

/**
 * Browser E2E for the operator control plane (PA2-6 / PA3-8).
 *
 * These run against a REAL stack — a real marketplace API against a real PostgreSQL database,
 * with a real operator completing real TOTP enrollment. Nothing here is mocked, because the
 * things worth testing (mandatory MFA gating, deny-by-default authorization, the session cookie
 * never reaching browser JS) are precisely the properties a mock would paper over.
 *
 * `E2E_WEB_URL` and `E2E_API_URL` point at an already-running stack; scripts/e2e-stack.mjs
 * provisions one on disposable PostgreSQL.
 */
const webUrl = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:4120';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // shared operator/database state; parallel runs would fight over it
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: webUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
