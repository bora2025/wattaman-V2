import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import {
  AnnouncementsService,
  CreateAnnouncementDto,
} from './announcements.service';

@Controller('announcements')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AnnouncementsController {
  constructor(private svc: AnnouncementsService) {}

  // Admin sees all (for moderation / audit)
  @Roles('ADMIN')
  @Get('all')
  listAll() {
    return this.svc.listAll();
  }

  // Personal feed for any authenticated user
  @Roles('ADMIN', 'TEACHER', 'STUDENT', 'PARENT')
  @Get('feed')
  feed(
    @Request() req: any,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    const takeNum = take ? parseInt(take, 10) : 100;
    const skipNum = skip ? parseInt(skip, 10) : 0;
    return this.svc.listForUser(req.user.userId, isNaN(takeNum) ? 100 : takeNum, isNaN(skipNum) ? 0 : skipNum);
  }

  @Roles('ADMIN', 'TEACHER', 'STUDENT', 'PARENT')
  @Get('unread-count')
  unread(@Request() req: any) {
    return this.svc.unreadCount(req.user.userId);
  }

  @Roles('ADMIN', 'TEACHER', 'STUDENT', 'PARENT')
  @Patch(':id/read')
  markRead(@Param('id') id: string, @Request() req: any) {
    return this.svc.markRead(id, req.user.userId);
  }

  // Admin and Teacher can broadcast; teacher restricted to CLASS audience in service guard below
  @Roles('ADMIN', 'TEACHER')
  @Post()
  create(@Body() body: CreateAnnouncementDto, @Request() req: any) {
    // Teachers can only post CLASS announcements
    if (req.user.role === 'TEACHER' && body.audience !== 'CLASS') {
      body.audience = 'CLASS';
    }
    return this.svc.create(req.user.userId, body);
  }

  @Roles('ADMIN')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }
}
