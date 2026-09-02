/**
 * Shared helpers for the operator control plane's browser suite.
 *
 * The TOTP generator below is written from RFC 6238 rather than imported from the marketplace
 * API's `identity-crypto.ts` on purpose: the test stands in for the operator's authenticator app,
 * and an independent implementation means a passing sign-in proves both sides agree with the
 * standard, not merely with each other.
 */
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';

export interface SeededOperator {
  email: string;
  password: string;
  totpSecret: string;
  roles: string[];
}

export interface SeededMarketplace {
  formulaLabel: string;
  publisherId: string;
  pluginId: string;
  freePluginId: string;
  paidPluginId: string;
  accountId: string;
  installationRecordId: string;
  installationId: string;
  installationLabel: string | null;
  pendingOrderId: string;
  paidOrderId: string;
  pluginRequestId: string;
  paidAccessRequestId: string;
}

interface FixtureFile {
  operators: SeededOperator[];
  marketplace: SeededMarketplace;
}

let cached: FixtureFile | null = null;

export function fixtures(): FixtureFile {
  if (cached) return cached;
  const file = process.env.E2E_FIXTURES;
  if (!file) throw new Error('E2E_FIXTURES is not set — start the suite through scripts/e2e-stack.mjs');
  cached = JSON.parse(readFileSync(file, 'utf8')) as FixtureFile;
  return cached;
}

export function operator(email: string): SeededOperator {
  const found = fixtures().operators.find((entry) => entry.email === email);
  if (!found) throw new Error(`No seeded operator ${email}`);
  return found;
}

/** The bootstrapped Platform Owner, deliberately seeded without MFA so one spec can walk the
 * mandatory-enrollment path a real first sign-in takes. */
export function owner(): { email: string; password: string } {
  return {
    email: process.env.E2E_OWNER_EMAIL ?? 'owner@e2e.test',
    password: process.env.E2E_OWNER_PASSWORD ?? 'E2EOwnerPass123!',
  };
}

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(encoded: string): Buffer {
  const clean = encoded.toUpperCase().replace(/=+$/, '');
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const character of clean) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index === -1) throw new Error(`Not base32: ${character}`);
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function totp(secretBase32: string, at: number = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const digest = createHmac('sha1', base32Decode(secretBase32)).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 1_000_000).padStart(6, '0');
}

/** Full credential + TOTP sign-in for an operator who has already enrolled. Ends on whatever page
 * the app lands on, which is /dashboard even for operators who cannot read it — that asymmetry is
 * itself asserted in the authorization spec. */
export async function signIn(page: Page, who: SeededOperator): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(who.email);
  await page.getByLabel('Password').fill(who.password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  const code = page.getByLabel('Authentication code');
  await expect(code).toBeVisible();
  await code.fill(totp(who.totpSecret));
  await page.getByRole('button', { name: 'Verify and sign in' }).click();
  await page.waitForURL('**/dashboard');
}

export async function signOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL('**/login');
}

/**
 * Calls the app's own proxy from inside the page, the way the operator's browser does.
 *
 * Deliberately not Playwright's `page.request`: that issues the call from outside the document, so
 * the `SameSite=Strict` session cookie does not ride along and every authorization check comes
 * back 401 instead of the 403 the test is trying to observe. Running `fetch` in the page keeps the
 * question the test is actually asking — what does the API do for *this signed-in operator*.
 */
export async function apiCall(
  page: Page,
  path: string,
  init?: { method?: string; body?: unknown; headers?: Record<string, string> },
): Promise<{ status: number; body: unknown }> {
  return page.evaluate(async ({ path, init }) => {
    const response = await fetch(`/api/platform/${path}`, {
      method: init?.method ?? 'GET',
      credentials: 'same-origin',
      headers: { accept: 'application/json', ...(init?.body ? { 'content-type': 'application/json' } : {}), ...init?.headers },
      ...(init?.body ? { body: JSON.stringify(init.body) } : {}),
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  }, { path, init });
}

/** Every screen renders a "Loading…" placeholder while its fetch is in flight; its absence is a
 * deterministic readiness signal. `networkidle` is not — it never settles on this app. */
export async function waitForScreen(page: Page): Promise<void> {
  await expect(page.locator('main')).toBeVisible();
  await expect(page.getByText('Loading…')).toHaveCount(0);
}

/** Navigation entries the shell actually rendered for the signed-in operator. */
export async function navLabels(page: Page): Promise<string[]> {
  await expect(page.locator('aside')).toBeVisible();
  return page.locator('aside nav a').allTextContents();
}

export const SESSION_COOKIE = 'wattanam_platform_session';
