import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from '@geneasphere/db';
import { PlatformAuthService } from './platform-auth.service';
import { PlatformAuthController } from './platform-auth.controller';
import { PlatformJwtStrategy } from './platform-jwt.strategy';
import { PlatformAuthGuard } from './platform-auth.guard';
import { PlatformOperationLogService } from '../common/platform-operation-log.service';
import { LoginLockService } from '../../common/login-lock.service';

@Module({
  imports: [
    PrismaModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret:
          configService.get<string>('JWT_PLATFORM_SECRET') ||
          'geneasphere-platform-secret-2026',
        signOptions: { expiresIn: '8h' },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [PlatformAuthController],
  providers: [
    PlatformAuthService,
    PlatformJwtStrategy,
    PlatformAuthGuard,
    PlatformOperationLogService,
    LoginLockService,
  ],
  exports: [
    PlatformAuthService,
    PlatformAuthGuard,
    PlatformJwtStrategy,
    PlatformOperationLogService,
    LoginLockService,
  ],
})
export class PlatformAuthModule {}
