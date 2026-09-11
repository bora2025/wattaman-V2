import type { FrontendDistribution } from './navigation-registry';

const CORE_EXACT_ROUTES = new Set([
  '/',
  '/login',
  '/reset-password',
  '/setup',
  '/suspended',
  '/admin',
  '/admin/search',
  '/admin/users',
  '/admin/plugins',
  '/admin/settings',
  '/admin/backup',
  '/admin/system',
  '/admin/platform-billing',
  '/admin/audit',
  '/admin/profile',
  '/admin/notifications',
  '/admin/licensing',
  '/admin/appearance',
  '/admin/appearance/about',
  '/teacher',
  '/student',
  '/settings/notifications',
]);

const CORE_ROUTE_PREFIXES = [
  '/api/',
  '/marketplace',
  '/plugins/',
  '/_next/',
];

export function isRouteAvailable(pathname: string, distribution: FrontendDistribution): boolean {
  if (distribution === 'legacy-full') return true;
  const normalized = pathname !== '/' ? pathname.replace(/\/+$/, '') : pathname;
  if (CORE_EXACT_ROUTES.has(normalized)) return true;
  if (CORE_ROUTE_PREFIXES.some((prefix) => normalized.startsWith(prefix))) return true;
  // Public assets are not application modules and must remain available to the core shell.
  if (/\.[a-z0-9]{2,8}$/i.test(normalized)) return true;
  return false;
}

export const coreRoutePolicy = {
  exact: [...CORE_EXACT_ROUTES],
  prefixes: [...CORE_ROUTE_PREFIXES],
} as const;
