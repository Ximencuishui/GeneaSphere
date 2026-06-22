import { Controller, Get, Query, UseGuards, Request, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { PrismaService } from '@geneasphere/db';
import { PlatformAuthGuard } from '../auth/platform-auth.guard';

@ApiTags('platform/logs')
@ApiBearerAuth('platform')
@UseGuards(PlatformAuthGuard)
@Controller('api/platform/logs')
export class PlatformLogsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('operations')
  @ApiOperation({ summary: '平台操作日志' })
  async operations(
    @Query('adminId') adminIdStr?: string,
    @Query('actionType') actionType?: string,
    @Query('targetType') targetType?: string,
    @Query('startDate') startDateStr?: string,
    @Query('endDate') endDateStr?: string,
    @Query('page') pageStr = '1',
    @Query('pageSize') pageSizeStr = '20',
  ) {
    const page = parseInt(pageStr) || 1;
    const pageSize = parseInt(pageSizeStr) || 20;
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (adminIdStr) where.admin_id = BigInt(adminIdStr);
    if (actionType) where.action_type = actionType;
    if (targetType) where.target_type = targetType;
    if (startDateStr || endDateStr) {
      where.created_at = {};
      if (startDateStr) where.created_at.gte = new Date(startDateStr);
      if (endDateStr) where.created_at.lte = new Date(endDateStr);
    }

    const [items, total] = await Promise.all([
      this.prisma.platformOperationLog.findMany({
        where,
        include: { admin: { select: { id: true, username: true, real_name: true } } },
        orderBy: { created_at: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.platformOperationLog.count({ where }),
    ]);

    return {
      data: items.map((l) => ({
        id: l.id.toString(),
        admin: {
          id: l.admin.id.toString(),
          username: l.admin.username,
          real_name: l.admin.real_name,
        },
        action_type: l.action_type,
        target_type: l.target_type,
        target_id: l.target_id,
        detail: l.detail,
        ip_address: l.ip_address,
        status: l.status,
        created_at: l.created_at,
      })),
      pagination: { page, page_size: pageSize, total, total_pages: Math.ceil(total / pageSize) },
    };
  }

  @Get('operations/export')
  @ApiOperation({ summary: '导出操作日志 CSV' })
  async exportOperations(
    @Res() res: Response,
    @Query('startDate') startDateStr?: string,
    @Query('endDate') endDateStr?: string,
  ) {
    const where: any = {};
    if (startDateStr || endDateStr) {
      where.created_at = {};
      if (startDateStr) where.created_at.gte = new Date(startDateStr);
      if (endDateStr) where.created_at.lte = new Date(endDateStr);
    }
    const items = await this.prisma.platformOperationLog.findMany({
      where,
      include: { admin: { select: { username: true } } },
      orderBy: { created_at: 'desc' },
    });
    const header = 'ID,管理员,操作,目标类型,目标ID,状态,IP地址,详情,时间\n';
    const rows = items
      .map(
        (l) =>
          `${l.id},${l.admin.username},${l.action_type},${l.target_type || ''},${l.target_id || ''},${l.status},${l.ip_address || ''},"${JSON.stringify(l.detail || {}).replace(/"/g, '""')}",${l.created_at.toISOString()}\n`,
      )
      .join('');
    const csv = '\uFEFF' + header + rows;
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="platform_logs_${Date.now()}.csv"`,
    });
    res.send(csv);
  }

  @Get('login')
  @ApiOperation({ summary: '登录日志（成功/失败）' })
  async loginLogs(
    @Query('adminId') adminIdStr?: string,
    @Query('status') status: 'success' | 'failed' | undefined = undefined,
    @Query('page') pageStr = '1',
    @Query('pageSize') pageSizeStr = '20',
  ) {
    const page = parseInt(pageStr) || 1;
    const pageSize = parseInt(pageSizeStr) || 20;
    const skip = (page - 1) * pageSize;

    const where: any = { action_type: { in: ['LOGIN', 'LOGIN_FAILED', 'LOGOUT'] } };
    if (adminIdStr) where.admin_id = BigInt(adminIdStr);
    if (status) {
      where.action_type = status === 'failed' ? 'LOGIN_FAILED' : 'LOGIN';
    }

    const [items, total] = await Promise.all([
      this.prisma.platformOperationLog.findMany({
        where,
        include: { admin: { select: { id: true, username: true, real_name: true } } },
        orderBy: { created_at: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.platformOperationLog.count({ where }),
    ]);

    return {
      data: items.map((l) => ({
        id: l.id.toString(),
        admin: {
          id: l.admin.id.toString(),
          username: l.admin.username,
          real_name: l.admin.real_name,
        },
        action_type: l.action_type,
        ip_address: l.ip_address,
        status: l.status,
        created_at: l.created_at,
      })),
      pagination: { page, page_size: pageSize, total, total_pages: Math.ceil(total / pageSize) },
    };
  }
}
