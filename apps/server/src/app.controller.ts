import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '@geneasphere/db';
import { AppService } from './app.service';

@ApiTags('health')
@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  /**
   * 基础健康检查：返回服务运行状态。
   * 注：health 端点应配置在网关/反代白名单中，跳过业务限流。
   */
  @Get('health')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '服务存活探针' })
  async health() {
    return {
      status: 'ok',
      service: 'geneasphere-server',
      version: process.env.npm_package_version || '1.0.0',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * 深度健康检查：包含数据库连通性。
   * 监控与负载均衡可据此决定是否将实例剔除。
   */
  @Get('health/ready')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '服务就绪探针（含数据库连通性）' })
  async ready() {
    const dbStart = Date.now();
    let dbOk = false;
    let dbError: string | null = null;
    try {
      // 使用最小查询
      await this.prisma.$queryRaw`SELECT 1`;
      dbOk = true;
    } catch (err: any) {
      dbError = err?.message || 'database unreachable';
    }
    const dbLatencyMs = Date.now() - dbStart;

    const healthy = dbOk;
    return {
      status: healthy ? 'ready' : 'degraded',
      service: 'geneasphere-server',
      version: process.env.npm_package_version || '1.0.0',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      checks: {
        database: {
          ok: dbOk,
          latency_ms: dbLatencyMs,
          error: dbError,
        },
      },
    };
  }
}
