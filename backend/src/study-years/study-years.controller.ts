import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { StudyYearsService } from './study-years.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('study-years')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StudyYearsController {
  constructor(private studyYearsService: StudyYearsService) {}

  @Get()
  async getAll() {
    return this.studyYearsService.getAll();
  }

  @Get('current')
  async getCurrent() {
    return this.studyYearsService.getCurrent();
  }

  @Roles('ADMIN')
  @Post()
  async create(@Body() data: { year: number; label?: string; startDate?: string; endDate?: string; schoolName?: string; logoUrl?: string }) {
    return this.studyYearsService.create(data);
  }

  @Roles('ADMIN')
  @Put(':id')
  async update(@Param('id') id: string, @Body() data: { year?: number; label?: string; startDate?: string; endDate?: string; schoolName?: string; logoUrl?: string | null }) {
    return this.studyYearsService.update(id, data);
  }

  @Roles('ADMIN')
  @Post(':id/set-current')
  async setCurrent(@Param('id') id: string) {
    return this.studyYearsService.setCurrent(id);
  }

  @Roles('ADMIN')
  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.studyYearsService.delete(id);
  }
}
