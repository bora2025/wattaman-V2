/**
 * Every call goes through this app's own /api/platform proxy, never directly to the marketplace
 * API — the operator's session token lives in an HttpOnly cookie the browser cannot read, so
 * there is deliberately no token-handling code here at all.
 */
/** One id per operator action, carried through the proxy to the API and stored on the audit row,
 * so a screen interaction and its audit trail can be tied together during an investigation
 * (plan §5.9). */
function newCorrelationId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `pa-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function platformFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`/api/platform/${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: {
      accept: 'application/json',
      'x-correlation-id': newCorrelationId(),
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
}

export async function platformJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await platformFetch(path, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((payload as { error?: string }).error || `Request failed (${response.status})`);
  return payload as T;
}

export interface OperatorProfile {
  operator: { id: string; email: string; displayName: string; status: string; mfaEnabled: boolean; createdAt: string };
  roles: Array<{ key: string; displayName: string }>;
  permissions: string[];
}
