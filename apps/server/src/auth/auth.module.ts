import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { AuthService } from './auth.service'
import { SmsService } from './sms.service'
import { AuthController } from './auth.controller'
import { JwtStrategy } from './jwt.strategy'
import { JwtAuthGuard } from './jwt-auth.guard'
import { DemoSeedService } from './demo-seed.service'
import { PrismaService } from '@geneasphere/db'
import { LoginLockService } from '../common/login-lock.service'
import { RateLimitMiddleware } from '../common/rate-limit.middleware'
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
  providers: [AuthService, SmsService, JwtStrategy, JwtAuthGuard, DemoSeedService, PrismaService, LoginLockService],
  controllers: [AuthController],
  exports: [JwtAuthGuard, SmsService, LoginLockService],
})
export class AuthModule implements NestModule {
  /**
   * 对登录/注册/演示登录/短信发送等敏感端点启用 API 限流。
   * 默认 60 秒内最多 30 次（可通过 RATE_LIMIT_WINDOW_MS / RATE_LIMIT_MAX 覆盖）。
   */
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RateLimitMiddleware)
      .forRoutes(
        'auth/login',
        'auth/register',
        'auth/demo-login',
        'auth/demo-member-login',
      )
  }
}
