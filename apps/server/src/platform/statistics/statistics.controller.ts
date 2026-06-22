import { Controller, Get, Query, UseGuards, Request, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { PrismaService } from '@geneasphere/db';
import * as XLSX from 'xlsx';
import { PlatformAuthGuard } from '../auth/platform-auth.guard';
import { PlatformOperationLogService } from '../common/platform-operation-log.service';
import { getClientIp } from '../common/ip.util';

@ApiTags('platform/statistics')
@ApiBearerAuth('platform')
@UseGuards(PlatformAuthGuard)
@Controller('api/platform/statistics')
export class StatisticsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logService: PlatformOperationLogService,
  ) {}

  @Get('summary')
  @ApiOperation({ summary: '周期统计数据' })
  async summary(@Query('period') period: 'day' | 'week' | 'month' = 'day') {
    const days = period === 'day' ? 1 : period === 'week' ? 7 : 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [families, users, media, orders, revenueAgg, trendsRaw] = await Promise.all([
      this.prisma.clan.count({ where: { created_at: { gte: since } } }),
      this.prisma.user.count({ where: { created_at: { gte: since } } }),
      this.prisma.mediaArchive.count({ where: { created_at: { gte: since } } }),
      this.prisma.printOrder.count({ where: { created_at: { gte: since } } }),
      this.prisma.printOrder.aggregate({
        _sum: { amount: true },
        where: {
          created_at: { gte: since },
          status: { in: ['PAID', 'PRINTING', 'SHIPPED', 'COMPLETED'] },
        },
      }),
      this.prisma.$queryRaw<{ date: string; amount: number; count: bigint }[]>`
        SELECT
          to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as date,
          COALESCE(SUM(amount), 0)::float as amount,
          COUNT(*)::bigint as count
        FROM print_orders
        WHERE created_at >= ${since}
        GROUP BY date_trunc('day', created_at)
        ORDER BY date ASC
      `.catch(() => [] as any),
    ]);

    return {
      period,
      since: since.toISOString(),
      totals: {
        new_families: families,
        new_users: users,
        new_media: media,
        new_orders: orders,
        revenue: Number(revenueAgg._sum.amount || 0),
      },
      trends: trendsRaw.map((r) => ({
        date: r.date,
        revenue: Number(r.amount || 0),
        order_count: Number(r.count || 0),
      })),
    };
  }

  @Get('family-ranking')
  @ApiOperation({ summary: '家族排行' })
  async familyRanking(
    @Query('type') type: 'member_count' | 'photo_count' | 'storage' | 'revenue' = 'member_count',
    @Query('limit') limitStr = '20',
  ) {
    const limit = Math.min(parseInt(limitStr) || 20, 100);

    if (type === 'member_count') {
      const rows = await this.prisma.$queryRaw<{ id: bigint; name: string; count: bigint }[]>`
        SELECT c.id, c.name, COUNT(cm.id)::bigint as count
        FROM clans c
        LEFT JOIN clan_members cm ON cm.clan_id = c.id
        WHERE c.status != 'DELETED'
        GROUP BY c.id, c.name
        ORDER BY count DESC
        LIMIT ${limit}
      `.catch(() => [] as any);
      return {
        type,
        data: rows.map((r) => ({
          clan_id: r.id.toString(),
          name: r.name,
          value: Number(r.count),
        })),
      };
    }

    if (type === 'photo_count') {
      const rows = await this.prisma.$queryRaw<{ id: bigint; name: string; count: bigint }[]>`
        SELECT c.id, c.name, COUNT(m.id)::bigint as count
        FROM clans c
        LEFT JOIN media_archives m ON m.clan_id = c.id
        WHERE c.status != 'DELETED'
        GROUP BY c.id, c.name
        ORDER BY count DESC
        LIMIT ${limit}
      `.catch(() => [] as any);
      return {
        type,
        data: rows.map((r) => ({
          clan_id: r.id.toString(),
          name: r.name,
          value: Number(r.count),
        })),
      };
    }

    if (type === 'storage') {
      const rows = await this.prisma.$queryRaw<{ id: bigint; name: string; bytes: bigint }[]>`
        SELECT c.id, c.name, COALESCE(SUM(m.file_size), 0)::bigint as bytes
        FROM clans c
        LEFT JOIN media_archives m ON m.clan_id = c.id
        WHERE c.status != 'DELETED'
        GROUP BY c.id, c.name
        ORDER BY bytes DESC
        LIMIT ${limit}
      `.catch(() => [] as any);
      return {
        type,
        data: rows.map((r) => ({
          clan_id: r.id.toString(),
          name: r.name,
          value: Number(r.bytes),
        })),
      };
    }

    // revenue
    const rows = await this.prisma.$queryRaw<{ id: bigint; name: string; revenue: number }[]>`
      SELECT c.id, c.name, COALESCE(SUM(o.amount), 0)::float as revenue
      FROM clans c
      LEFT JOIN print_orders o ON o.clan_id = c.id
        AND o.status IN ('PAID', 'PRINTING', 'SHIPPED', 'COMPLETED')
      WHERE c.status != 'DELETED'
      GROUP BY c.id, c.name
      ORDER BY revenue DESC
      LIMIT ${limit}
    `.catch(() => [] as any);
    return {
      type,
      data: rows.map((r) => ({
        clan_id: r.id.toString(),
        name: r.name,
        value: Number(r.revenue || 0),
      })),
    };
  }

  @Get('tool-usage')
  @ApiOperation({ summary: 'AI 工具使用统计（v1.0 占位）' })
  async toolUsage() {
    return {
      message: 'AI 工具埋点表尚未上线（v1.1 引入），当前返回空数据',
      data: [],
    };
  }

  @Get('export')
  @ApiOperation({ summary: '导出统计 Excel/CSV' })
  async export(
    @Res() res: Response,
    @Request() req: any,
    @Query('type') type: 'summary' | 'family-ranking' = 'summary',
    @Query('format') format: 'excel' | 'csv' = 'excel',
  ) {
    let rows: any[] = [];
    let sheetName = '';
    if (type === 'summary') {
      const data = await this.summary('month');
      rows = [
        { 指标: '新增家族', 数量: data.totals.new_families },
        { 指标: '新增用户', 数量: data.totals.new_users },
        { 指标: '新增影像', 数量: data.totals.new_media },
        { 指标: '新增订单', 数量: data.totals.new_orders },
        { 指标: '近 30 天收入', 数量: data.totals.revenue },
      ];
      sheetName = '汇总';
    } else {
      const data = await this.familyRanking('revenue', '100');
      rows = data.data.map((r) => ({ 家族ID: r.clan_id, 家族名称: r.name, 收入: r.value }));
      sheetName = '家族排行';
    }

    await this.logService.log({
      adminId: req.user.adminId,
      actionType: 'EXPORT_STATISTICS',
      targetType: 'Statistics',
      detail: { type, format },
      ipAddress: getClientIp(req),
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    if (format === 'csv') {
      const csv = XLSX.utils.sheet_to_csv(ws);
      res.set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="stats_${type}_${Date.now()}.csv"`,
      });
      res.send('\uFEFF' + csv);
    } else {
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.set({
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="stats_${type}_${Date.now()}.xlsx"`,
        'Content-Length': buf.length,
      });
      res.send(buf);
    }
  }
}
