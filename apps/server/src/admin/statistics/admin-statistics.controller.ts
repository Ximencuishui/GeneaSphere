import {
  Controller,
  Get,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminService } from '../admin.service';
import { PrismaService } from '@geneasphere/db';

@ApiTags('admin/statistics')
@Controller('api/admin/statistics')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AdminStatisticsController {
  constructor(
    private readonly adminService: AdminService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * 获取统计概览
   */
  @Get('overview')
  @ApiOperation({ summary: '获取统计概览' })
  async getOverview(
    @Request() req,
    @Query('clanId') clanIdStr: string,
  ) {
    const userId = req.user.userId;
    const clanId = BigInt(clanIdStr);

    await this.adminService.requireAdmin(clanId, userId);

    const [
      totalMembers,
      livingCount,
      deceasedCount,
      photoCount,
      videoCount,
      smsBalance,
      pendingMediaReviews,
      pendingBioReviews,
      pendingApplications,
      pendingReports,
      migrationEventsCount,
      thisMonthOrders,
      toolUsageStats,
    ] = await Promise.all([
      // 成员统计
      this.prisma.person.count({
        where: { clan_id: clanId, deleted_at: null },
      }),
      this.prisma.person.count({
        where: { clan_id: clanId, is_living: true, deleted_at: null },
      }),
      this.prisma.person.count({
        where: { clan_id: clanId, is_living: false, deleted_at: null },
      }),
      // 影像统计
      this.prisma.mediaArchive.count({
        where: { clan_id: clanId, deleted_at: null, media_type: 'image' },
      }),
      this.prisma.mediaArchive.count({
        where: { clan_id: clanId, deleted_at: null, media_type: 'video' },
      }),
      // 短信余额
      this.getSmsBalance(clanId),
      // 待审核数量
      this.prisma.mediaReview.count({
        where: { media: { clan_id: clanId }, status: 'PENDING' },
      }),
      this.prisma.bioReview.count({
        where: { person: { clan_id: clanId }, status: 'PENDING' },
      }),
      this.prisma.mergeApplication.count({
        where: { clan_id: clanId, status: 'PENDING' },
      }),
      this.prisma.contentReport.count({
        where: { clan_id: clanId, status: 'PENDING' },
      }),
      // 迁徙事件
      this.prisma.migrationEvent.count({
        where: { clan_id: clanId },
      }),
      // 本月订单
      this.getThisMonthOrders(clanId),
      // AI工具使用统计
      this.getToolUsageStats(clanId),
    ]);

    // 计算存储用量
    const storageUsed = await this.getStorageUsage(clanId);

    return {
      members: {
        total: totalMembers,
        living: livingCount,
        deceased: deceasedCount,
      },
      media: {
        photos: photoCount,
        videos: videoCount,
      },
      storage: {
        used: storageUsed,
        percentage: Math.round((storageUsed / (5 * 1024 * 1024 * 1024)) * 100),
      },
      sms_balance: smsBalance,
      pending: {
        media_reviews: pendingMediaReviews,
        bio_reviews: pendingBioReviews,
        applications: pendingApplications,
        reports: pendingReports,
      },
      migration_events: migrationEventsCount,
      this_month_orders: thisMonthOrders,
      ai_tools: toolUsageStats,
    };
  }

  /**
   * 人口统计（按世代、房支、性别分布）
   */
  @Get('demographics')
  @ApiOperation({ summary: '人口统计' })
  async getDemographics(
    @Request() req,
    @Query('clanId') clanIdStr: string,
  ) {
    const userId = req.user.userId;
    const clanId = BigInt(clanIdStr);

    await this.adminService.requireAdmin(clanId, userId);

    // 世代分布
    const generationStats = await this.prisma.$queryRaw<any[]>`
      SELECT 
        COALESCE(migration_branch, '未知') as generation,
        COUNT(*) as total,
        SUM(CASE WHEN is_living THEN 1 ELSE 0 END) as living,
        SUM(CASE WHEN NOT is_living THEN 1 ELSE 0 END) as deceased,
        SUM(CASE WHEN gender = 'male' THEN 1 ELSE 0 END) as male,
        SUM(CASE WHEN gender = 'female' THEN 1 ELSE 0 END) as female
      FROM persons
      WHERE clan_id = ${clanId} AND deleted_at IS NULL
      GROUP BY migration_branch
      ORDER BY generation
    `;

    // 性别分布
    const genderStats = await this.prisma.$queryRaw<any[]>`
      SELECT 
        gender,
        COUNT(*) as count
      FROM persons
      WHERE clan_id = ${clanId} AND deleted_at IS NULL
      GROUP BY gender
    `;

    // 年龄分布
    const ageStats = await this.prisma.$queryRaw<any[]>`
      SELECT 
        CASE 
          WHEN birth_date IS NULL THEN '未知'
          WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, birth_date)) < 18 THEN '0-17'
          WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, birth_date)) < 35 THEN '18-34'
          WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, birth_date)) < 55 THEN '35-54'
          WHEN EXTRACT(YEAR FROM AGE(CURRENT_DATE, birth_date)) < 75 THEN '55-74'
          ELSE '75+'
        END as age_group,
        COUNT(*) as count
      FROM persons
      WHERE clan_id = ${clanId} AND deleted_at IS NULL AND is_living = true
      GROUP BY age_group
      ORDER BY age_group
    `;

    return {
      by_generation: generationStats.map((g) => ({
        generation: g.generation,
        total: Number(g.total),
        living: Number(g.living),
        deceased: Number(g.deceased),
        male: Number(g.male),
        female: Number(g.female),
      })),
      by_gender: genderStats.map((g) => ({
        gender: g.gender,
        count: Number(g.count),
      })),
      by_age: ageStats.map((a) => ({
        age_group: a.age_group,
        count: Number(a.count),
      })),
    };
  }

  /**
   * 影像统计（按年份、地点分布）
   */
  @Get('media')
  @ApiOperation({ summary: '影像统计' })
  async getMediaStats(
    @Request() req,
    @Query('clanId') clanIdStr: string,
  ) {
    const userId = req.user.userId;
    const clanId = BigInt(clanIdStr);

    await this.adminService.requireAdmin(clanId, userId);

    // 按年份分布
    const yearStats = await this.prisma.$queryRaw<any[]>`
      SELECT 
        COALESCE(taken_year::text, '未知') as year,
        COUNT(*) as count
      FROM media_archives
      WHERE clan_id = ${clanId} AND deleted_at IS NULL
      GROUP BY taken_year
      ORDER BY year
    `;

    // 按地点分布
    const locationStats = await this.prisma.$queryRaw<any[]>`
      SELECT 
        COALESCE(taken_location, '未知') as location,
        COUNT(*) as count
      FROM media_archives
      WHERE clan_id = ${clanId} AND deleted_at IS NULL
      GROUP BY taken_location
      ORDER BY count DESC
      LIMIT 20
    `;

    // 按分类分布
    const categoryStats = await this.prisma.$queryRaw<any[]>`
      SELECT 
        COALESCE(category, '未分类') as category,
        COUNT(*) as count
      FROM media_archives
      WHERE clan_id = ${clanId} AND deleted_at IS NULL
      GROUP BY category
      ORDER BY count DESC
    `;

    // 按类型分布
    const typeStats = await this.prisma.$queryRaw<any[]>`
      SELECT 
        media_type,
        COUNT(*) as count
      FROM media_archives
      WHERE clan_id = ${clanId} AND deleted_at IS NULL
      GROUP BY media_type
    `;

    return {
      by_year: yearStats.map((y) => ({
        year: y.year,
        count: Number(y.count),
      })),
      by_location: locationStats.map((l) => ({
        location: l.location,
        count: Number(l.count),
      })),
      by_category: categoryStats.map((c) => ({
        category: c.category,
        count: Number(c.count),
      })),
      by_type: typeStats.map((t) => ({
        type: t.media_type,
        count: Number(t.count),
      })),
    };
  }

  /**
   * 迁徙统计
   */
  @Get('migration')
  @ApiOperation({ summary: '迁徙统计' })
  async getMigrationStats(
    @Request() req,
    @Query('clanId') clanIdStr: string,
  ) {
    const userId = req.user.userId;
    const clanId = BigInt(clanIdStr);

    await this.adminService.requireAdmin(clanId, userId);

    // 迁徙事件统计
    const totalEvents = await this.prisma.migrationEvent.count({
      where: { clan_id: clanId },
    });

    // 按年份分布
    const yearStats = await this.prisma.$queryRaw<any[]>`
      SELECT 
        event_year,
        COUNT(*) as count
      FROM migration_events
      WHERE clan_id = ${clanId}
      GROUP BY event_year
      ORDER BY event_year
    `;

    // 按原因分布
    const reasonStats = await this.prisma.$queryRaw<any[]>`
      SELECT 
        COALESCE(reason, '其他') as reason,
        COUNT(*) as count
      FROM migration_events
      WHERE clan_id = ${clanId}
      GROUP BY reason
      ORDER BY count DESC
    `;

    // 主要迁徙路线
    const routeStats = await this.prisma.$queryRaw<any[]>`
      SELECT 
        from_location,
        to_location,
        COUNT(*) as count
      FROM migration_events
      WHERE clan_id = ${clanId}
      GROUP BY from_location, to_location
      ORDER BY count DESC
      LIMIT 10
    `;

    return {
      total_events: totalEvents,
      by_year: yearStats.map((y) => ({
        year: Number(y.event_year),
        count: Number(y.count),
      })),
      by_reason: reasonStats.map((r) => ({
        reason: r.reason,
        count: Number(r.count),
      })),
      main_routes: routeStats.map((r) => ({
        from: r.from_location,
        to: r.to_location,
        count: Number(r.count),
      })),
    };
  }

  private async getSmsBalance(clanId: bigint): Promise<number> {
    try {
      const balance = await (this.prisma as any).clanBalance?.findUnique({
        where: { clan_id: clanId },
        select: { balance: true },
      });
      return balance ? Number(balance.balance) : 0;
    } catch {
      return 0;
    }
  }

  private async getThisMonthOrders(clanId: bigint): Promise<number> {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    return this.prisma.printOrder.count({
      where: {
        clan_id: clanId,
        created_at: { gte: startOfMonth },
      },
    });
  }

  private async getToolUsageStats(clanId: bigint) {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const monthlyUsage = await this.prisma.$queryRaw<any[]>`
      SELECT 
        tool_type,
        COUNT(*) as usage_count,
        SUM(credits_used) as total_credits
      FROM tool_usage_logs
      WHERE user_id IN (
        SELECT user_id FROM clan_members WHERE clan_id = ${clanId}
      )
        AND created_at >= ${startOfMonth}
      GROUP BY tool_type
    `;

    const totalMonthly = monthlyUsage.reduce(
      (sum, u) => sum + Number(u.total_credits),
      0,
    );

    return {
      this_month_usage: monthlyUsage.map((u) => ({
        tool: u.tool_type,
        count: Number(u.usage_count),
        credits: Number(u.total_credits),
      })),
      total_this_month: totalMonthly,
    };
  }

  private async getStorageUsage(clanId: bigint): Promise<number> {
    const result = await this.prisma.$queryRaw<[{ total_size: bigint }]>`
      SELECT COALESCE(SUM(file_size), 0) as total_size
      FROM media_archives
      WHERE clan_id = ${clanId} AND deleted_at IS NULL
    `;
    return Number(result[0]?.total_size || 0);
  }
}
