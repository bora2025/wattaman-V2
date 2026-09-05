/** Customer-school directory and enrollment controls exercised through the real browser/API stack. */
import { expect, test } from '@playwright/test';
import { operator, signIn } from './support';

test('marketplace operator creates a school and rotates a lost enrollment token', async ({ page }) => {
  await signIn(page, operator('ops1@e2e.test'));
  await page.goto('/schools');

  await page.getByRole('button', { name: 'Create customer school' }).click();
  await page.getByLabel('School name').fill('Siem Reap Browser School');
  await page.getByLabel('Slug').fill('siem-reap-browser-school');
  await page.getByLabel('Contact email').fill('principal@siem-reap.e2e');
  await page.getByLabel('Internal reason').fill('Create the browser acceptance school');
  await page.getByRole('button', { name: 'Create school', exact: true }).click();

  await expect(page).toHaveURL(/\/schools\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name: 'Siem Reap Browser School' })).toBeVisible();
  await page.getByRole('button', { name: 'Create enrollment token' }).click();
  await expect(page.getByRole('heading', { name: 'Copy this enrollment token now' })).toBeVisible();
  await expect(page.getByText(/^wtn_enr_/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Revoke enrollment token' })).toBeVisible();

  await page.getByRole('button', { name: 'Revoke enrollment token' }).click();
  await expect(page.getByRole('button', { name: 'Create enrollment token' })).toBeVisible();
});

test('read-only school support cannot open the adoption workflow', async ({ page }) => {
  await signIn(page, operator('support@e2e.test'));
  await page.goto('/schools/adopt');
  await expect(page.getByRole('alert')).toContainText('schools.manage');
  await expect(page.getByRole('button', { name: 'Run discovery' })).toHaveCount(0);
});
