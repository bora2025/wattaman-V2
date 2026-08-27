import * as SecureStore from 'expo-secure-store';
import { API_BASE_URL } from './config';

const TOKEN_KEY = 'auth_token';
const REFRESH_KEY = 'auth_refresh_token';
const USER_KEY = 'auth_user';

export async function login(email: string, password: string) {
  const res = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Login failed');
  }
  const data = await res.json();
  await SecureStore.setItemAsync(TOKEN_KEY, data.access_token);
  if (data.refresh_token) {
    await SecureStore.setItemAsync(REFRESH_KEY, data.refresh_token);
  }
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(data.user));
  return data;
}

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_KEY);
}

export async function getUser(): Promise<any | null> {
  const raw = await SecureStore.getItemAsync(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

export async function logout() {
  // Best-effort: tell the server to revoke refresh tokens. Ignore failures.
  try {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    await fetch(`${API_BASE_URL}/auth/logout`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  } catch {}
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(REFRESH_KEY);
  await SecureStore.deleteItemAsync(USER_KEY);
}

/**
 * Use the stored refresh token to obtain a fresh access token.
 * Returns the new access token, or null if refresh failed.
 * Does NOT clear local credentials on failure — only manual logout signs the user out.
 */
let refreshInFlight: Promise<string | null> | null = null;
export async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const rt = await getRefreshToken();
      if (!rt) return null;
      const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: rt }),
      });
      if (!res.ok) return null;
      const data = await res.json().catch(() => null);
      if (!data?.access_token) return null;
      await SecureStore.setItemAsync(TOKEN_KEY, data.access_token);
      if (data.refresh_token) {
        await SecureStore.setItemAsync(REFRESH_KEY, data.refresh_token);
      }
      return data.access_token as string;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

async function buildRequest(path: string, options: RequestInit, token: string | null) {
  return fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
}

export async function fetchWithAuth(path: string, options: RequestInit = {}) {
  const token = await getToken();
  let res = await buildRequest(path, options, token);
  // If access token expired, silently refresh once and retry — keeps the
  // user logged in across access-token expiries without forcing a re-login.
  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      res = await buildRequest(path, options, newToken);
    }
  }
  return res;
}
