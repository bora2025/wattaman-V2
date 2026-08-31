import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { PluginsModule } from '../plugins/plugins.module';
import { UpdatesModule } from '../updates/updates.module';
import { EntitlementCacheService } from './entitlement-cache.service';
import { InstallationKeyService } from './installation-key.service';
import { InstallationRegistrationService } from './installation-registration.service';
import { MarketplaceIdentityController } from './marketplace-identity.controller';
import { MarketplaceCommerceController } from './marketplace-commerce.controller';
import { MarketplaceCommerceService } from './marketplace-commerce.service';
import { MarketplaceLinkService } from './marketplace-link.service';
import { MarketplaceLinkTokenStore } from './marketplace-link-token.store';

@Module({
  imports: [DatabaseModule, PluginsModule, UpdatesModule],
  controllers: [MarketplaceIdentityController, MarketplaceCommerceController],
  providers: [InstallationKeyService, InstallationRegistrationService, EntitlementCacheService, MarketplaceLinkService, MarketplaceLinkTokenStore, MarketplaceCommerceService],
  exports: [InstallationKeyService, InstallationRegistrationService, EntitlementCacheService, MarketplaceLinkService, MarketplaceLinkTokenStore, MarketplaceCommerceService],
})
export class MarketplaceModule {}
