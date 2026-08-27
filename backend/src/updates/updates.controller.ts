import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UpdatesService } from './updates.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN')
@Controller('updates')
export class UpdatesController {
  constructor(private readonly updates: UpdatesService) {}

  @Get()
  check() { return this.updates.check(); }

  @Post('plugins/:pluginId/:version/install')
  installPlugin(@Param('pluginId') pluginId: string, @Param('version') version: string) {
    return this.updates.installPlugin(pluginId, version);
  }
}
