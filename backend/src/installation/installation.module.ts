import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { InstallationController } from './installation.controller';
import { InstallationService } from './installation.service';
import { InstallationPreflightService } from './installation-preflight.service';

// Deliberately does NOT import PluginsModule: PluginsModule's own PluginRuntimeService
// runs an onApplicationBootstrap() hook that queries the PluginInstallation table
// unconditionally. Since install-cli.ts boots this module standalone via
// NestFactory.createApplicationContext(InstallationModule, ...) -- often against a
// database that hasn't been migrated yet in the same invocation -- pulling in
// PluginsModule here would crash every CLI install/dry-run against a fresh database.
// "Initial plugin selection" during setup is deferred for exactly this reason; see
// docs/completion-checklist.md's B-011 entry.
@Module({
  imports: [DatabaseModule],
  controllers: [InstallationController],
  providers: [InstallationService, InstallationPreflightService],
  exports: [InstallationService, InstallationPreflightService],
})
export class InstallationModule {}

