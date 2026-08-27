import { Module } from '@nestjs/common';
import { StudyYearsController } from './study-years.controller';
import { StudyYearsService } from './study-years.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [StudyYearsController],
  providers: [StudyYearsService],
})
export class StudyYearsModule {}
