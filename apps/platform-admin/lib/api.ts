/**
 * Every call goes through this app's own /api/platform proxy, never directly to the marketplace
 * API — the operator's session token lives in an HttpOnly cookie the browser cannot read, so
 * there is deliberately no token-handling code here at all.
 */
export async function platformFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`/api/platform/${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: { accept: 'application/json', ...(init?.body ? { 'content-type': 'application/json' } : {}), ...init?.headers },
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
