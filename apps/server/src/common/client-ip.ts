import { AsyncLocalStorage } from 'async_hooks';

const requestIps = new AsyncLocalStorage<{ ip?: string }>();

/** 把当前请求的客户端地址放进后续异步调用，供审计日志读取。 */
export function runWithClientIp(ip: string | undefined, next: () => void) {
  requestIps.run({ ip }, next);
}

export function currentClientIp(): string | undefined {
  return requestIps.getStore()?.ip;
}

/** 优先取反向代理转发的客户端地址，否则用连接地址。 */
export function clientIp(req?: { headers?: Record<string, unknown>; ip?: string }): string | undefined {
  const forwarded = req?.headers?.['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (typeof raw === 'string' && raw.trim()) {
    const first = raw.split(',')[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  if (typeof req?.ip === 'string' && req.ip.trim()) return req.ip.trim().slice(0, 64);
  return undefined;
}
