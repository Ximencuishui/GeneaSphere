import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { AuthService } from './auth.service'
import { SmsService } from './sms.service'
import { AuthController } from './auth.controller'
import { JwtStrategy } from './jwt.strategy'
import { JwtAuthGuard } from './jwt-auth.guard'
import { DemoSeedService } from './demo-seed.service'
import { LoginLockService } from '../common/login-lock.service'
import { RateLimitGuard } from '../common/rate-limit.middleware'
import { ClanResolverService } from '../common/clan-resolver.service'
@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('JWT_SECRET'),
        signOptions: { expiresIn: '60m' },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [AuthService, SmsService, JwtStrategy, JwtAuthGuard, DemoSeedService, LoginLockService, ClanResolverService, RateLimitGuard],
  controllers: [AuthController],
  exports: [JwtAuthGuard, SmsService, LoginLockService, ClanResolverService],
})
export class AuthModule {}
