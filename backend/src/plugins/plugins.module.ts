import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { NotificationModule } from '../notification/notification.module';
import { DirectoryModule } from '../directory/directory.module';
import { PluginPackageVerifier } from './plugin-package';
import { PluginsController } from './plugins.controller';
import { PluginsService } from './plugins.service';
import { PluginEventBus } from './plugin-events';
import { PluginRuntimeService } from './plugin-runtime.service';
import { PluginExtensionsService } from './plugin-extensions.service';
import { PluginApiController } from './plugin-api.controller';
import { PluginJobsService } from './plugin-jobs.service';
import { PluginSettingsService } from './plugin-settings.service';
import { PluginStorageService } from './plugin-storage.service';
import { PluginMigrationsService } from './plugin-migrations.service';
import { PluginPermissionsService } from './plugin-permissions.service';
import { PluginRealtimeService } from './plugin-realtime.service';
import { PluginRealtimeGateway } from './plugin-realtime.gateway';
import { PluginNotificationQuotaService } from './plugin-notification-quota.service';
import { StorageModule } from '../storage/storage.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [DatabaseModule, NotificationModule, AuthModule, DirectoryModule, StorageModule],
  controllers: [PluginsController, PluginApiController],
  providers: [PluginPackageVerifier, PluginEventBus, PluginPermissionsService, PluginExtensionsService, PluginJobsService, PluginSettingsService, PluginStorageService, PluginMigrationsService, PluginRealtimeGateway, PluginRealtimeService, PluginNotificationQuotaService, PluginRuntimeService, PluginsService],
  exports: [PluginsService, PluginEventBus, PluginExtensionsService, PluginPermissionsService],
})
export class PluginsModule {}
