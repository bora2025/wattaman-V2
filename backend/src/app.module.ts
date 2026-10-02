import { DynamicModule, Module, Type } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { DatabaseModule } from './database/database.module';
import { SchoolBillingAccessGuard } from './marketplace/school-billing-access.guard';
import { SchoolAccessModule } from './marketplace/school-access.module';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { NotificationModule } from './notification/notification.module';
import { BackupModule } from './backup/backup.module';
import { AnnouncementsModule } from './announcements/announcements.module';
import { NotificationPreferenceModule } from './notification-preference/notification-preference.module';
import { AuditModule } from './audit/audit.module';
import { SiteSettingsModule } from './site-settings/site-settings.module';
import { HealthModule } from './health/health.module';
import { InstallationModule } from './installation/installation.module';
import { PluginsModule } from './plugins/plugins.module';
import { UpdatesModule } from './updates/updates.module';
import { MarketplaceModule } from './marketplace/marketplace.module';
import { ObservabilityModule } from './observability/observability.module';
import { DataExportModule } from './data-export/data-export.module';
import { Distribution, runsBackgroundJobs } from './config/environment';
import { rootModuleNamesForDistribution } from './distribution/module-registry';

const LOCAL_ROOT_MODULES: Record<string, Type<unknown>> = {
  DatabaseModule, SchoolAccessModule, AuditModule, AuthModule, BackupModule, HealthModule,
  InstallationModule, PluginsModule, UpdatesModule, MarketplaceModule, ObservabilityModule,
  DataExportModule, SiteSettingsModule, NotificationModule, NotificationPreferenceModule,
  AnnouncementsModule,
};

export function localModulesForDistribution(distribution: Distribution): Type<unknown>[] {
  return rootModuleNamesForDistribution(distribution).map((name) => {
    const module = LOCAL_ROOT_MODULES[name];
    if (!module) throw new Error(`Root module registry references an unavailable module: ${name}`);
    return module;
  });
}

@Module({})
export class AppModule {
  static register(distribution: Distribution): DynamicModule {
    return {
      module: AppModule,
      imports: [
        // Rate limiting and scheduling are framework infrastructure, not business modules.
        ThrottlerModule.forRoot([{ ttl: 60000, limit: 300 }]),
        ScheduleModule.forRoot({
          cronJobs: runsBackgroundJobs(),
          intervals: runsBackgroundJobs(),
          timeouts: runsBackgroundJobs(),
        }),
        ...localModulesForDistribution(distribution),
      ],
      controllers: [AppController],
      providers: [
        AppService,
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: APP_GUARD, useClass: SchoolBillingAccessGuard },
      ],
    };
  }
}
