import { Controller, Get, Post, Body, UseGuards, Request, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminService } from '../admin.service';
import { PrismaService } from '@geneasphere/db';

@ApiTags('admin/logs')
@Controller('api/admin/logs')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class LogsController {
  constructor(
    private readonly adminService: AdminService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * 获取操作日志列表
   */
  @Get()
  @ApiOperation({ summary: 'Get audit logs' })
  async getLogs(
    @Request() req,
    @Query('clanId') clanIdStr: string,
    @Query('page') pageStr = '1',
    @Query('pageSize') pageSizeStr = '20',
    @Query('action') action?: string,
    @Query('userId') userIdStr?: string,
    @Query('startDate') startDateStr?: string,
    @Query('endDate') endDateStr?: string,
  ) {
    const userId = req.user.userId;
    const clanId = BigInt(clanIdStr);

    await this.adminService.requireAdmin(clanId, userId);

    const page = parseInt(pageStr) || 1;
    const pageSize = parseInt(pageSizeStr) || 20;
    const skip = (page - 1) * pageSize;

    const where: any = { clan_id: clanId };

    if (action) {
      where.action = action;
    }

    if (userIdStr) {
      where.user_id = userIdStr;
    }

    if (startDateStr || endDateStr) {
      where.created_at = {};
      if (startDateStr) {
        where.created_at.gte = new Date(startDateStr);
      }
      if (endDateStr) {
        where.created_at.lte = new Date(endDateStr);
      }
    }

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: {
          user: { select: { id: true, phone: true } },
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data: logs.map(l => ({
        id: l.id.toString(),
        user_id: l.user_id,
        user_phone: l.user.phone,
        action: l.action,
        target_type: l.target_type,
        target_id: l.target_id,
        details: l.details,
        ip_address: l.ip_address,
        created_at: l.created_at,
      })),
      pagination: {
        page,
        page_size: pageSize,
        total,
        total_pages: Math.ceil(total / pageSize),
      },
    };
  }

  /**
   * 导出日志为 CSV
   */
  @Get('export')
  @ApiOperation({ summary: 'Export audit logs as CSV' })
  async exportLogs(
    @Request() req,
    @Query('clanId') clanIdStr: string,
    @Query('startDate') startDateStr?: string,
    @Query('endDate') endDateStr?: string,
  ) {
    const userId = req.user.userId;
    const clanId = BigInt(clanIdStr);

    await this.adminService.requireAdmin(clanId, userId);

    const where: any = { clan_id: clanId };

    if (startDateStr || endDateStr) {
      where.created_at = {};
      if (startDateStr) {
        where.created_at.gte = new Date(startDateStr);
      }
      if (endDateStr) {
        where.created_at.lte = new Date(endDateStr);
      }
    }

    const logs = await this.prisma.auditLog.findMany({
      where,
      include: {
        user: { select: { phone: true } },
      },
      orderBy: { created_at: 'desc' },
    });

    // 生成 CSV
    const header = 'ID,用户,操作,目标类型,目标ID,详情,IP地址,时间\n';
    const rows = logs.map(l =>
      `${l.id},${l.user.phone},${l.action},${l.target_type || ''},${l.target_id || ''},${l.details || ''},${l.ip_address || ''},${l.created_at.toISOString()}\n`
    );
    const csv = header + rows.join('');

    return {
      filename: `audit_logs_${clanIdStr}_${new Date().toISOString().split('T')[0]}.csv`,
      content: csv,
      content_type: 'text/csv',
    };
  }
}
