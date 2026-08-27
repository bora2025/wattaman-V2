import { Module } from '@nestjs/common';
import { ClassRegistrationsController } from './class-registrations.controller';
import { ClassRegistrationsService } from './class-registrations.service';
import { DatabaseModule } from '../database/database.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [DatabaseModule, NotificationModule],
  controllers: [ClassRegistrationsController],
  providers: [ClassRegistrationsService],
})
export class ClassRegistrationsModule {}
