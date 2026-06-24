import {
  ArgumentsHost,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ApiErrorBody, GlobalHttpExceptionFilter } from './global-http-exception.filter';

interface MockResponse {
  status: jest.Mock;
  json: jest.Mock;
}

interface MockRequest {
  method: string;
  url: string;
}

function buildHost(req: MockRequest): ArgumentsHost {
  const res: MockResponse = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return {
    switchToHttp: () => ({
      getRequest: <T = MockRequest>() => req as unknown as T,
      getResponse: <T = MockResponse>() => res as unknown as T,
      getNext: () => undefined as never,
    }),
  } as unknown as ArgumentsHost;
}

describe('GlobalHttpExceptionFilter', () => {
  const filter = new GlobalHttpExceptionFilter();
  const req: MockRequest = { method: 'POST', url: '/api/test' };

  it('未捕获 Error → 500 + INTERNAL_ERROR + 通用 message（生产模式）', () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const host = buildHost(req);
    const res = host.switchToHttp().getResponse<MockResponse>();

    filter.catch(new Error('数据库炸了'), host);

    expect(res.status).toHaveBeenCalledWith(500);
    const body = res.json.mock.calls[0][0] as ApiErrorBody;
    expect(body.code).toBe('INTERNAL_ERROR');
    expect(body.status).toBe(500);
    expect(body.message).toBe('服务器内部错误');
    expect(body.path).toBe('/api/test');
    expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    process.env.NODE_ENV = original;
  });

  it('未捕获 Error → 500 + 真实 message（开发模式）', () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    const host = buildHost(req);
    const res = host.switchToHttp().getResponse<MockResponse>();

    filter.catch(new Error('数据库炸了'), host);

    const body = res.json.mock.calls[0][0] as ApiErrorBody;
    expect(body.message).toBe('数据库炸了');
    process.env.NODE_ENV = original;
  });

  it('BadRequestException（字符串） → 400 + BAD_REQUEST', () => {
    const host = buildHost(req);
    const res = host.switchToHttp().getResponse<MockResponse>();
    filter.catch(new BadRequestException('缺少字段'), host);

    expect(res.status).toHaveBeenCalledWith(400);
    const body = res.json.mock.calls[0][0] as ApiErrorBody;
    expect(body.code).toBe('BAD_REQUEST');
    expect(body.message).toBe('缺少字段');
  });

  it('UnauthorizedException → 401 + UNAUTHORIZED', () => {
    const host = buildHost(req);
    const res = host.switchToHttp().getResponse<MockResponse>();
    filter.catch(new UnauthorizedException('token 失效'), host);

    expect(res.status).toHaveBeenCalledWith(401);
    const body = res.json.mock.calls[0][0] as ApiErrorBody;
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('ForbiddenException → 403 + FORBIDDEN', () => {
    const host = buildHost(req);
    const res = host.switchToHttp().getResponse<MockResponse>();
    filter.catch(new ForbiddenException('无权限'), host);

    expect(res.status).toHaveBeenCalledWith(403);
    const body = res.json.mock.calls[0][0] as ApiErrorBody;
    expect(body.code).toBe('FORBIDDEN');
  });

  it('NotFoundException → 404 + NOT_FOUND', () => {
    const host = buildHost(req);
    const res = host.switchToHttp().getResponse<MockResponse>();
    filter.catch(new NotFoundException('资源不存在'), host);

    expect(res.status).toHaveBeenCalledWith(404);
    const body = res.json.mock.calls[0][0] as ApiErrorBody;
    expect(body.code).toBe('NOT_FOUND');
  });

  it('ConflictException → 409 + CONFLICT', () => {
    const host = buildHost(req);
    const res = host.switchToHttp().getResponse<MockResponse>();
    filter.catch(new ConflictException('资源冲突'), host);

    expect(res.status).toHaveBeenCalledWith(409);
    const body = res.json.mock.calls[0][0] as ApiErrorBody;
    expect(body.code).toBe('CONFLICT');
  });

  it('UnprocessableEntityException → 422 + UNPROCESSABLE_ENTITY', () => {
    const host = buildHost(req);
    const res = host.switchToHttp().getResponse<MockResponse>();
    filter.catch(new UnprocessableEntityException('数据无法处理'), host);

    expect(res.status).toHaveBeenCalledWith(422);
    const body = res.json.mock.calls[0][0] as ApiErrorBody;
    expect(body.code).toBe('UNPROCESSABLE_ENTITY');
  });

  it('class-validator 错误（数组 message） → 拼接为 message + 保留 details', () => {
    const host = buildHost(req);
    const res = host.switchToHttp().getResponse<MockResponse>();
    filter.catch(
      new BadRequestException({
        message: ['手机号格式不正确', '密码至少 6 位'],
        error: 'Bad Request',
      }),
      host,
    );

    const body = res.json.mock.calls[0][0] as ApiErrorBody;
    expect(body.message).toBe('手机号格式不正确; 密码至少 6 位');
    expect(body.details).toEqual(['手机号格式不正确', '密码至少 6 位']);
  });

  it('未知状态码 → 通用 HTTP_<code>', () => {
    const host = buildHost(req);
    const res = host.switchToHttp().getResponse<MockResponse>();
    const ex = new HttpException('自定义异常', HttpStatus.I_AM_A_TEAPOT);
    filter.catch(ex, host);

    const body = res.json.mock.calls[0][0] as ApiErrorBody;
    expect(body.status).toBe(418);
    expect(body.code).toBe('HTTP_418');
  });

  it('统一响应字段：path / timestamp 必填', () => {
    const host = buildHost({ method: 'GET', url: '/api/admin/users' });
    const res = host.switchToHttp().getResponse<MockResponse>();
    filter.catch(new NotFoundException('用户不存在'), host);

    const body = res.json.mock.calls[0][0] as ApiErrorBody;
    expect(body.path).toBe('/api/admin/users');
    expect(typeof body.timestamp).toBe('string');
    expect(new Date(body.timestamp!).toString()).not.toBe('Invalid Date');
  });
});
