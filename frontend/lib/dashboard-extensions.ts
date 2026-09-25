export interface PluginDashboardContribution {
  pluginId: string;
  id: string;
  label: string;
  href: string;
}

export interface DashboardExtensionCard extends PluginDashboardContribution {
  description: string;
}

export interface MarketplaceOnboardingStep {
  id: 'link' | 'browse' | 'activate';
  title: string;
  description: string;
  href: '/admin/plugins';
  complete: boolean;
}

/**
 * Transitional LC-2 adapter: every active, permission-filtered plugin navigation contribution is
 * also discoverable from the core dashboard. LC-3 replaces this with the richer UI v2 card schema.
 */
export function pluginDashboardCards(value: unknown): DashboardExtensionCard[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): DashboardExtensionCard[] => {
    if (!entry || typeof entry !== 'object') return [];
    const item = entry as Partial<PluginDashboardContribution>;
    if (!item.pluginId || !item.id || !item.label || !item.href) return [];
    if (!item.href.startsWith(`/plugins/${item.pluginId}/`) || item.href.includes('..')) return [];
    return [{
      pluginId: item.pluginId,
      id: item.id,
      label: item.label,
      href: item.href,
      description: `Open ${item.label} from the active ${item.pluginId} plugin.`,
    }];
  });
}

export function marketplaceOnboarding(linked: boolean, activePluginCount: number): MarketplaceOnboardingStep[] {
  return [
    {
      id: 'link', title: 'Link your marketplace account',
      description: 'Connect this installation securely so your school can acquire licensed plugins.',
      href: '/admin/plugins', complete: linked,
    },
    {
      id: 'browse', title: 'Choose the features you need',
      description: 'Browse verified free and paid plugins without adding unused school modules.',
      href: '/admin/plugins', complete: activePluginCount > 0,
    },
    {
      id: 'activate', title: 'Install and activate plugins',
      description: 'Return to Plugin Manager to verify, install and activate each selected feature.',
      href: '/admin/plugins', complete: activePluginCount > 0,
    },
  ];
}
