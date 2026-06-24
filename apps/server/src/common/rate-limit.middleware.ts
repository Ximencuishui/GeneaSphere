import { Injectable, NestMiddleware, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';

/**
 * 进程内简易限流中间件
 *
 * 用法（注意中间件顺序）：
 * ```ts
 * export class AuthModule implements NestModule {
 *   configure(consumer: MiddlewareConsumer) {
 *     consumer.apply(RateLimitMiddleware).forRoutes('auth/login', 'auth/register');
 *   }
 * }
 * ```
 *
 * 适用场景：
 *   - 登录 / 注册 / 短信发送等敏感端点
 *   - 不需要分布式协调的中小流量场景
 *
 * 不适用：
 *   - 多实例部署时建议引入 Redis（如 @nestjs/throttler + redis store）以共享计数
 *
 * 通过环境变量配置：
 *   RATE_LIMIT_WINDOW_MS    滑动窗口毫秒数（默认 60000）
 *   RATE_LIMIT_MAX          窗口内最大请求数（默认 30）
 */

interface Bucket {
  count: number;
  windowStart: number;
}

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private readonly logger = new Logger(RateLimitMiddleware.name);
  private readonly buckets = new Map<string, Bucket>();
  private readonly windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);
  private readonly max = parseInt(process.env.RATE_LIMIT_MAX || '30', 10);

  use(req: Request, res: Response, next: NextFunction): void {
    const key = this.buildKey(req);
    const now = Date.now();
    const bucket = this.buckets.get(key);

    if (!bucket || now - bucket.windowStart >= this.windowMs) {
      this.buckets.set(key, { count: 1, windowStart: now });
      this.setHeaders(res, 1, this.max);
      return next();
    }

    if (bucket.count >= this.max) {
      const retryAfterSec = Math.ceil((bucket.windowStart + this.windowMs - now) / 1000);
      this.logger.warn(`限流触发：${key}（${bucket.count}/${this.max}）`);
      this.setHeaders(res, bucket.count, this.max, retryAfterSec);
      // 内存清理（避免无限增长）
      if (this.buckets.size > 10000) this.evict(now);
      throw new HttpException(
        {
          status: HttpStatus.TOO_MANY_REQUESTS,
          code: 'TOO_MANY_REQUESTS',
          message: `请求过于频繁，请 ${retryAfterSec} 秒后再试`,
          retry_after: retryAfterSec,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    bucket.count += 1;
    this.setHeaders(res, bucket.count, this.max);
    next();
  }

  /**
   * 用 IP + path 作为桶键。
   * 真实部署可结合用户 ID / API Key 等多维度。
   */
  private buildKey(req: Request): string {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket?.remoteAddress ||
      'unknown';
    return `${ip}:${req.method}:${req.path}`;
  }

  private setHeaders(
    res: Response,
    used: number,
    limit: number,
    retryAfter?: number,
  ): void {
    res.setHeader('X-RateLimit-Limit', String(limit));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, limit - used)));
    if (retryAfter !== undefined) {
      res.setHeader('Retry-After', String(retryAfter));
    }
  }

  /**
   * 清理过期桶，避免长期运行内存泄漏。
   */
  private evict(now: number): void {
    for (const [k, b] of this.buckets) {
      if (now - b.windowStart >= this.windowMs) {
        this.buckets.delete(k);
      }
    }
  }
}
