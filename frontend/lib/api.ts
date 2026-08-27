/**
 * Centralized fetch wrapper for the web app.
 * Uses HttpOnly cookies for auth — no manual token handling needed.
 * Automatically retries with a token refresh on 401.
 */

/** Returns the backend base URL, falling back to '' (relative) for local dev. */
function getApiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? '';
}

let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  try {
    const res = await fetch(`${getApiBase()}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const url = `${getApiBase()}${path}`;
  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      ...options.headers,
    },
  });

  // If 401, try refreshing the access token once
  if (res.status === 401) {
    if (!isRefreshing) {
      isRefreshing = true;
      refreshPromise = refreshAccessToken();
    }
    const refreshed = await refreshPromise;
    isRefreshing = false;
    refreshPromise = null;

    if (refreshed) {
      // Retry the original request
      return fetch(url, {
        ...options,
        credentials: 'include',
        headers: {
          ...options.headers,
        },
      });
    }

    // Refresh failed — redirect to login
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  }

  return res;
}

/** Helper to get the current user info from the access token cookie via /auth/me */
export async function getCurrentUser(): Promise<{
  userId: string;
  email: string;
  name?: string;
  role: string;
  departmentId?: string | null;
  department?: { id: string; name: string; nameKh?: string } | null;
} | null> {
  try {
    const res = await apiFetch('/api/auth/me');
    if (res.ok) {
      const data = await res.json();
      return {
        userId: data.id,
        email: data.email,
        name: data.name,
        role: data.role,
        departmentId: data.departmentId ?? null,
        department: data.department ?? null,
      };
    }
    return null;
  } catch {
    return null;
  }
}
