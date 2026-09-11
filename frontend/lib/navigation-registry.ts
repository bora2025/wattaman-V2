export type FrontendDistribution = 'core' | 'legacy-full';
export type NavigationSource = 'core' | 'legacy-business' | 'plugin';

export interface NavigationItem {
  label: string;
  href: string;
  icon: string;
  section?: string;
  badgeKey?: 'messages' | 'announcements' | 'class-registrations' | 'platform-billing';
}

export interface NavigationRegistration extends NavigationItem {
  source: NavigationSource;
  pluginId?: string;
}

export function frontendDistribution(value = process.env.NEXT_PUBLIC_WATTANAM_DISTRIBUTION): FrontendDistribution {
  const normalized = value?.trim().toLowerCase() || 'legacy-full';
  if (normalized !== 'core' && normalized !== 'legacy-full') {
    throw new Error(`NEXT_PUBLIC_WATTANAM_DISTRIBUTION must be core or legacy-full (got "${normalized}")`);
  }
  return normalized;
}

export function composeNavigation(
  registry: readonly NavigationRegistration[],
  distribution: FrontendDistribution,
  pluginContributions: readonly NavigationRegistration[] = [],
): NavigationItem[] {
  const staticEntries = registry.filter((entry) =>
    entry.source === 'core' || (entry.source === 'legacy-business' && distribution === 'legacy-full'),
  );
  const plugins = pluginContributions.filter((entry) => entry.source === 'plugin' && Boolean(entry.pluginId));
  return [...staticEntries, ...plugins].map(({ source: _source, pluginId: _pluginId, ...item }) => item);
}

