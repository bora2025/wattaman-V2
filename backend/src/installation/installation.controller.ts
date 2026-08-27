import { Body, Controller, Get, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { InstallDto } from './dto/install.dto';
import { InstallationService } from './installation.service';

@Controller('installation')
export class InstallationController {
  constructor(private readonly installationService: InstallationService) {}

  @Get('status')
  status() {
    return this.installationService.status();
  }

  @Throttle({ default: { ttl: 60 * 60 * 1000, limit: 3 } })
  @Post('install')
  install(@Body() dto: InstallDto) {
    return this.installationService.install(dto);
  }
}

