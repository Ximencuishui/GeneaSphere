import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { GlobalHttpExceptionFilter } from './common/global-http-exception.filter';
import { securityHeaders } from './common/security-headers.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // 日志格式：时间戳 + 级别 + 上下文 + 消息
    logger: ['error', 'warn', 'log'],
  });
  // 安全响应头（最早期注册，让所有响应都带上）
  app.use(securityHeaders);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );
  // 统一错误响应：所有路由抛出的异常都经过 GlobalHttpExceptionFilter
  app.useGlobalFilters(new GlobalHttpExceptionFilter());
  await app.listen(3001);
  Logger.log('🚀 寻根路后端启动于 http://localhost:3001', 'Bootstrap');
}
bootstrap();
