import { NextRequest, NextResponse } from 'next/server';

const SESSION_COOKIE = 'wattanam_marketplace_session';
const publicGet = new Set(['catalog', 'publisher-policies']);
const sessionGet = new Set(['customer/orders', 'customer/entitlements', 'customer/plugin-requests']);
const publicPost = new Set(['accounts', 'accounts/email-verifications/confirm', 'sessions', 'sessions/refresh', 'password-resets', 'password-resets/confirm']);
const sessionPost = new Set(['customer/orders', 'customer/plugin-requests', 'sessions/revoke', 'mfa/enrollments', 'mfa/enrollments/confirm', 'mfa/disable']);
const linkRequestPathPattern = /^marketplace-links\/[0-9a-f-]{36}$/;
const linkDecisionPathPattern = /^marketplace-links\/[0-9a-f-]{36}\/(approve|deny)$/;

function marketplaceUrl() {
  const value = process.env.MARKETPLACE_URL;
  if (!value) throw new Error('MARKETPLACE_URL is not configured');
  return value;
}

/**
 * Behind a reverse proxy (Railway, or the gateway container), `nextUrl.origin` is the internal
 * listener, not the public URL the browser used — so comparing a browser's `Origin` header against
 * it rejects every legitimate same-origin POST and silently breaks sign-in and checkout in a
 * deployed environment while working fine on localhost. Trust the proxy's forwarded headers,
 * falling back to nextUrl for direct/local runs.
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

async function proxy(request: NextRequest, segments: string[], method: 'GET' | 'POST') {
  const path = segments.join('/');
  const protectedArtifact = method === 'GET' && /^artifacts\/[a-f0-9]{64}$/.test(path);
  const isPublicLinkRequest = method === 'GET' && linkRequestPathPattern.test(path);
  const isLinkDecision = method === 'POST' && linkDecisionPathPattern.test(path);
  const allowed = method === 'GET'
    ? publicGet.has(path) || sessionGet.has(path) || protectedArtifact || isPublicLinkRequest
    : publicPost.has(path) || sessionPost.has(path) || isLinkDecision;
  if (!allowed) return NextResponse.json({ error: 'Marketplace route is not allowed' }, { status: 404 });
  if (method === 'POST') {
    const origin = request.headers.get('origin');
    if (origin && !expectedOrigins(request).includes(origin)) return NextResponse.json({ error: 'Cross-origin marketplace mutation rejected' }, { status: 403 });
  }
  const session = request.cookies.get(SESSION_COOKIE)?.value;
  if ((sessionGet.has(path) || sessionPost.has(path) || protectedArtifact || isLinkDecision) && !session) return NextResponse.json({ error: 'Marketplace sign-in required' }, { status: 401 });
  const target = new URL(`/v1/${path}`, marketplaceUrl());
  if (method === 'GET') request.nextUrl.searchParams.forEach((value, key) => target.searchParams.append(key, value));
  let requestBody = method === 'POST' ? await request.text() : undefined;
  if (method === 'POST' && session && (path === 'sessions/revoke' || path === 'sessions/refresh')) requestBody = JSON.stringify({ sessionToken: session });
  const upstream = await fetch(target, {
    method, redirect: 'manual', cache: 'no-store',
    headers: { accept: 'application/json', ...(session ? { authorization: `Bearer ${session}` } : {}), ...(method === 'POST' ? { 'content-type': 'application/json' } : {}) },
    ...(method === 'POST' ? { body: requestBody } : {}),
  });
  if (protectedArtifact) {
    const headers = new Headers();
    for (const name of ['content-type', 'content-disposition', 'content-length', 'etag', 'cache-control']) {
      const value = upstream.headers.get(name); if (value) headers.set(name, value);
    }
    return new NextResponse(upstream.body, { status: upstream.status, headers });
  }
  const body = await upstream.json().catch(() => ({ error: 'Marketplace returned invalid JSON' }));
  if (path === 'sessions' && upstream.ok && body.status === 'authenticated' && body.sessionToken) {
    const responseBody = { ...body }; delete responseBody.sessionToken;
    const response = NextResponse.json(responseBody, { status: upstream.status });
    response.cookies.set(SESSION_COOKIE, body.sessionToken, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', expires: body.expiresAt ? new Date(body.expiresAt) : undefined });
    return response;
  }
  if (path === 'sessions/refresh' && upstream.ok && body.sessionToken) {
    const response = NextResponse.json({ refreshed: true, expiresAt: body.expiresAt }, { status: upstream.status });
    response.cookies.set(SESSION_COOKIE, body.sessionToken, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', expires: body.expiresAt ? new Date(body.expiresAt) : undefined });
    return response;
  }
  if (path === 'sessions/revoke' && upstream.ok) {
    const response = NextResponse.json(body, { status: upstream.status });
    response.cookies.delete(SESSION_COOKIE);
    return response;
  }
  return NextResponse.json(body, { status: upstream.status });
}

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  try { return proxy(request, (await context.params).path, 'GET'); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Marketplace unavailable' }, { status: 503 }); }
}

export async function POST(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  try { return proxy(request, (await context.params).path, 'POST'); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Marketplace unavailable' }, { status: 503 }); }
}
