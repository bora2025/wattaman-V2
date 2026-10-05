import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const SESSION_COOKIE = 'wattanam_platform_session';

/**
 * Server-side proxy to the marketplace API's /platform/v1 surface. The operator's session token
 * lives only in an HttpOnly cookie held by this Next.js server and is attached here as a Bearer
 * header — it is never returned to browser JS, so an XSS in an operator's browser cannot lift a
 * session that can act on customer accounts, entitlements, or payouts (plan §4).
 *
 * Routes are allowlisted rather than blindly forwarded: a path that isn't listed can't be reached
 * through this proxy even if the upstream API exposes it.
 */
const publicPost = new Set(['auth/sessions', 'auth/sessions/refresh']);
const sessionPost = new Set(['auth/sessions/revoke', 'auth/mfa/enroll', 'auth/mfa/enroll/confirm', 'auth/password']);
const sessionGet = new Set([
  'me', 'dashboard', 'operators', 'roles', 'customers', 'account-requests', 'schools', 'installations', 'publishers', 'plugins', 'submissions',
  'starter-bundles',
  'orders', 'entitlements', 'advisories', 'audit-events', 'operations/health', 'exports', 'plugin-requests',
  'schools/provisioning-requests',
  'school-billing-plans',
  'school-payment-methods',
]);
const sessionGetDetail = /^(operators|customers|schools|installations|publishers|plugins|submissions|orders|plugin-requests)\/[0-9a-zA-Z._-]+$|^schools\/[0-9a-f-]{36}\/(usage|billing)$|^schools\/provisioning-requests\/[0-9a-f-]{36}$/;
/**
 * Mutations reachable through this proxy, one readable pattern each. A single combined expression
 * became hard to extend without silently widening it -- and a path that is not listed here is a
 * 404 from this proxy, so an over-broad edit is the failure mode that matters.
 */
const ID = '[0-9a-f-]{36}';
const sessionPostPatterns = [
  new RegExp(`^plugin-requests/${ID}/(assign|start-review|request-information|approve|reject|fulfill|exception-proposals|exception-decisions)$`),
  /^starter-bundles$/,
  new RegExp(`^starter-bundles/${ID}/(publish|withdraw)$`),
  new RegExp(`^customers/${ID}/(mfa/(reset|issue)|password/reset)$`),
  new RegExp(`^account-requests/${ID}/(approve|reject)$`),
  /^schools$/,
  /^schools\/provisioning-requests$/,
  new RegExp(`^schools/provisioning-requests/${ID}/(submit|approve|cancel|retry)$`),
  /^schools\/adoptions\/discover$/,
  /^school-billing-plans$/,
  new RegExp(`^school-billing-plans/${ID}$`),
  new RegExp(`^school-billing-plans/${ID}/delete$`),
  /^school-payment-methods$/,
  new RegExp(`^school-payment-methods/${ID}$`),
  /^school-billing-alerts\/dispatch$/,
  /^school-billing-cycle\/run$/,
  new RegExp(`^schools/${ID}/(update|enrollment-tokens|adopt-installation|infrastructure)$`),
  new RegExp(`^schools/${ID}/(suspend|reactivate|terminate|restore|delete|domains)$`),
  new RegExp(`^schools/${ID}/domains/${ID}/(verify|remove)$`),
  new RegExp(`^schools/${ID}/invoices$`),
  new RegExp(`^schools/${ID}/(billing-plan|plan-invoices)$`),
  new RegExp(`^schools/${ID}/invoices/${ID}/(payments|void|notify)$`),
  new RegExp(`^schools/${ID}/payment-submissions/${ID}/(approve|reject)$`),
  new RegExp(`^schools/${ID}/enrollment-tokens/${ID}/revoke$`),
];
const matchesSessionPost = (path: string) => sessionPostPatterns.some((pattern) => pattern.test(path));

function marketplaceUrl(): string {
  const value = process.env.MARKETPLACE_API_URL;
  if (!value) throw new Error('MARKETPLACE_API_URL is not configured');
  return value;
}

/**
 * Behind a reverse proxy (Railway, and any ingress that terminates TLS), `nextUrl.origin` is the
 * *internal* listener — e.g. http://localhost:3020 — not the public URL the browser used. Comparing
 * a browser's `Origin` header against it rejects every legitimate same-origin POST, which silently
 * makes sign-in impossible in a deployed environment while working perfectly on localhost. Trust
 * the forwarded headers the proxy sets, falling back to nextUrl for direct/local runs.
 */
function expectedOrigins(request: NextRequest): string[] {
  const origins = new Set<string>([request.nextUrl.origin]);
  const forwardedHost = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (forwardedHost) {
    const proto = request.headers.get('x-forwarded-proto') ?? request.nextUrl.protocol.replace(':', '');
    origins.add(`${proto}://${forwardedHost}`);
  }
  return [...origins];
}

function sessionCookieOptions(expiresAt?: string) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/',
    ...(expiresAt ? { expires: new Date(expiresAt) } : {}),
  };
}

async function proxy(request: NextRequest, segments: string[], method: 'GET' | 'POST' | 'PATCH') {
  const path = segments.join('/');
  const allowed = method === 'GET' ? sessionGet.has(path) || sessionGetDetail.test(path) : publicPost.has(path) || sessionPost.has(path) || matchesSessionPost(path);
  if (!allowed) return NextResponse.json({ error: 'Route is not allowed' }, { status: 404 });

  if (method !== 'GET') {
    const origin = request.headers.get('origin');
    if (origin && !expectedOrigins(request).includes(origin)) {
      return NextResponse.json({ error: 'Cross-origin mutation rejected' }, { status: 403 });
    }
  }

  const session = request.cookies.get(SESSION_COOKIE)?.value;
  const needsSession = method === 'GET' ? allowed : sessionPost.has(path) || matchesSessionPost(path);
  if (needsSession && !session) return NextResponse.json({ error: 'Sign-in required' }, { status: 401 });

  const target = new URL(`/platform/v1/${path}`, marketplaceUrl());
  if (method === 'GET') request.nextUrl.searchParams.forEach((value, key) => target.searchParams.append(key, value));

  let body = method !== 'GET' ? await request.text() : undefined;
  // The browser never holds the token, so it can't send it — fill it in server-side for the two
  // routes whose upstream contract takes the token in the body rather than the header.
  if (method === 'POST' && session && (path === 'auth/sessions/revoke' || path === 'auth/sessions/refresh')) {
    body = JSON.stringify({ sessionToken: session });
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method,
      redirect: 'manual',
      cache: 'no-store',
      headers: {
        accept: 'application/json',
        ...(session ? { authorization: `Bearer ${session}` } : {}),
        ...(method !== 'GET' ? { 'content-type': 'application/json' } : {}),
        // Forwarded so the audit row the API writes carries the same id the browser used.
        ...(request.headers.get('x-correlation-id') ? { 'x-correlation-id': request.headers.get('x-correlation-id')! } : {}),
      },
      ...(method !== 'GET' ? { body } : {}),
    });
  } catch {
    return NextResponse.json({ error: 'Marketplace API is unavailable' }, { status: 502 });
  }

  if (path === 'exports' && upstream.ok) {
    const headers = new Headers({ 'content-type': upstream.headers.get('content-type') || 'text/csv; charset=utf-8' });
    const disposition = upstream.headers.get('content-disposition');
    if (disposition) headers.set('content-disposition', disposition);
    return new NextResponse(upstream.body, { status: upstream.status, headers });
  }

  const payload = await upstream.json().catch(() => ({ error: 'Marketplace API returned invalid JSON' }));

  // Login: capture the token into the cookie and strip it from the response body.
  if (path === 'auth/sessions' && upstream.ok && payload.sessionToken) {
    const { sessionToken, ...safe } = payload;
    const response = NextResponse.json(safe, { status: upstream.status });
    response.cookies.set(SESSION_COOKIE, sessionToken, sessionCookieOptions(payload.expiresAt));
    return response;
  }
  if (path === 'auth/sessions/refresh' && upstream.ok && payload.sessionToken) {
    const response = NextResponse.json({ refreshed: true, expiresAt: payload.expiresAt }, { status: upstream.status });
    response.cookies.set(SESSION_COOKIE, payload.sessionToken, sessionCookieOptions(payload.expiresAt));
    return response;
  }
  if (path === 'auth/sessions/revoke' && upstream.ok) {
    const response = NextResponse.json(payload, { status: upstream.status });
    response.cookies.delete(SESSION_COOKIE);
    return response;
  }

  return NextResponse.json(payload, { status: upstream.status });
}

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  try { return await proxy(request, (await context.params).path, 'GET'); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Unavailable' }, { status: 503 }); }
}

export async function POST(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  try { return await proxy(request, (await context.params).path, 'POST'); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Unavailable' }, { status: 503 }); }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  try { return await proxy(request, (await context.params).path, 'PATCH'); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Unavailable' }, { status: 503 }); }
}
