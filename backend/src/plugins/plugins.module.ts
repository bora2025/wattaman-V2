import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
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

@Module({
  imports: [DatabaseModule],
  controllers: [PluginsController, PluginApiController],
  providers: [PluginPackageVerifier, PluginEventBus, PluginExtensionsService, PluginJobsService, PluginSettingsService, PluginStorageService, PluginMigrationsService, PluginRuntimeService, PluginsService],
  exports: [PluginsService, PluginEventBus, PluginExtensionsService],
})
export class PluginsModule {}
