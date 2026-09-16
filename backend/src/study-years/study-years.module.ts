import { Module } from '@nestjs/common';
import { StudyYearsController } from './study-years.controller';
import { StudyYearsService } from './study-years.service';
import { DatabaseModule } from '../database/database.module';
import { ACADEMIC_STUDY_YEARS_PROVIDER } from './academic-study-years.contract';
import { PrismaAcademicStudyYearsProvider } from './academic-study-years.provider';

@Module({
  imports: [DatabaseModule],
  controllers: [StudyYearsController],
  providers: [StudyYearsService, PrismaAcademicStudyYearsProvider,
    { provide: ACADEMIC_STUDY_YEARS_PROVIDER, useExisting: PrismaAcademicStudyYearsProvider }],
})
export class StudyYearsModule {}
