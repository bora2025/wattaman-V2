import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { EntitlementCacheService } from './entitlement-cache.service';
import { InstallationKeyService } from './installation-key.service';
import { InstallationRegistrationService } from './installation-registration.service';
import { MarketplaceIdentityController } from './marketplace-identity.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [MarketplaceIdentityController],
  providers: [InstallationKeyService, InstallationRegistrationService, EntitlementCacheService],
  exports: [InstallationKeyService, InstallationRegistrationService, EntitlementCacheService],
})
export class MarketplaceModule {}
