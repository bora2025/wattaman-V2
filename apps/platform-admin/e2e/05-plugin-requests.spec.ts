/**
 * PA3-8: the school plugin-request workflow driven end to end through the browser, including the
 * part no single operator can complete alone.
 *
 * The dual-control case is the reason this file exists as a browser test rather than another API
 * drill: the refusal has to hold at the API *and* the second-approval button has to be absent for
 * the operator who proposed it — a screen that offers a button the API will reject is a defect
 * even though the data stays safe.
 *
 * These tests drive a request through a one-way lifecycle, so they need the freshly seeded
 * fixtures scripts/e2e-stack.mjs provides. Re-running this file against a database it has already
 * touched fails on the first assertion, by design — a workflow that could be replayed on a settled
 * request would be the real bug.
 */
import { expect, test, type Page } from '@playwright/test';
import { apiCall, fixtures, operator, signIn } from './support';

test.describe.configure({ mode: 'serial' });

async function decide(page: Page, button: string, reason: string) {
  await page.getByLabel('Internal reason').fill(reason);
  await page.getByRole('button', { name: button, exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Action recorded.');
}

test('an operator works a free-plugin request from queue to issued entitlement', async ({ page }) => {
  const { pluginRequestId } = fixtures().marketplace;
  await signIn(page, operator('ops1@e2e.test'));

  await page.goto('/plugin-requests');
  await expect(page.getByRole('link', { name: 'E2E Attendance' })).toBeVisible();
  await expect(page.locator('tr', { hasText: 'E2E Attendance' })).toContainText('Unassigned');

  // The queue filters the way an operator triages it.
  await page.getByLabel('Status').selectOption('APPROVED');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.getByText('No school plugin requests found.')).toBeVisible();
  await page.getByRole('button', { name: 'Clear' }).click();

  await page.getByRole('link', { name: 'E2E Attendance' }).click();
  await page.waitForURL(`**/plugin-requests/${pluginRequestId}`);
  await expect(page.getByRole('heading', { name: 'E2E Attendance' })).toBeVisible();

  await decide(page, 'Assign to me', 'Taking this one; the school has a term deadline.');
  await expect(page.getByText('E2E Operator One').first()).toBeVisible();

  await decide(page, 'Start review', 'Checking the school is on a supported core version.');
  await expect(page.getByText('free approval · under review')).toBeVisible();

  await decide(page, 'Approve', 'Free plugin, school is registered and linked; no cost exposure.');
  await expect(page.getByText('free approval · approved')).toBeVisible();

  await decide(page, 'Issue entitlement', 'Issuing the standard free entitlement.');
  await expect(page.getByText('free approval · entitlement issued')).toBeVisible();

  // Every step left an attributable trail, not just a final status.
  const timeline = page.locator('section', { hasText: 'Decision timeline' });
  await expect(timeline).toContainText('assigned');
  await expect(timeline).toContainText('started review');
  await expect(timeline).toContainText('approved');
  await expect(timeline).toContainText('entitlement issued');
  await expect(timeline).toContainText('E2E Operator One');
});

test('free access to a paid plugin cannot be granted by one operator', async ({ page }) => {
  const { paidAccessRequestId } = fixtures().marketplace;
  await signIn(page, operator('ops1@e2e.test'));
  await page.goto(`/plugin-requests/${paidAccessRequestId}`);

  await decide(page, 'Assign to me', 'Waiver request for a paid licence — needs a second pair of eyes.');
  await decide(page, 'Start review', 'Confirming the school qualifies as a provincial pilot.');
  await decide(page, 'Approve', 'Case is sound; proceeding to the exception path.');

  // Approving is not the same as granting: fulfilling a paid plugin for free is refused outright.
  await page.getByLabel('Internal reason').fill('Attempting to issue without an exception.');
  await page.getByRole('button', { name: 'Issue entitlement', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('two-person exception');

  await page.getByLabel('Exceptional validity (days)').fill('180');
  await decide(page, 'Propose exceptional grant', 'Proposing a 180-day waiver for the pilot programme.');

  const approval = page.locator('section', { hasText: 'Exceptional entitlement approval' });
  await expect(approval).toContainText('pending');
  await expect(approval).toContainText('180 days');
  await expect(approval).toContainText('Awaiting a different operator');

  // The proposer is not offered the second approval…
  await expect(page.getByRole('button', { name: 'Second-approve exception' })).toHaveCount(0);

  // …and cannot reach it by calling the API directly either.
  const selfApproval = await apiCall(page, `plugin-requests/${paidAccessRequestId}/exception-decisions`, {
    method: 'POST',
    body: {
      idempotencyKey: '11111111-1111-4111-8111-111111111111',
      decision: 'APPROVE',
      internalReason: 'Trying to approve my own proposal.',
    },
  });
  expect(selfApproval.status).toBe(409);
  expect(selfApproval.body).toMatchObject({ error: 'Exceptional entitlement approval requires a different operator' });
});

test('a second operator approves the exception and the entitlement issues', async ({ page }) => {
  const { paidAccessRequestId } = fixtures().marketplace;
  await signIn(page, operator('ops2@e2e.test'));
  await page.goto(`/plugin-requests/${paidAccessRequestId}`);

  const approval = page.locator('section', { hasText: 'Exceptional entitlement approval' });
  await expect(approval).toContainText('pending');
  await expect(approval).toContainText('E2E Operator One');

  await decide(page, 'Second-approve exception', 'Reviewed the pilot paperwork; the waiver is justified.');
  await expect(approval).toContainText('approved');
  await expect(approval).toContainText('E2E Operator Two');

  await decide(page, 'Issue entitlement', 'Issuing the 180-day exceptional entitlement.');
  await expect(page.getByText('free approval · entitlement issued')).toBeVisible();
});

test('the issued exceptional entitlement is visible to a finance operator', async ({ page }) => {
  await signIn(page, operator('finance@e2e.test'));
  await page.goto('/entitlements');
  await page.getByLabel('Plugin ID').fill('com.e2e.reporting');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.getByText('E2E Reporting')).toBeVisible();
});

test('a reviewer without request permissions cannot see the queue', async ({ page }) => {
  await signIn(page, operator('reviewer@e2e.test'));
  expect((await apiCall(page, 'plugin-requests')).status).toBe(403);
});
