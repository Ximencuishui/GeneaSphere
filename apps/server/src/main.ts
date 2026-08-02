import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { PrismaService } from '@geneasphere/db';
import type { Request, Response, NextFunction } from 'express';
import { AppModule } from './app.module';
import { GlobalHttpExceptionFilter } from './common/global-http-exception.filter';
import { AlertService } from './common/alert.service';
import { securityHeaders } from './common/security-headers.middleware';
import {
  createBusinessMetricsRefresher,
  MetricsMiddleware,
  MetricsRegistry,
} from './common/metrics';

const FORBIDDEN_JWT_SECRETS = new Set([
  'geneasphere-jwt-secret-key-2026',
  'geneasphere',
  'change-me',
  'secret',
]);

function validateProductionSecurityConfig() {
  if (process.env.NODE_ENV !== 'production') return;

  const jwtSecret = process.env.JWT_SECRET || '';
  if (
    Buffer.byteLength(jwtSecret, 'utf8') < 32 ||
    FORBIDDEN_JWT_SECRETS.has(jwtSecret.toLowerCase())
  ) {
    throw new Error(
      '生产环境 JWT_SECRET 必须是至少 32 字节的随机字符串，且不能使用默认值',
    );
  }
}

function getCorsAllowedOrigins(): string[] {
  const configured = process.env.CORS_ALLOWED_ORIGINS;
  return (configured || 'https://xungenlu.cn,https://www.xungenlu.cn')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

async function bootstrap() {
  // 在初始化 Nest 模块和数据库连接前拒绝不安全的生产配置。
  validateProductionSecurityConfig();

  const app = await NestFactory.create(AppModule, {
    // 日志格式：时间戳 + 级别 + 上下文 + 消息
    logger: ['error', 'warn', 'log'],
  });

  const allowedOrigins = new Set(getCorsAllowedOrigins());
  app.enableCors({
    credentials: true,
    origin: (origin, callback) => {
      // 无 Origin 的同源请求、健康检查和服务间调用不属于浏览器跨域。
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
  });

  const metrics = new MetricsRegistry();
  const metricsMiddleware = new MetricsMiddleware(metrics);
  app.use(metricsMiddleware.httpTimer());
  app.use(
    '/metrics',
    (req: Request, res: Response, next: NextFunction) => {
      if (req.method !== 'GET') {
        next();
        return;
      }
      void metricsMiddleware.metricsHandler(req, res);
    },
  );

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
  app.useGlobalFilters(new GlobalHttpExceptionFilter(app.get(AlertService)));

  const metricsRefresher = createBusinessMetricsRefresher(
    metrics,
    app.get(PrismaService),
  );
  metricsRefresher.start();

  const port = Number(process.env.PORT) || 3101;
  try {
    await app.listen(port);
  } catch (error) {
    metricsRefresher.stop();
    throw error;
  }
  Logger.log(`寻根路后端启动于 http://localhost:${port}`, 'Bootstrap');
}
void bootstrap();
