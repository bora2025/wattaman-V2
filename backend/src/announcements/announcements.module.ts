import { Module } from '@nestjs/common';
import { AnnouncementsController } from './announcements.controller';
import { AnnouncementsService } from './announcements.service';
import { DatabaseModule } from '../database/database.module';
import { NotificationModule } from '../notification/notification.module';
import { ParentModule } from '../parent/parent.module';
import { DirectoryModule } from '../directory/directory.module';

@Module({
  imports: [DatabaseModule, NotificationModule, ParentModule, DirectoryModule],
  controllers: [AnnouncementsController],
  providers: [AnnouncementsService],
})
export class AnnouncementsModule {}
