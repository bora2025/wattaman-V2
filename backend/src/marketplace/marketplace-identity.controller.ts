import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { EntitlementCacheService } from './entitlement-cache.service';
import { readEntitlementConfig } from './entitlement-config';
import { InstallationRegistrationService } from './installation-registration.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN')
@Controller('admin/marketplace')
export class MarketplaceIdentityController {
  constructor(private readonly registration: InstallationRegistrationService, private readonly entitlements: EntitlementCacheService) {}

  @Get('installation')
  async status() {
    return { ...(await this.registration.status()), entitlementKeysConfigured: !!readEntitlementConfig() };
  }

  @Post('installation/register')
  register(@Body() body: { accountId?: string; label?: string }) { return this.registration.register(String(body?.accountId || ''), body?.label); }

  @Post('installation/keys/rotate')
  rotateKey() { return this.registration.rotateKey(); }

  @Get('entitlements')
  entitlementStatuses() { return this.entitlements.getAllStatuses(); }

  @Post('entitlements/refresh')
  refreshEntitlements() { return this.entitlements.refreshAll(); }

  @Post('entitlements/:pluginId/refresh')
  refreshEntitlement(@Param('pluginId') pluginId: string) { return this.entitlements.refreshOne(pluginId); }

  @Get('entitlements/:pluginId/export')
  exportEntitlement(@Param('pluginId') pluginId: string) { return this.entitlements.exportOne(pluginId); }

  @Post('entitlements/:pluginId/import')
  importEntitlement(@Param('pluginId') pluginId: string, @Body() body: { signedToken?: unknown }) {
    return this.entitlements.importOne(pluginId, body?.signedToken);
  }
}
