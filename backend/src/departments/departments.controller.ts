import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, HttpException, HttpStatus } from '@nestjs/common';
import { DepartmentsService } from './departments.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('departments')
export class DepartmentsController {
  constructor(private departmentsService: DepartmentsService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async findAll() {
    return this.departmentsService.findAll();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post()
  async create(@Body() body: { name: string; nameKh?: string; description?: string }) {
    try {
      return await this.departmentsService.create(body);
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new HttpException('Department name already exists', HttpStatus.BAD_REQUEST);
      }
      throw error;
    }
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Put(':id')
  async update(@Param('id') id: string, @Body() body: { name?: string; nameKh?: string; description?: string }) {
    try {
      return await this.departmentsService.update(id, body);
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new HttpException('Department name already exists', HttpStatus.BAD_REQUEST);
      }
      throw error;
    }
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.departmentsService.delete(id);
  }
}
