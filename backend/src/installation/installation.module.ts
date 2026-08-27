import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { InstallationController } from './installation.controller';
import { InstallationService } from './installation.service';

@Module({
  imports: [DatabaseModule],
  controllers: [InstallationController],
  providers: [InstallationService],
})
export class InstallationModule {}

