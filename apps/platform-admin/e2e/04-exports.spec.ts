/**
 * PA2-3 / PA2-6: audited CSV export, downloaded through a real browser.
 *
 * Three things have to hold at once for an export to be safe to hand an operator: it must be
 * bounded, it must not carry unmasked personal data out of the system, and opening it in a
 * spreadsheet must not execute anything. The last one is the reason the seed plants a school
 * label that starts with `=`.
 */
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { fixtures, operator, signIn } from './support';

async function downloadCsv(page: import('@playwright/test').Page, index: number) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Download CSV' }).nth(index).click(),
  ]);
  const path = await download.path();
  return { filename: download.suggestedFilename(), csv: readFileSync(path!, 'utf8') };
}

test.beforeEach(async ({ page }) => {
  await signIn(page, operator('auditor@e2e.test'));
  await page.goto('/exports');
});

test('the orders export downloads as CSV with masked customer addresses', async ({ page }) => {
  const { csv, filename } = await downloadCsv(page, 0);

  expect(filename).toBe('orders.csv');
  expect(csv.split('\n')[0]).toContain('accountEmailMasked');
  expect(csv).toContain('@school.e2e');
  expect(csv, 'the export must not carry the full address out of the system').not.toContain('principal@school.e2e');
  expect(csv).toContain('PAID');
});

test('a spreadsheet formula in school-supplied text is neutralised in the export', async ({ page }) => {
  const { formulaLabel } = fixtures().marketplace;
  // Installations is the third card on the page.
  const { csv, filename } = await downloadCsv(page, 2);

  expect(filename).toBe('installations.csv');
  expect(csv).toContain(formulaLabel);
  // Prefixed with an apostrophe inside its quoted cell, so Excel and Sheets treat it as text.
  expect(csv).toContain(`"'${formulaLabel}"`);
  expect(csv).not.toContain(`,${formulaLabel}`);
});

test('an export writes an audit event naming the operator and resource', async ({ page }) => {
  await downloadCsv(page, 3); // audit-events.csv

  await page.goto('/audit');
  const row = page.locator('tr', { hasText: 'platform_export' }).first();
  await expect(row).toBeVisible();
  await expect(row).toContainText('auditor@e2e.test');
  await expect(row).toContainText('success');
});

test('the entitlements export is bounded and contains the seeded licence', async ({ page }) => {
  const { csv, filename } = await downloadCsv(page, 1);

  expect(filename).toBe('entitlements.csv');
  expect(csv).toContain('com.e2e.gradebook');
  expect(csv).toContain('ACTIVE');
  // A bounded export: header plus a small number of rows, never the whole table unpaged.
  expect(csv.trim().split('\n').length).toBeLessThanOrEqual(1001);
});
