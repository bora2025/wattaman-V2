import { BadRequestException, Body, Controller, Delete, Get, Param, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PluginsService } from './plugins.service';
import { PluginPermissionsService } from './plugin-permissions.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN')
@Controller('plugins')
export class PluginsController {
  constructor(
    private readonly plugins: PluginsService,
    private readonly grants: PluginPermissionsService,
  ) {}

  @Get()
  list() {
    return this.plugins.list();
  }

  @Get('runtime-status')
  runtimeStatus() { return this.plugins.runtimeStatus(); }

  @Post('inspect')
  @UseInterceptors(FileInterceptor('package', { limits: { fileSize: Number(process.env.PLUGIN_MAX_PACKAGE_BYTES || 50 * 1024 * 1024), files: 1 } }))
  inspect(@UploadedFile() file?: Express.Multer.File) {
    if (!file?.buffer || !file.originalname.endsWith('.wtp')) throw new BadRequestException('A .wtp plugin package is required');
    return this.plugins.inspect(file.buffer);
  }

  @Post('install')
  @UseInterceptors(FileInterceptor('package', {
    limits: { fileSize: Number(process.env.PLUGIN_MAX_PACKAGE_BYTES || 50 * 1024 * 1024), files: 1 },
  }))
  install(@UploadedFile() file?: Express.Multer.File, @Body('confirmationSha256') confirmationSha256?: string) {
    if (!file?.buffer) throw new BadRequestException('A .wtp plugin package is required');
    if (!file.originalname.endsWith('.wtp')) throw new BadRequestException('Plugin package must use the .wtp extension');
    if (!/^[a-f0-9]{64}$/.test(confirmationSha256 || '')) throw new BadRequestException('Inspect the package and provide its confirmationSha256 before installation');
    return this.plugins.install(file.buffer, confirmationSha256);
  }

  @Post(':id/activate')
  activate(@Param('id') id: string) {
    return this.plugins.activate(id);
  }

  @Post(':id/deactivate')
  deactivate(@Param('id') id: string) {
    return this.plugins.deactivate(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) { return this.plugins.remove(id); }

  @Get(':id/permission-grants')
  listPermissionGrants(@Param('id') id: string) { return this.grants.list(id); }

  @Post(':id/permission-grants')
  grantPermission(@Param('id') id: string, @Body('permissionId') permissionId: string, @Body('role') role: string) {
    if (!permissionId || !role) throw new BadRequestException('permissionId and role are required');
    return this.grants.grant(id, permissionId, role);
  }

  @Delete(':id/permission-grants/:permissionId/:role')
  revokePermission(@Param('id') id: string, @Param('permissionId') permissionId: string, @Param('role') role: string) {
    return this.grants.revoke(id, permissionId, role);
  }
}
