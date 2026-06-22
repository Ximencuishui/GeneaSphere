import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '@geneasphere/db';
import { PlatformAuthGuard } from '../auth/platform-auth.guard';
import { PlatformOperationLogService } from '../common/platform-operation-log.service';
import { getClientIp } from '../common/ip.util';

@ApiTags('platform/dashboard')
@ApiBearerAuth('platform')
@UseGuards(PlatformAuthGuard)
@Controller('api/platform/dashboard')
export class DashboardController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logService: PlatformOperationLogService,
  ) {}

  @Get('stats')
  @ApiOperation({ summary: '获取平台控制台核心统计数据' })
  async getStats(@Request() req: any) {
    const [
      totalFamilies,
      totalUsers,
      totalMedia,
      pendingClans,
      pendingMediaReviews,
      pendingPosts,
      refundRequests,
    ] = await Promise.all([
      this.prisma.clan.count({ where: { status: { not: 'DELETED' } } }),
      this.prisma.user.count(),
      this.prisma.mediaArchive.count(),
      this.prisma.clan.count({ where: { status: 'PENDING_REVIEW' } }),
      this.prisma.mediaReview.count({ where: { status: 'PENDING' } }),
      this.prisma.searchPost.count({ where: { status: 'PENDING' } }),
      this.prisma.printOrder.count({
        where: {
          OR: [
            { refund_status: 'PARTIAL' },
            { refund_status: 'FULL' },
            { AND: [{ refund_amount: { gt: 0 } }, { status: 'CANCELLED' }] },
          ],
        },
      }),
    ]);

    // 存储用量汇总
    const storageResult = await this.prisma.$queryRaw<[{ total: bigint | null }]>`
      SELECT COALESCE(SUM(file_size), 0) as total FROM media_archives
    `.catch(() => [{ total: BigInt(0) }]);
    const storageBytes = Number(storageResult[0]?.total || 0);

    // 今日新增
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const [todayFamilies, todayUsers, todayMedia, todayOrders] = await Promise.all([
      this.prisma.clan.count({ where: { created_at: { gte: todayStart } } }),
      this.prisma.user.count({ where: { created_at: { gte: todayStart } } }),
      this.prisma.mediaArchive.count({ where: { created_at: { gte: todayStart } } }),
      this.prisma.printOrder.count({ where: { created_at: { gte: todayStart } } }),
    ]);

    // 收入概览：印刷订单 + 充值订单
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const [monthPrintSum, lastMonthPrintSum, monthRechargeSum, lastMonthRechargeSum] = await Promise.all([
      this.prisma.printOrder.aggregate({
        _sum: { amount: true },
        where: {
          created_at: { gte: monthStart },
          status: { in: ['PAID', 'PRINTING', 'SHIPPED', 'COMPLETED'] },
        },
      }),
      this.prisma.printOrder.aggregate({
        _sum: { amount: true },
        where: {
          created_at: { gte: lastMonthStart, lt: monthStart },
          status: { in: ['PAID', 'PRINTING', 'SHIPPED', 'COMPLETED'] },
        },
      }),
      this.prisma.rechargeOrder.aggregate({
        _sum: { amount: true },
        where: { created_at: { gte: monthStart }, status: 'SUCCESS' },
      }),
      this.prisma.rechargeOrder.aggregate({
        _sum: { amount: true },
        where: {
          created_at: { gte: lastMonthStart, lt: monthStart },
          status: 'SUCCESS',
        },
      }),
    ]);

    const thisMonth =
      Number(monthPrintSum._sum.amount || 0) + Number(monthRechargeSum._sum.amount || 0);
    const lastMonth =
      Number(lastMonthPrintSum._sum.amount || 0) + Number(lastMonthRechargeSum._sum.amount || 0);
    const growthRate = lastMonth > 0 ? ((thisMonth - lastMonth) / lastMonth) * 100 : 0;

    // 趋势：近 7 天用户增长
    const users7dRaw = await this.prisma.$queryRaw<{ date: string; count: bigint }[]>`
      SELECT
        to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as date,
        COUNT(*)::bigint as count
      FROM users
      WHERE created_at >= NOW() - INTERVAL '7 days'
      GROUP BY date_trunc('day', created_at)
      ORDER BY date ASC
    `.catch(() => [] as any);
    const users7d = users7dRaw.map((r) => ({
      date: r.date,
      count: Number(r.count),
    }));

    // 趋势：近 7 天收入
    const revenue7dRaw = await this.prisma.$queryRaw<{ date: string; amount: number }[]>`
      SELECT
        to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as date,
        COALESCE(SUM(amount), 0)::float as amount
      FROM print_orders
      WHERE created_at >= NOW() - INTERVAL '7 days'
        AND status IN ('PAID', 'PRINTING', 'SHIPPED', 'COMPLETED')
      GROUP BY date_trunc('day', created_at)
      ORDER BY date ASC
    `.catch(() => [] as any);
    const revenue7d = revenue7dRaw.map((r) => ({
      date: r.date,
      amount: Number(r.amount || 0),
    }));

    // 记录查看日志
    await this.logService.log({
      adminId: req.user.adminId,
      actionType: 'VIEW_DASHBOARD',
      ipAddress: getClientIp(req),
    });

    return {
      totals: {
        families: totalFamilies,
        users: totalUsers,
        media: totalMedia,
        storage_bytes: storageBytes,
        pending_clans: pendingClans,
        pending_media: pendingMediaReviews,
        pending_posts: pendingPosts,
        refund_requests: refundRequests,
      },
      today: {
        new_families: todayFamilies,
        new_users: todayUsers,
        new_media: todayMedia,
        new_orders: todayOrders,
      },
      revenue: {
        this_month: Number(thisMonth.toFixed(2)),
        last_month: Number(lastMonth.toFixed(2)),
        growth_rate: Number(growthRate.toFixed(2)),
      },
      trends: {
        users_7d: users7d,
        revenue_7d: revenue7d,
      },
    };
  }
}
