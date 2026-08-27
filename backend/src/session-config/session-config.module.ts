import { Module } from '@nestjs/common';
import { SessionConfigController } from './session-config.controller';
import { SessionConfigService } from './session-config.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [SessionConfigController],
  providers: [SessionConfigService],
  exports: [SessionConfigService],
})
export class SessionConfigModule {}
