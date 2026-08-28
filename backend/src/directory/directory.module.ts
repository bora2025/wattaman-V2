import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { DirectoryService } from './directory.service';

@Module({
  imports: [DatabaseModule],
  providers: [DirectoryService],
  exports: [DirectoryService],
})
export class DirectoryModule {}
