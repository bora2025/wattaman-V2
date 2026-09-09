import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SchoolBillingControlService } from './school-billing-control.service';

@Controller('admin/marketplace/billing-control')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'SUPER_ADMIN')
export class SchoolBillingControlController {
  constructor(private readonly control: SchoolBillingControlService) {}
  @Get() status() { return this.control.status(); }
  @Post('sync') sync() { return this.control.sync(); }
}
