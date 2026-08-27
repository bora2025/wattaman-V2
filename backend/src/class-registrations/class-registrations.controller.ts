import { Controller, Get, Post, Patch, Delete, Body, Query, Param, UseGuards, Request, BadRequestException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ClassRegistrationsService } from './class-registrations.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('class-registrations')
export class ClassRegistrationsController {
  constructor(private svc: ClassRegistrationsService) {}

  // ─── Public — no auth required ─────────────────────────────────────────
  @Get('public/classes')
  listPublicClasses() {
    return this.svc.listPublicClasses();
  }

  @Get('public/form-config')
  getFormConfig() {
    return this.svc.getFormConfig();
  }

  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post('public')
  async submit(
    @Body()
    body: {
      classId: string;
      nameKh?: string;
      nameEn: string;
      email?: string;
      phone?: string;
      password?: string;
      photo?: string;
      sex?: string;
      dateOfBirth?: string;
      address?: string;
      generation?: string;
      customFieldValues?: Record<string, string | string[]>;
    },
  ) {
    return this.svc.createRegistration(body);
  }

  // ─── Admin: form settings & custom fields ───────────────────────────────
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get('settings')
  getSettings() {
    return this.svc.getSettings();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Patch('settings')
  updateSettings(
    @Body()
    body: {
      khmerNameMode?: string;
      phoneMode?: string;
      emailMode?: string;
      photoMode?: string;
      passwordMode?: string;
      sexMode?: string;
      dateOfBirthMode?: string;
      addressMode?: string;
      generationMode?: string;
    },
  ) {
    return this.svc.updateSettings(body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get('fields')
  listFields() {
    return this.svc.listFields();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post('fields')
  createField(@Body() body: { label: string; required?: boolean; fieldType?: string; options?: string[] }) {
    return this.svc.createField(body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Patch('fields/reorder')
  reorderFields(@Body() body: { ids: string[] }) {
    return this.svc.reorderFields(body?.ids);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Patch('fields/:id')
  updateField(@Param('id') id: string, @Body() body: { label?: string; required?: boolean; enabled?: boolean; fieldType?: string; options?: string[] }) {
    return this.svc.updateField(id, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Delete('fields/:id')
  deleteField(@Param('id') id: string) {
    return this.svc.deleteField(id);
  }

  // ─── Admin: list & resolve ──────────────────────────────────────────────
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'CLASS_ADMIN')
  @Get('unread-count')
  async unreadCount(@Request() req: any) {
    return this.svc.countPending(req.user?.role, req.user?.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'CLASS_ADMIN')
  @Get()
  async list(@Request() req: any, @Query('status') status?: string) {
    return this.svc.listRegistrations(status, req.user?.role, req.user?.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'CLASS_ADMIN')
  @Patch(':id')
  async resolve(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { action: 'APPROVE' | 'REJECT'; rejectReason?: string },
  ) {
    if (body?.action !== 'APPROVE' && body?.action !== 'REJECT') {
      throw new BadRequestException('action must be APPROVE or REJECT');
    }
    return this.svc.resolveRegistration(req.user.userId, id, body);
  }
}
