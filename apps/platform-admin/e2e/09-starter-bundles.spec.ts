import { expect, test } from '@playwright/test';
import { apiCall, operator, signIn } from './support';

test('marketplace operator creates, publishes and withdraws a curated starter bundle', async ({ page }) => {
  await signIn(page, operator('ops1@e2e.test'));
  await page.goto('/starter-bundles');

  await expect(page.getByRole('heading', { name: 'Starter bundles' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Create draft bundle' })).toBeVisible();
  await page.getByLabel('Internal reason').fill('Browser certification of curated starter bundles');
  await page.getByLabel('Name').fill('E2E School Starter');
  await expect(page.getByLabel('Slug')).toHaveValue('e2e-school-starter');
  await page.getByLabel('Description').fill('Academic and attendance foundations for a new school.');

  const attendance = page.locator('label', { hasText: 'E2E Attendance' });
  const gradebook = page.locator('label', { hasText: 'E2E Gradebook' });
  await attendance.locator('input[type="checkbox"]').check();
  await gradebook.locator('input[type="checkbox"]').check();
  await page.getByLabel('E2E Attendance version range').fill('^0.9.0');
  await page.getByLabel('E2E Gradebook version range').fill('^1.2.0');
  await page.getByRole('button', { name: 'Create draft' }).click();

  const bundle = page.locator('article', { hasText: 'E2E School Starter' });
  await expect(bundle).toContainText('draft');
  await expect(bundle).toContainText('E2E Attendance');
  await expect(bundle).toContainText('E2E Gradebook');

  await page.getByLabel('Internal reason').fill('Both releases are approved and ready for discovery');
  page.once('dialog', (dialog) => dialog.accept());
  await bundle.getByRole('button', { name: 'Publish' }).click();
  await expect(bundle).toContainText('approved');

  await page.getByLabel('Internal reason').fill('Retiring this disposable browser certification bundle');
  page.once('dialog', (dialog) => dialog.accept());
  await bundle.getByRole('button', { name: 'Withdraw' }).click();
  await expect(bundle).toContainText('withdrawn');
});

test('auditor can inspect bundles but cannot mutate them', async ({ page }) => {
  await signIn(page, operator('auditor@e2e.test'));
  await page.goto('/starter-bundles');
  await expect(page.getByRole('heading', { name: 'Starter bundles' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Create draft bundle' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Publish|Withdraw/ })).toHaveCount(0);
  const denied = await apiCall(page, 'starter-bundles', {
    method: 'POST',
    body: {
      slug: 'auditor-must-not-create', name: 'Forbidden bundle', description: 'Authorization probe.',
      items: [{ pluginId: 'com.e2e.attendance', versionRange: '^0.9.0', required: true }],
      internalReason: 'Auditor mutation must be denied',
    },
  });
  expect(denied.status).toBe(403);
});
