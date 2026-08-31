import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { EntitlementCacheService } from './entitlement-cache.service';
import { InstallationKeyService } from './installation-key.service';
import { InstallationRegistrationService } from './installation-registration.service';
import { MarketplaceIdentityController } from './marketplace-identity.controller';
import { MarketplaceLinkService } from './marketplace-link.service';
import { MarketplaceLinkTokenStore } from './marketplace-link-token.store';

@Module({
  imports: [DatabaseModule],
  controllers: [MarketplaceIdentityController],
  providers: [InstallationKeyService, InstallationRegistrationService, EntitlementCacheService, MarketplaceLinkService, MarketplaceLinkTokenStore],
  exports: [InstallationKeyService, InstallationRegistrationService, EntitlementCacheService, MarketplaceLinkService, MarketplaceLinkTokenStore],
})
export class MarketplaceModule {}
