import { All, Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PluginExtensionsService } from './plugin-extensions.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('plugin-api')
export class PluginApiController {
  constructor(private readonly extensions: PluginExtensionsService) {}

  @Get('extensions')
  @Roles('SUPER_ADMIN')
  listExtensions() { return this.extensions.list(); }

  // No @Roles() here: any authenticated user may reach dispatch. Authorization
  // for the specific plugin route happens inside PluginExtensionsService.dispatch(),
  // which checks the route's declared permission against PluginPermissionsService grants.
  @All(':pluginId/*')
  dispatch(@Param('pluginId') pluginId: string, @Req() request: Request & { user?: any }) {
    return this.extensions.dispatch(pluginId, {
      method: request.method as any,
      path: String(request.params[0] || ''),
      params: {},
      query: request.query as any,
      body: request.body,
      principal: { userId: request.user?.userId, role: request.user?.role, email: request.user?.email },
    });
  }
}
