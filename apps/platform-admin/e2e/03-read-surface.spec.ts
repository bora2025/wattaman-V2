/**
 * PA2-6: the filtered read queues (PA-2) as an operator actually uses them — lists render seeded
 * records, filters narrow them, detail pages open, and personal data stays masked on the way
 * through. Signed in as the auditor, whose role reads the widest set of screens.
 */
import { expect, test } from '@playwright/test';
import { fixtures, operator, signIn } from './support';

const CUSTOMER_EMAIL = 'principal@school.e2e';

test.beforeEach(async ({ page }) => {
  await signIn(page, operator('auditor@e2e.test'));
});

test('customers list renders the account with its address masked', async ({ page }) => {
  await page.goto('/customers');
  await expect(page.getByRole('link', { name: 'E2E School Principal' })).toBeVisible();

  const body = await page.locator('body').innerText();
  expect(body).toContain('@school.e2e');
  expect(body, 'the full address is personal data and must not reach the screen').not.toContain(CUSTOMER_EMAIL);
});

test('customer filters narrow the list and survive a reload', async ({ page }) => {
  await page.goto('/customers');
  await page.getByLabel('Email contains').fill('school.e2e');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.getByRole('link', { name: 'E2E School Principal' })).toBeVisible();

  // The applied filter is reflected in the URL, so an operator can share or bookmark a queue.
  expect(page.url()).toContain('email=school.e2e');
  await page.reload();
  await expect(page.getByLabel('Email contains')).toHaveValue('school.e2e');
  await expect(page.getByRole('link', { name: 'E2E School Principal' })).toBeVisible();

  await page.getByLabel('Email contains').fill('nobody-here');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.getByText('No customer accounts found.')).toBeVisible();

  await page.getByRole('button', { name: 'Clear' }).click();
  await expect(page.getByRole('link', { name: 'E2E School Principal' })).toBeVisible();
});

test('installations list separates linked from unlinked schools', async ({ page }) => {
  const { installationLabel } = fixtures().marketplace;
  await page.goto('/installations');
  await expect(page.getByRole('link', { name: installationLabel! })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Battambang Pilot School' })).toBeVisible();

  await page.getByLabel('Marketplace link').selectOption('true');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.getByRole('link', { name: installationLabel! })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Battambang Pilot School' })).toHaveCount(0);

  await page.getByLabel('Marketplace link').selectOption('false');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.getByRole('link', { name: installationLabel! })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Battambang Pilot School' })).toBeVisible();
});

test('an installation opens a detail record scoped to marketplace data only', async ({ page }) => {
  const { installationLabel, installationId } = fixtures().marketplace;
  await page.goto('/installations');
  await page.getByRole('link', { name: installationLabel! }).click();

  await expect(page.getByRole('heading', { name: 'School installation' })).toBeVisible();
  await expect(page.getByText(installationId, { exact: false })).toBeVisible();

  // The control plane never reaches into a school's own database.
  const record = await page.locator('body').innerText();
  expect(record).not.toContain(CUSTOMER_EMAIL);
});

test('orders list filters by status', async ({ page }) => {
  const { pendingOrderId, paidOrderId } = fixtures().marketplace;
  await page.goto('/orders');
  await expect(page.getByRole('link', { name: pendingOrderId })).toBeVisible();
  await expect(page.getByRole('link', { name: paidOrderId })).toBeVisible();

  await page.getByLabel('Status').selectOption('PAID');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.getByRole('link', { name: paidOrderId })).toBeVisible();
  await expect(page.getByRole('link', { name: pendingOrderId })).toHaveCount(0);
});

test('an order detail page opens with its lines', async ({ page }) => {
  const { paidOrderId } = fixtures().marketplace;
  await page.goto(`/orders/${paidOrderId}`);
  await expect(page.getByRole('heading', { name: 'Order' })).toBeVisible();
  await expect(page.getByText('E2E Gradebook', { exact: false })).toBeVisible();
});

test('entitlements list shows the issued licence', async ({ page }) => {
  await page.goto('/entitlements');
  await expect(page.getByText('E2E Gradebook')).toBeVisible();
  await expect(page.getByText('com.e2e.gradebook')).toBeVisible();

  await page.getByLabel('Status').selectOption('REVOKED');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.getByText('No entitlements found.')).toBeVisible();
});

test('plugins list filters free from paid', async ({ page }) => {
  await page.goto('/plugins');
  await expect(page.getByRole('link', { name: 'E2E Gradebook' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'E2E Attendance' })).toBeVisible();

  await page.getByLabel('Pricing').selectOption('false');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.getByRole('link', { name: 'E2E Attendance' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'E2E Gradebook' })).toHaveCount(0);
});

test('publishers list opens a publisher record', async ({ page }) => {
  await page.goto('/publishers');
  await page.getByRole('link', { name: 'E2E Publishing Co' }).click();
  await expect(page.getByRole('heading', { name: 'Publisher' })).toBeVisible();
  await expect(page.getByText('e2e-publisher', { exact: false })).toBeVisible();
});

test('advisories list shows the open advisory', async ({ page }) => {
  await page.goto('/advisories');
  await expect(page.getByText('Fixture advisory for the E2E suite')).toBeVisible();

  await page.getByLabel('Severity').selectOption('CRITICAL');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.getByText('No advisories found.')).toBeVisible();
});

test('the dashboard reports counts drawn from the seeded records', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByText('Customer schools')).toBeVisible();
  await expect(page.getByRole('link', { name: /Review orders/ })).toContainText('awaiting settlement');
  // Counts are real, not placeholders: three installations were seeded.
  const installations = page.getByRole('link', { name: /Customer schools/ });
  await expect(installations).toContainText('3');
});

test('operations health reports a live database check', async ({ page }) => {
  await page.goto('/operations');
  await expect(page.getByRole('heading', { name: 'Marketplace operations' })).toBeVisible();
  await expect(page.locator('section').filter({ hasText: 'Database' }).first()).toContainText('ok');
});

test('reading the audit log is itself audited', async ({ page }) => {
  await page.goto('/audit');
  await expect(page.locator('tbody tr').first()).toBeVisible();

  // The read that just happened must appear as the newest row on the next load. Asserting the
  // *first* row rather than merely "somewhere on the page" is what makes this about the current
  // read, not about some earlier one that happens to still be in the window.
  await page.reload();
  const newest = page.locator('tbody tr').first();
  await expect(newest).toContainText('platform_audit_read');
  await expect(newest).toContainText('auditor@e2e.test');
  await expect(newest).toContainText('success');
});
