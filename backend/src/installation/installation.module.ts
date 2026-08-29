import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { InstallationController } from './installation.controller';
import { InstallationService } from './installation.service';
import { InstallationPreflightService } from './installation-preflight.service';
import { PluginPackageVerifier } from '../plugins/plugin-package';

// Deliberately provides PluginPackageVerifier directly rather than importing PluginsModule:
// PluginPackageVerifier is a self-contained, dependency-free class (no Prisma, no other
// providers), so it can validate a candidate initial plugin package without pulling in
// PluginsModule's own PluginRuntimeService -- whose onApplicationBootstrap() hook queries the
// PluginInstallation table unconditionally, which would crash install-cli.ts's standalone
// NestFactory.createApplicationContext(InstallationModule, ...) against a database that hasn't
// been migrated yet in the same invocation. Actually installing a verified package still goes
// through the existing POST /plugins/install endpoint once setup completes.
@Module({
  imports: [DatabaseModule],
  controllers: [InstallationController],
  providers: [InstallationService, InstallationPreflightService, PluginPackageVerifier],
  exports: [InstallationService, InstallationPreflightService],
})
export class InstallationModule {}

