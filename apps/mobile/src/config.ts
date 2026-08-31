import * as SecureStore from 'expo-secure-store';

const SERVER_URL_KEY = 'school_server_url';
const INSTALLATION_ID_KEY = 'school_installation_id';
export const MOBILE_API_VERSION = '1';

export interface InstallationDiscovery {
  state: string;
  installation?: { id?: string; schoolName?: string } | null;
}

function normalizeServerUrl(value: string): string {
  const url = new URL(value.trim());
  const localDevHost = ['localhost', '127.0.0.1', '10.0.2.2'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(__DEV__ && localDevHost)) {
    throw new Error('School address must use HTTPS');
  }
  return url.toString().replace(/\/$/, '');
}

export async function getSchoolServerUrl(): Promise<string> {
  const stored = await SecureStore.getItemAsync(SERVER_URL_KEY);
  const configured = stored || process.env.EXPO_PUBLIC_API_URL || '';
  if (!configured) throw new Error('Enter your school server address');
  return normalizeServerUrl(configured);
}

export async function discoverSchoolServer(value: string): Promise<InstallationDiscovery> {
  const serverUrl = normalizeServerUrl(value);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`${serverUrl}/api/installation/status`, {
      headers: { 'X-Wattanam-API-Version': MOBILE_API_VERSION },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`School discovery failed (${response.status})`);
    const result = (await response.json()) as InstallationDiscovery;
    if (!result || typeof result.state !== 'string') {
      throw new Error('School returned an invalid installation response');
    }
    return result;
  } finally {
    clearTimeout(timer);
  }
}

export async function saveSchoolServer(value: string, installationId?: string): Promise<string> {
  const serverUrl = normalizeServerUrl(value);
  await SecureStore.setItemAsync(SERVER_URL_KEY, serverUrl);
  if (installationId) await SecureStore.setItemAsync(INSTALLATION_ID_KEY, installationId);
  else await SecureStore.deleteItemAsync(INSTALLATION_ID_KEY);
  return serverUrl;
}

export async function getSavedInstallationId(): Promise<string | null> {
  return SecureStore.getItemAsync(INSTALLATION_ID_KEY);
}
