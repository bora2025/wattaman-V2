import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/plugin-ui',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  webServer: {
    command: 'node node_modules/next/dist/bin/next dev --webpack --port 4141',
    url: 'http://localhost:4141/login',
    reuseExistingServer: false,
    timeout: 120_000,
  },
  use: { baseURL: 'http://localhost:4141', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'phone', use: { ...devices['Pixel 7'] } },
    { name: 'tablet', use: { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 1 } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
});
