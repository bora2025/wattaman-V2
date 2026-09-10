import { Controller, Get, Post, Request, UseGuards } from '@nestjs/common';
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
  @Get('unread-count') unreadCount(@Request() req: any) { return this.control.unreadCount(req.user.userId); }
  @Post('mark-read') markRead(@Request() req: any) { return this.control.markRead(req.user.userId); }
}
