/**
 * PA2-6: the authorization matrix, exercised through the browser.
 *
 * Every denial is asserted twice — once on what the operator can *see*, and once on what the API
 * will *do* for them. Plan §7 is explicit that "UI hiding is not authorization", so a spec that
 * only checked the navigation would still pass on an app that served the data to anyone who typed
 * the URL.
 */
import { expect, test } from '@playwright/test';
import { apiCall, navLabels, operator, signIn } from './support';

const EXPECTED_NAV: Record<string, string[]> = {
  // No universal admin: the Platform Owner runs the platform and still cannot browse the catalog,
  // customer records, or commerce. That absence is a designed property, not an oversight.
  'owner2@e2e.test': ['Dashboard', 'Operators', 'Operations', 'Exports', 'Audit'],
  'support@e2e.test': [
    'Dashboard', 'Customers', 'Account requests', 'Customer schools', 'School provisioning', 'School installations', 'School plugin requests',
  ],
  'finance@e2e.test': ['Dashboard', 'School billing plans', 'Orders', 'Entitlements'],
  'reviewer@e2e.test': ['Dashboard', 'Plugins', 'Submissions'],
  'auditor@e2e.test': [
    'Dashboard', 'Customers', 'Account requests', 'Customer schools', 'School billing plans', 'School provisioning',
    'School installations', 'Publishers', 'Plugins',
    'Starter bundles', 'School plugin requests', 'Orders', 'Entitlements', 'Advisories', 'Operations', 'Exports', 'Audit',
  ],
  'norole@e2e.test': [],
};

/** One denied read per role, each something the role plausibly wants but must not have. */
const DENIED: Array<{ email: string; api: string; screen: string; navLabel: string }> = [
  { email: 'support@e2e.test', api: 'orders', screen: '/orders', navLabel: 'Orders' },
  { email: 'finance@e2e.test', api: 'customers', screen: '/customers', navLabel: 'Customers' },
  { email: 'reviewer@e2e.test', api: 'audit-events', screen: '/audit', navLabel: 'Audit' },
  { email: 'auditor@e2e.test', api: 'operators', screen: '/operators', navLabel: 'Operators' },
  { email: 'owner2@e2e.test', api: 'plugins', screen: '/plugins', navLabel: 'Plugins' },
  { email: 'norole@e2e.test', api: 'dashboard', screen: '/dashboard', navLabel: 'Dashboard' },
];

for (const [email, expected] of Object.entries(EXPECTED_NAV)) {
  test(`navigation for ${email} shows exactly its permitted sections`, async ({ page }) => {
    await signIn(page, operator(email));
    expect(await navLabels(page)).toEqual(expected);
    if (expected.length === 0) {
      await expect(page.getByText('No permissions are granted to this operator yet')).toBeVisible();
    }
  });
}

for (const { email, api, screen, navLabel } of DENIED) {
  test(`${email} is denied ${api} in the UI and at the API`, async ({ page }) => {
    await signIn(page, operator(email));

    // Not offered in navigation…
    expect(await navLabels(page)).not.toContain(navLabel);

    // …hand-typing the URL renders a refusal instead of the data…
    await page.goto(screen);
    await expect(page.locator('p[role="alert"]')).toBeVisible();

    // …because the API refuses it, which is where the decision actually lives.
    expect((await apiCall(page, api)).status).toBe(403);
  });
}

test('a denied role cannot reach a detail record either', async ({ page }) => {
  await signIn(page, operator('finance@e2e.test'));
  expect((await apiCall(page, 'customers/00000000-0000-4000-8000-000000000000')).status).toBe(403);
});

test('a denied role cannot export data it may not read', async ({ page }) => {
  await signIn(page, operator('support@e2e.test'));
  expect((await apiCall(page, 'exports?resource=orders&limit=10')).status).toBe(403);
});

test('every screen requires a session, not merely a hidden link', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  for (const screen of ['/dashboard', '/orders', '/customers', '/audit', '/plugin-requests']) {
    await page.goto(screen);
    await page.waitForURL('**/login');
  }
  await context.close();
});
