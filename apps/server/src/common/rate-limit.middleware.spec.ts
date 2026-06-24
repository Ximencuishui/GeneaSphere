import { HttpException, HttpStatus } from '@nestjs/common';
import { RateLimitMiddleware } from './rate-limit.middleware';

interface MockRequest {
  headers: Record<string, string | undefined>;
  socket: { remoteAddress?: string };
  method: string;
  path: string;
}

interface MockResponse {
  headers: Record<string, string>;
  setHeader: jest.Mock;
  status: jest.Mock;
  json: jest.Mock;
}

function mockReq(overrides: Partial<MockRequest> = {}): MockRequest {
  return {
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
    method: 'POST',
    path: '/auth/login',
    ...overrides,
  };
}

function mockRes(): MockResponse {
  const headers: Record<string, string> = {};
  return {
    headers,
    setHeader: jest.fn((k: string, v: string) => {
      headers[k] = v;
    }),
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as MockResponse;
}

describe('RateLimitMiddleware', () => {
  // 测试期间使用更小的窗口与阈值，方便验证
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.RATE_LIMIT_WINDOW_MS = '1000';
    process.env.RATE_LIMIT_MAX = '3';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('首次请求正常通过并设置 X-RateLimit-* 头', () => {
    const mw = new RateLimitMiddleware();
    const next = jest.fn();
    const res = mockRes();

    mw.use(mockReq() as never, res as never, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', '3');
    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '2');
  });

  it('达到阈值后抛出 429 TOO_MANY_REQUESTS 异常', () => {
    const mw = new RateLimitMiddleware();
    const next = jest.fn();
    const res = mockRes();
    const req = mockReq();

    // 用尽额度
    for (let i = 0; i < 3; i++) {
      mw.use(req as never, res as never, next);
    }

    expect(() => mw.use(req as never, res as never, next)).toThrow(
      HttpException,
    );

    try {
      mw.use(req as never, res as never, next);
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      const httpErr = err as HttpException;
      expect(httpErr.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      const body = httpErr.getResponse() as Record<string, unknown>;
      expect(body.code).toBe('TOO_MANY_REQUESTS');
      expect(typeof body.retry_after).toBe('number');
      expect((body.retry_after as number)!).toBeGreaterThan(0);
    }
  });

  it('窗口过期后桶自动重置', async () => {
    const mw = new RateLimitMiddleware();
    const next = jest.fn();
    const res = mockRes();
    const req = mockReq();

    // 触发限流
    for (let i = 0; i < 3; i++) {
      mw.use(req as never, res as never, next);
    }
    expect(() => mw.use(req as never, res as never, next)).toThrow();

    // 等待窗口过期（1.1s）
    await new Promise((r) => setTimeout(r, 1100));

    // 重新计数，应该放行
    next.mockClear();
    mw.use(req as never, res as never, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('不同 IP + path 维度独立计数', () => {
    const mw = new RateLimitMiddleware();
    const next = jest.fn();
    const res = mockRes();

    const ipA = mockReq({ socket: { remoteAddress: '1.1.1.1' } });
    const ipB = mockReq({ socket: { remoteAddress: '2.2.2.2' } });

    // IP A 用尽
    for (let i = 0; i < 3; i++) {
      mw.use(ipA as never, res as never, next);
    }
    // IP B 仍可正常请求
    mw.use(ipB as never, res as never, next);
    expect(next).toHaveBeenCalledTimes(4); // 3 + 1
  });

  it('x-forwarded-for 头作为优先 IP 源', () => {
    const mw = new RateLimitMiddleware();
    const next = jest.fn();
    const res = mockRes();
    const req = mockReq({
      headers: { 'x-forwarded-for': '203.0.113.5, 10.0.0.1' },
      socket: { remoteAddress: '127.0.0.1' },
    });

    mw.use(req as never, res as never, next);
    // 第一次请求不会触发限流，但 key 应基于 forwarded-for 的首段
    // 验证方法：用一个伪造相同 forwarded-for 的请求能继续计数
    const req2 = mockReq({
      headers: { 'x-forwarded-for': '203.0.113.5, 10.0.0.1' },
      socket: { remoteAddress: '99.99.99.99' }, // 不同 socket IP
    });
    mw.use(req2 as never, res as never, next);
    mw.use(req2 as never, res as never, next);
    expect(() => mw.use(req2 as never, res as never, next)).toThrow();
  });
});
