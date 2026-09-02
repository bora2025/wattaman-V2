/**
 * Operator-initiated password rotation, in the browser.
 *
 * There is no reset link and no administrator override for a platform operator, so this screen is
 * the only way a password ever changes. That makes two properties worth proving against a real
 * stack: a live session alone is not enough to change it, and every *other* session really is
 * signed out when it does.
 *
 * Like 05-plugin-requests, this file mutates seeded state — it really does rotate an operator's
 * password — so it needs the fresh fixtures scripts/e2e-stack.mjs provides and cannot be replayed
 * against a database it has already run on.
 */
import { expect, test } from '@playwright/test';
import { apiCall, operator, signIn, totp } from './support';

test.describe.configure({ mode: 'serial' });

// This spec rotates a real operator's password, so it uses one no other spec signs in as.
const WHO = 'norole@e2e.test';
const ROTATED = 'RotatedNoRolePass456!';

test('a session alone cannot change the password', async ({ page }) => {
  const who = operator(WHO);
  await signIn(page, who);

  // No second factor: refused even though the session is fully authenticated.
  const noCode = await apiCall(page, 'auth/password', {
    method: 'POST',
    body: { currentPassword: who.password, newPassword: ROTATED, code: '' },
  });
  expect(noCode.status).toBe(400);

  const wrongCode = await apiCall(page, 'auth/password', {
    method: 'POST',
    body: { currentPassword: who.password, newPassword: ROTATED, code: '000000' },
  });
  expect(wrongCode.status).toBe(401);

  const wrongPassword = await apiCall(page, 'auth/password', {
    method: 'POST',
    body: { currentPassword: 'NotTheRealPassword1', newPassword: ROTATED, code: totp(who.totpSecret) },
  });
  expect(wrongPassword.status).toBe(401);

  // Neither failure reveals which factor was wrong.
  expect((wrongCode.body as { error: string }).error).toBe((wrongPassword.body as { error: string }).error);

  // The old password still works, so nothing was half-applied.
  await page.goto('/account');
  await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible();
});

test('an operator changes their own password and other sessions are signed out', async ({ browser }) => {
  const who = operator(WHO);

  // A second, independent browser session for the same operator — the one that must not survive.
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await signIn(otherPage, who);
  expect((await apiCall(otherPage, 'me')).status).toBe(200);

  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, who);
  await page.getByRole('link', { name: 'Your account' }).click();
  await page.waitForURL('**/account');

  await page.getByLabel('Current password').fill(who.password);
  await page.getByLabel('New password', { exact: true }).fill(ROTATED);
  await page.getByLabel('Confirm new password').fill(ROTATED);
  await page.getByLabel('Authentication code').fill(totp(who.totpSecret));
  await page.getByRole('button', { name: 'Change password' }).click();

  await expect(page.getByRole('status')).toContainText('Password changed.');
  await expect(page.getByRole('status')).toContainText('signed out');

  // The session that made the change keeps working…
  expect((await apiCall(page, 'me')).status).toBe(200);
  // …and the other one is dead.
  expect((await apiCall(otherPage, 'me')).status).toBe(401);

  await other.close();
  await context.close();
});

test('the new password works and the old one does not', async ({ page }) => {
  const who = operator(WHO);

  await page.goto('/login');
  await page.getByLabel('Email').fill(who.email);
  await page.getByLabel('Password').fill(who.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toBeVisible();

  await page.getByLabel('Password').fill(ROTATED);
  await page.getByRole('button', { name: 'Sign in' }).click();
  const code = page.getByLabel('Authentication code');
  await expect(code).toBeVisible();
  await code.fill(totp(who.totpSecret));
  await page.getByRole('button', { name: 'Verify and sign in' }).click();
  await page.waitForURL('**/dashboard');
});

test('the change is recorded in the audit log', async ({ page }) => {
  await signIn(page, operator('auditor@e2e.test'));
  await page.goto('/audit');
  const row = page.locator('tr', { hasText: 'platform_password_changed' }).first();
  await expect(row).toBeVisible();
  await expect(row).toContainText(WHO);
  await expect(row).toContainText('success');
});
