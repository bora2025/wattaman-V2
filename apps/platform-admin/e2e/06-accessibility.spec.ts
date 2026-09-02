/**
 * PA2-6 accessibility gate.
 *
 * Operators work these screens all day, often on someone else's laptop in a browser they did not
 * configure. The bar here is WCAG 2.1 A/AA on every screen an operator can reach, checked with
 * axe-core against the real rendered page rather than against the source.
 *
 * Colour contrast is included deliberately: it is the violation this kind of dense, grey-on-white
 * admin UI is most likely to introduce, and excluding it would make the gate decorative.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { fixtures, operator, owner, signIn, waitForScreen } from './support';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function scan(page: import('@playwright/test').Page) {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    nodes: violation.nodes.map((node) => node.target.join(' ')),
  }));
}

test('the sign-in screen is accessible', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Wattanam Platform Admin' })).toBeVisible();
  expect(await scan(page)).toEqual([]);
});

test('the MFA challenge step is accessible', async ({ page }) => {
  const who = operator('auditor@e2e.test');
  await page.goto('/login');
  await page.getByLabel('Email').fill(who.email);
  await page.getByLabel('Password').fill(who.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByLabel('Authentication code')).toBeVisible();
  expect(await scan(page)).toEqual([]);
});

test('the mandatory-enrollment screen is accessible', async ({ page }) => {
  const who = owner();
  await page.goto('/login');
  await page.getByLabel('Email').fill(who.email);
  await page.getByLabel('Password').fill(who.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  // 01-authentication already enrolled this operator, so the code step is what renders now; the
  // enrollment panel is covered there. Scan whichever second factor step appears.
  await expect(page.getByRole('button', { name: /Verify and sign in|Confirm and finish enrollment/ })).toBeVisible();
  expect(await scan(page)).toEqual([]);
});

const SCREENS = [
  '/dashboard', '/customers', '/installations', '/publishers', '/plugins',
  '/plugin-requests', '/orders', '/entitlements', '/advisories', '/operations', '/exports', '/audit',
];

test('every operator screen passes WCAG 2.1 A/AA', async ({ page }) => {
  await signIn(page, operator('auditor@e2e.test'));

  const failures: Record<string, unknown> = {};
  for (const screen of SCREENS) {
    await page.goto(screen);
    // Tables and cards populate after their fetch resolves; scanning too early would check an
    // empty page and report a clean bill of health for markup that never rendered.
    await waitForScreen(page);
    const violations = await scan(page);
    if (violations.length) failures[screen] = violations;
  }
  expect(failures).toEqual({});
});

test('detail screens pass WCAG 2.1 A/AA', async ({ page }) => {
  const { installationRecordId, paidOrderId, pluginRequestId } = fixtures().marketplace;
  await signIn(page, operator('auditor@e2e.test'));

  const failures: Record<string, unknown> = {};
  for (const screen of [`/installations/${installationRecordId}`, `/orders/${paidOrderId}`, `/plugin-requests/${pluginRequestId}`]) {
    await page.goto(screen);
    await waitForScreen(page);
    const violations = await scan(page);
    if (violations.length) failures[screen] = violations;
  }
  expect(failures).toEqual({});
});

test('the operator shell is navigable by keyboard alone', async ({ page }) => {
  await signIn(page, operator('auditor@e2e.test'));
  await page.goto('/dashboard');
  await waitForScreen(page);

  const focusedHref = () => page.evaluate(() => document.activeElement?.getAttribute('href'));

  // Tab order follows the sidebar, so an operator on a keyboard reaches navigation first…
  await page.keyboard.press('Tab');
  expect(await focusedHref()).toBe('/dashboard');
  await page.keyboard.press('Tab');
  expect(await focusedHref()).toBe('/customers');

  // …and Enter follows the focused link, with no pointer involved anywhere.
  await page.keyboard.press('Enter');
  await page.waitForURL('**/customers');
  await waitForScreen(page);
  await expect(page.getByRole('heading', { name: 'Customers' })).toBeVisible();
});
