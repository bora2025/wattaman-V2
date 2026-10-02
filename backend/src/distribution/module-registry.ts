export type RootModuleClassification = 'core' | 'shared' | 'proxy' | 'business';

export interface RootModuleRegistration {
  module: string;
  importPath: string;
  classification: RootModuleClassification;
  owner: string;
  note?: string;
}

/**
 * Authoritative classification for every local Nest module imported directly by AppModule.
 *
 * AppModule consumes the selected names, keeping composition and classification in one reviewed
 * source rather than maintaining a second hand-written allow-list.
 */
export const ROOT_MODULE_REGISTRY: readonly RootModuleRegistration[] = [
  { module: 'DatabaseModule', importPath: './database/database.module', classification: 'core', owner: 'lean-core' },
  { module: 'SchoolAccessModule', importPath: './marketplace/school-access.module', classification: 'core', owner: 'lean-core' },
  { module: 'AuditModule', importPath: './audit/audit.module', classification: 'core', owner: 'lean-core' },
  { module: 'AuthModule', importPath: './auth/auth.module', classification: 'core', owner: 'lean-core', note: 'Generic identity/authentication only; domain-profile behavior has an accepted split plan.' },
  { module: 'BackupModule', importPath: './backup/backup.module', classification: 'core', owner: 'lean-core' },
  { module: 'HealthModule', importPath: './health/health.module', classification: 'core', owner: 'lean-core' },
  { module: 'InstallationModule', importPath: './installation/installation.module', classification: 'core', owner: 'lean-core' },
  { module: 'PluginsModule', importPath: './plugins/plugins.module', classification: 'core', owner: 'lean-core' },
  { module: 'UpdatesModule', importPath: './updates/updates.module', classification: 'core', owner: 'lean-core' },
  { module: 'MarketplaceModule', importPath: './marketplace/marketplace.module', classification: 'core', owner: 'lean-core' },
  { module: 'ObservabilityModule', importPath: './observability/observability.module', classification: 'core', owner: 'lean-core' },
  { module: 'DataExportModule', importPath: './data-export/data-export.module', classification: 'business', owner: 'legacy:data-export', note: 'Legacy student/attendance/grade CSV routes; core recovery uses the schema-neutral backup service.' },
  { module: 'SiteSettingsModule', importPath: './site-settings/site-settings.module', classification: 'core', owner: 'lean-core' },

  { module: 'NotificationModule', importPath: './notification/notification.module', classification: 'shared', owner: 'lean-core', note: 'Core delivery capability used by plugins.' },
  { module: 'NotificationPreferenceModule', importPath: './notification-preference/notification-preference.module', classification: 'shared', owner: 'lean-core', note: 'Core inbox preferences and digest composition contract.' },

  { module: 'AnnouncementsModule', importPath: './announcements/announcements.module', classification: 'proxy', owner: 'wattanam.announcements', note: 'Legacy URL compatibility proxy for the extracted official plugin.' },

] as const;

export function rootModulesByClassification(classification: RootModuleClassification) {
  return ROOT_MODULE_REGISTRY.filter((entry) => entry.classification === classification);
}

export function rootModuleNamesForDistribution(distribution: 'core' | 'legacy-full'): string[] {
  return ROOT_MODULE_REGISTRY
    .filter((entry) => distribution === 'legacy-full' || entry.classification === 'core' || entry.classification === 'shared')
    .map((entry) => entry.module);
}
