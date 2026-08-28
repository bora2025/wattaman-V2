import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { NotificationModule } from '../notification/notification.module';
import { ParentModule } from '../parent/parent.module';
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

@Module({
  imports: [DatabaseModule, NotificationModule, ParentModule, DirectoryModule],
  controllers: [PluginsController, PluginApiController],
  providers: [PluginPackageVerifier, PluginEventBus, PluginPermissionsService, PluginExtensionsService, PluginJobsService, PluginSettingsService, PluginStorageService, PluginMigrationsService, PluginRealtimeService, PluginRuntimeService, PluginsService],
  exports: [PluginsService, PluginEventBus, PluginExtensionsService, PluginPermissionsService],
})
export class PluginsModule {}
