import { Controller, Get, Post, Put, Patch, Body, Query, Param, Delete, UseInterceptors, UploadedFile, BadRequestException, UseGuards, Request } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ClassesService } from './classes.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('classes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClassesController {
  constructor(private classesService: ClassesService) {}

  @Roles('ADMIN', 'CLASS_ADMIN')
  @Post()
  async createClass(@Body() data: { name: string; subject?: string; teacherId: string; classAdminId?: string; schedule?: string; studyYearId?: string; registrationStatus?: string; thumbnail?: string; description?: string; price?: number | null; showPrice?: boolean }) {
    return this.classesService.createClass(data);
  }

  @Get()
  async getClasses(
    @Request() req: any,
    @Query('teacherId') teacherId?: string,
    @Query('studyYearId') studyYearId?: string,
  ) {
    // CLASS_ADMIN always sees only classes assigned to them
    if (req?.user?.role === 'CLASS_ADMIN') {
      return this.classesService.getClassesByAdmin(req.user.userId, studyYearId);
    }
    // Alias 'me' resolves to the current user's id (useful for teachers)
    const resolvedTeacherId = teacherId === 'me' ? req?.user?.userId : teacherId;
    return this.classesService.getClasses(resolvedTeacherId, studyYearId);
  }

  @Roles('ADMIN', 'CLASS_ADMIN')
  @Get('parents')
  async listParents() {
    return this.classesService.listParents();
  }

  @Roles('ADMIN', 'CLASS_ADMIN')
  @Put(':id')
  async updateClass(@Param('id') id: string, @Body() data: { name?: string; subject?: string; teacherId?: string; classAdminId?: string | null; schedule?: string; studyYearId?: string; registrationStatus?: string; thumbnail?: string; description?: string; price?: number | null; showPrice?: boolean }) {
    return this.classesService.updateClass(id, data);
  }

  @Get(':id/students')
  async getStudentsInClass(@Param('id') classId: string) {
    return this.classesService.getStudentsInClass(classId);
  }

  /**
   * Batch endpoint: fetch students for many classes in one round-trip.
   * Query: ?ids=classId1,classId2,...
   * Returns: { [classId]: Student[] }
   */
  @Get('students/batch')
  async getStudentsByClasses(@Query('ids') ids?: string) {
    const classIds = (ids || '').split(',').map(s => s.trim()).filter(Boolean);
    return this.classesService.getStudentsByClasses(classIds);
  }

  @Roles('ADMIN', 'CLASS_ADMIN', 'TEACHER')
  @Patch(':classId/students/:studentId')
  async updateStudent(
    @Param('classId') classId: string,
    @Param('studentId') studentId: string,
    @Body() data: { name?: string; nameKh?: string; sex?: string; phone?: string; photo?: string; dateOfBirth?: string; address?: string; generation?: string; studentNumber?: string; parentId?: string | null; customFieldValues?: Record<string, string> },
  ) {
    return this.classesService.updateStudent(studentId, data);
  }

  @Roles('ADMIN', 'CLASS_ADMIN')
  @Post(':id/students')
  async addStudentToClass(@Param('id') classId: string, @Body() data: { studentId: string }) {
    return this.classesService.addStudentToClass(classId, data.studentId);
  }

  @Roles('ADMIN', 'CLASS_ADMIN')
  @Post(':id/students/bulk-csv')
  @UseInterceptors(FileInterceptor('file'))
  async bulkAddStudentsFromCsv(@Param('id') classId: string, @UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('CSV file is required');
    }
    return this.classesService.bulkAddStudentsFromCsv(classId, file.buffer);
  }

  @Roles('ADMIN', 'CLASS_ADMIN')
  @Delete(':id')
  async deleteClass(@Param('id') id: string) {
    return this.classesService.deleteClass(id);
  }

  @Roles('ADMIN', 'CLASS_ADMIN')
  @Post('cleanup-orphaned-students')
  async cleanupOrphanedStudents() {
    return this.classesService.cleanupOrphanedStudents();
  }

  @Roles('ADMIN', 'CLASS_ADMIN')
  @Delete(':id/students/:studentId')
  async removeStudentFromClass(@Param('id') classId: string, @Param('studentId') studentId: string) {
    return this.classesService.removeStudentFromClass(classId, studentId);
  }

  @Get(':id/available-students')
  async getAvailableStudents(@Param('id') classId: string) {
    return this.classesService.getAvailableStudents(classId);
  }
}