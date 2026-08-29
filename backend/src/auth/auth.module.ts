import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { DatabaseModule } from '../database/database.module';
import { getJwtKeyId, getJwtSecret } from '../config/environment';

@Module({
  imports: [
    DatabaseModule,
    PassportModule,
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: getJwtSecret(),
        // keyid tags every issued token's header with the active signing key's id, so a
        // verifier can support JWT_SECRET rotation with an overlap window (see
        // src/auth/jwt-verification.ts) instead of a hard, all-sessions-drop cutover.
        signOptions: { expiresIn: '8h', keyid: getJwtKeyId() },
      }),
    }),
  ],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
  exports: [JwtModule],
})
export class AuthModule {}
