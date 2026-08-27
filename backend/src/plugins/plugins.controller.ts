import { BadRequestException, Body, Controller, Delete, Get, Param, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PluginsService } from './plugins.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN')
@Controller('plugins')
export class PluginsController {
  constructor(private readonly plugins: PluginsService) {}

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
}
