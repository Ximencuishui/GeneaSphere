import type { Request, Response, NextFunction } from 'express';

/**
 * 安全响应头中间件（Express 风格纯函数中间件）
 *
 * 不依赖 helmet 等三方包，直接通过 res.setHeader 设置常见的安全头。
 * 对前端 API / 静态资源均生效，对 SSE / 长连接等流式接口无副作用。
 *
 * 通过环境变量控制：
 *   SECURITY_HEADERS_DISABLED=1   整体禁用
 *   HSTS_DISABLED=1               关闭 HSTS（仅在非 HTTPS 环境使用）
 */
export interface SecurityHeadersOptions {
  enabled?: boolean;
  hstsEnabled?: boolean;
  /** 自定义 CSP；留空使用默认（API 场景） */
  contentSecurityPolicy?: string;
}

const DEFAULT_CSP = "default-src 'none'; frame-ancestors 'none'";

export function securityHeaders(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const enabled = process.env.SECURITY_HEADERS_DISABLED !== '1';
  if (!enabled) return next();

  // 防止 MIME 嗅探
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // 防止点击劫持
  res.setHeader('X-Frame-Options', 'DENY');
  // 基础 XSS 防护（旧浏览器，主流浏览器已通过 CSP 处理）
  res.setHeader('X-XSS-Protection', '1; mode=block');
  // 控制 referrer 泄露
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // 限制浏览器特性（API 不需要摄像头/麦克风等）
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=()',
  );
  // 强制 HTTPS（仅在 HTTPS 环境使用，避免开发环境报错）
  if (process.env.HSTS_DISABLED !== '1') {
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=15552000; includeSubDomains',
    );
  }
  // 缓解 XSS：API 接口不返回 HTML，设为 default-src 'none' 即可
  if (process.env.CSP_REPORT_ONLY === '1') {
    res.setHeader('Content-Security-Policy-Report-Only', DEFAULT_CSP);
  } else {
    res.setHeader('Content-Security-Policy', DEFAULT_CSP);
  }

  next();
}
