import type { NavigationRegistration } from './navigation-registry';
import { composeNavigation, frontendDistribution } from './navigation-registry';

/** Static navigation owned by the lean customer-school core. Feature plugins append their own entries. */
export const adminNavigationRegistry: readonly NavigationRegistration[] = [
  { label: 'nav.dashboard', href: '/admin', icon: 'dashboard', section: 'nav.section.overview', source: 'core' },
  { label: 'nav.search', href: '/admin/search', icon: 'search', source: 'core' },
  { label: 'nav.manageUsers', href: '/admin/users', icon: 'users', section: 'nav.section.people', source: 'core' },
  { label: 'Platform Billing', href: '/admin/platform-billing', icon: 'money', section: 'Core services', badgeKey: 'platform-billing', source: 'core' },
  { label: 'Backup & Restore', href: '/admin/backup', icon: 'briefcase', source: 'core' },
  { label: 'Marketplace & Plugins', href: '/admin/plugins', icon: 'briefcase', source: 'core' },
  { label: 'Updates & Health', href: '/admin/system', icon: 'chart', source: 'core' },
  { label: 'Licensing', href: '/admin/licensing', icon: 'certificate', source: 'core' },
  { label: 'Audit & Security', href: '/admin/audit', icon: 'clipboard', source: 'core' },
  { label: 'nav.settings', href: '/admin/settings', icon: 'settings', source: 'core' },
  { label: 'My Profile', href: '/admin/profile', icon: 'users', source: 'core' },
  { label: 'Appearance', href: '/admin/appearance', icon: 'paint', source: 'core' },
];

export function adminNavigationForDistribution(value?: string) {
  return composeNavigation(adminNavigationRegistry, frontendDistribution(value));
}

export const adminNav = adminNavigationForDistribution();
