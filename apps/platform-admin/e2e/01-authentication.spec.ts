/**
 * PA2-6: the sign-in journey a real operator takes, in a real browser.
 *
 * The properties under test are the ones the API-level drills could not observe — that the session
 * token never becomes reachable from page JavaScript, and that a first-time operator genuinely
 * cannot reach anything until MFA enrollment completes.
 */
import { expect, test } from '@playwright/test';
import { SESSION_COOKIE, apiCall, operator, owner, signIn, signOut, totp } from './support';

test.describe.configure({ mode: 'serial' });

test('a first sign-in cannot proceed without enrolling MFA', async ({ page }) => {
  const who = owner();
  await page.goto('/login');
  await page.getByLabel('Email').fill(who.email);
  await page.getByLabel('Password').fill(who.password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  // Correct credentials alone do not land on the dashboard.
  await expect(page.getByText('Multi-factor authentication is required for every operator')).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/login');

  // The enrollment-only session it did hand out can reach nothing but the enrollment routes.
  expect((await apiCall(page, 'dashboard')).status).toBe(403);

  const secret = (await page.locator('code').first().innerText()).trim();
  expect(secret).toMatch(/^[A-Z2-7]{32}$/);

  await page.getByLabel('Six-digit code').fill(totp(secret));
  await page.getByRole('button', { name: 'Confirm and finish enrollment' }).click();

  await expect(page.getByRole('heading', { name: 'Save your recovery codes' })).toBeVisible();
  await expect(page.locator('ul.font-mono li')).toHaveCount(8);

  await page.getByRole('button', { name: 'I have saved them' }).click();
  await page.waitForURL('**/dashboard');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  // Same session, now upgraded in place: what was refused a moment ago is allowed.
  expect((await apiCall(page, 'dashboard')).status).toBe(200);
});

test('a wrong TOTP code is refused and the operator stays signed out', async ({ page }) => {
  const who = operator('auditor@e2e.test');
  await page.goto('/login');
  await page.getByLabel('Email').fill(who.email);
  await page.getByLabel('Password').fill(who.password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await page.getByLabel('Authentication code').fill('000000');
  await page.getByRole('button', { name: 'Verify and sign in' }).click();

  await expect(page.getByRole('alert')).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/login');
  const cookies = await page.context().cookies();
  expect(cookies.find((cookie) => cookie.name === SESSION_COOKIE)).toBeUndefined();
});

test('the session token is never reachable from page JavaScript', async ({ page }) => {
  await signIn(page, operator('auditor@e2e.test'));

  const cookies = await page.context().cookies();
  const session = cookies.find((cookie) => cookie.name === SESSION_COOKIE);
  expect(session, 'the proxy should have set a session cookie').toBeDefined();
  expect(session!.httpOnly).toBe(true);
  expect(session!.sameSite).toBe('Strict');

  // An XSS in an operator's browser must not be able to lift a session that can act on customer
  // accounts, entitlements, or payouts.
  const readable = await page.evaluate(() => document.cookie);
  expect(readable).not.toContain(SESSION_COOKIE);
  expect(readable).not.toContain(session!.value);

  // Nor should the token have been echoed into the sign-in response body the page received.
  const body = await page.content();
  expect(body).not.toContain(session!.value);
});

test('signing out clears the session and locks the control plane again', async ({ page }) => {
  await signIn(page, operator('auditor@e2e.test'));
  await signOut(page);

  expect((await page.context().cookies()).find((cookie) => cookie.name === SESSION_COOKIE)).toBeUndefined();

  expect((await apiCall(page, 'me')).status).toBe(401);

  // Hand-typing a deep link after signing out bounces back to sign-in rather than rendering.
  await page.goto('/orders');
  await page.waitForURL('**/login');
});

test('the proxy refuses routes it does not allowlist and cross-origin mutations', async ({ page }) => {
  await signIn(page, operator('auditor@e2e.test'));

  // `payouts` is a real upstream concern the proxy has not allowlisted; it must be unreachable
  // through this app regardless of what the marketplace API exposes.
  const unlisted = await apiCall(page, 'payouts');
  expect(unlisted.status).toBe(404);
  expect(unlisted.body).toMatchObject({ error: 'Route is not allowed' });

  const forged = await page.request.post('/api/platform/auth/sessions', {
    headers: { origin: 'https://operator-console.example.net', 'content-type': 'application/json' },
    data: { email: 'auditor@e2e.test', password: 'irrelevant' },
  });
  expect(forged.status()).toBe(403);
  expect(await forged.json()).toMatchObject({ error: 'Cross-origin mutation rejected' });
});
