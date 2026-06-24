import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * 统一错误响应格式
 */
export interface ApiErrorBody {
  status: number;
  code: string;
  message: string;
  path: string;
  timestamp: string;
  details?: unknown;
}

/**
 * 全局 HTTP 异常过滤器
 *
 * 统一后端错误响应格式为：
 * {
 *   "status": 400,
 *   "code": "BAD_REQUEST",
 *   "message": "请填写驳回理由",
 *   "path": "/api/platform/families/1/reject",
 *   "timestamp": "2026-06-23T15:30:00.000Z",
 *   "details": <可选，附加字段>
 * }
 *
 * 异常 → 状态码映射：
 *   - BadRequestException       → 400
 *   - UnauthorizedException     → 401
 *   - ForbiddenException        → 403
 *   - NotFoundException         → 404
 *   - ConflictException         → 409
 *   - UnprocessableEntityException → 422
 *   - 其他 HttpException         → 取 exception.getStatus()
 *   - 其他 Error                → 500（不暴露内部细节）
 */
@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalHttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = '服务器内部错误';
    let details: unknown = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = this.statusToCode(status);
      const resp = exception.getResponse();
      if (typeof resp === 'string') {
        message = resp;
      } else if (resp && typeof resp === 'object') {
        const obj = resp as { message?: unknown; error?: unknown };
        if (typeof obj.message === 'string') {
          message = obj.message;
        } else if (Array.isArray(obj.message)) {
          // class-validator 错误：取首条作为 message，保留全量到 details
          message = obj.message.join('; ');
          details = obj.message;
        } else if (obj.error) {
          message = String(obj.error);
        }
      }
    } else if (exception instanceof Error) {
      this.logger.error(`未捕获异常: ${exception.message}`, exception.stack);
      // 生产环境：保持通用 message；开发环境：附带真实 message
      message = process.env.NODE_ENV === 'production' ? '服务器内部错误' : exception.message;
    }

    const body: ApiErrorBody = {
      status,
      code,
      message,
      path: req?.url || '',
      timestamp: new Date().toISOString(),
      ...(details !== undefined ? { details } : {}),
    };

    // 4xx 警告，5xx 错误
    if (status >= 500) {
      this.logger.error(`${req?.method} ${req?.url} → ${status} ${message}`);
    } else if (status >= 400) {
      this.logger.warn(`${req?.method} ${req?.url} → ${status} ${message}`);
    }

    res.status(status).json(body);
  }

  private statusToCode(status: number): string {
    const map: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      410: 'GONE',
      422: 'UNPROCESSABLE_ENTITY',
      429: 'TOO_MANY_REQUESTS',
      500: 'INTERNAL_ERROR',
      502: 'BAD_GATEWAY',
      503: 'SERVICE_UNAVAILABLE',
      504: 'GATEWAY_TIMEOUT',
    };
    return map[status] || `HTTP_${status}`;
  }
}
