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
const sessionPost = new Set(['auth/sessions/revoke', 'auth/mfa/enroll', 'auth/mfa/enroll/confirm']);
const sessionGet = new Set(['me', 'dashboard', 'plugins', 'installations', 'audit-events']);

function marketplaceUrl(): string {
  const value = process.env.MARKETPLACE_API_URL;
  if (!value) throw new Error('MARKETPLACE_API_URL is not configured');
  return value;
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

async function proxy(request: NextRequest, segments: string[], method: 'GET' | 'POST') {
  const path = segments.join('/');
  const allowed = method === 'GET' ? sessionGet.has(path) : publicPost.has(path) || sessionPost.has(path);
  if (!allowed) return NextResponse.json({ error: 'Route is not allowed' }, { status: 404 });

  if (method === 'POST') {
    const origin = request.headers.get('origin');
    if (origin && origin !== request.nextUrl.origin) {
      return NextResponse.json({ error: 'Cross-origin mutation rejected' }, { status: 403 });
    }
  }

  const session = request.cookies.get(SESSION_COOKIE)?.value;
  const needsSession = method === 'GET' ? sessionGet.has(path) : sessionPost.has(path);
  if (needsSession && !session) return NextResponse.json({ error: 'Sign-in required' }, { status: 401 });

  const target = new URL(`/platform/v1/${path}`, marketplaceUrl());
  if (method === 'GET') request.nextUrl.searchParams.forEach((value, key) => target.searchParams.append(key, value));

  let body = method === 'POST' ? await request.text() : undefined;
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
        ...(method === 'POST' ? { 'content-type': 'application/json' } : {}),
      },
      ...(method === 'POST' ? { body } : {}),
    });
  } catch {
    return NextResponse.json({ error: 'Marketplace API is unavailable' }, { status: 502 });
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
