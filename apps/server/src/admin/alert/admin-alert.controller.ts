import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminService } from '../admin.service';
import { AlertService, AlertLevel } from '../../common/alert.service';

/**
 * 告警演练端点
 *
 * - GET  /api/admin/alert/status — 返回 webhook 配置状态与最近告警计数
 * - POST /api/admin/alert/test  — 手动触发一条告警并同步等待投递结果
 *
 * 用途：
 *   1. 生产发布前用此端点验证 webhook 通道联通
 *   2. 5xx 风暴时人工验证通道恢复
 *   3. 接入新的告警接收方（Slack/钉钉/飞书）后烟测
 */
@ApiTags('admin/alert')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/admin/alert')
export class AdminAlertController {
  constructor(
    private readonly adminService: AdminService,
    private readonly alertService: AlertService,
  ) {}

  @Get('status')
  @ApiOperation({ summary: '告警通道状态' })
  async status(@Request() req) {
    // 仅 OWNER 可见
    const userId = req.user.userId;
    const isPlatform = req.user.role === 'PLATFORM_ADMIN';
    if (!isPlatform) {
      // 平台 OWNER 必须存在至少一个家族 OWNER
      // 这里简化为：只要是任何家族 OWNER 即可
      const owns = await this.adminService['prisma']?.clan.count?.({
        where: { admin_user_id: userId },
      });
      if (!owns) {
        throw new BadRequestException('仅家族 OWNER 可查看告警状态');
      }
    }
    return {
      webhook_configured: Boolean(process.env.ALERT_WEBHOOK_URL),
      webhook_url_masked: process.env.ALERT_WEBHOOK_URL
        ? this.maskUrl(process.env.ALERT_WEBHOOK_URL)
        : null,
      dedupe_ms: parseInt(process.env.ALERT_DEDUPE_MS || '60000', 10),
      service: process.env.SERVICE_NAME || 'geneasphere-server',
      env: process.env.NODE_ENV || 'development',
    };
  }

  @Post('test')
  @ApiOperation({ summary: '手动触发告警演练' })
  async test(@Request() req, @Body() body: { level?: AlertLevel; title?: string }) {
    const userId = req.user.userId;
    const owns = await this.adminService['prisma']?.clan.count?.({
      where: { admin_user_id: userId },
    });
    if (!owns) {
      throw new BadRequestException('仅家族 OWNER 可触发告警演练');
    }

    const level: AlertLevel = (body.level as AlertLevel) || 'P3';
    const title = body.title || `[演练] ${level} 告警通道连通性测试`;
    const result = await this.alertService.sendSync({
      level,
      title,
      source: 'manual',
      details: {
        triggered_by: userId,
        triggered_at: new Date().toISOString(),
        reason: 'Round 5 webhook drill - 运维演练',
      },
    });
    return {
      ok: result.ok,
      statusCode: result.statusCode,
      error: result.error,
      durationMs: result.durationMs,
      alert: { level, title, source: 'manual' },
    };
  }

  private maskUrl(url: string): string {
    try {
      const u = new URL(url);
      const path = u.pathname.length > 24 ? `${u.pathname.slice(0, 20)}...` : u.pathname;
      return `${u.protocol}//${u.host}${path}`;
    } catch {
      return url.slice(0, 24) + '...';
    }
  }
}