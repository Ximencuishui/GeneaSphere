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
    @Query('clanSlug') clanSlug: string,
  ) {
    const userId = req.user.userId;
    const clanId = await this.adminService.requireAdminBySlug(clanSlug, userId);


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
    @Query('clanSlug') clanSlug: string,
  ) {
    const userId = req.user.userId;
    const clanId = await this.adminService.requireAdminBySlug(clanSlug, userId);


    // 定位族根：取无 depth=1 父链（自身为始祖）的最早一个 person，
    // 与 cepu.service.findClanRoot 同口径（保证世代起点一致）。
    // 找不到则按 0 世兜底，下方 ancestry 分组会自然退化为空。
    const root = await this.prisma.person.findFirst({
      where: {
        clan_id: clanId,
        deleted_at: null,
        descendant_links: { none: { depth: 1 } },
      },
      orderBy: { id: 'asc' },
      select: { id: true },
    });

    // 世代分布：以族根 depth=0 对应「第 1 世」，depth+1 即世系数。
    // （Person 表无 generation 列，世代从 person_ancestry 闭包表的 depth 反推，
    //  与 cepu.service.generateShilu 计算 generation 的口径一致。）
    const generationStats = root
      ? await this.prisma.$queryRaw<any[]>`
          SELECT
            pa.depth + 1 AS generation,
            COUNT(*) AS total,
            SUM(CASE WHEN p.is_living THEN 1 ELSE 0 END) AS living,
            SUM(CASE WHEN NOT p.is_living THEN 1 ELSE 0 END) AS deceased,
            SUM(CASE WHEN p.gender = 'male' THEN 1 ELSE 0 END) AS male,
            SUM(CASE WHEN p.gender = 'female' THEN 1 ELSE 0 END) AS female
          FROM persons p
          JOIN person_ancestry pa ON pa.descendant_id = p.id
          WHERE p.clan_id = ${clanId}
            AND p.deleted_at IS NULL
            AND pa.ancestor_id = ${root.id}
            AND pa.depth >= 0
          GROUP BY pa.depth
          ORDER BY pa.depth
        `
      : [];

    // 房支分布：A/B/C 房支（朱熹长子=朱塾=A、次子=朱埜=B、三子=朱在=C）。
    // 保留原口径数据，供「按房支分布」分列展示。
    const branchStats = await this.prisma.$queryRaw<any[]>`
      SELECT
        COALESCE(migration_branch, '未知') AS branch,
        COUNT(*) AS total,
        SUM(CASE WHEN is_living THEN 1 ELSE 0 END) AS living,
        SUM(CASE WHEN NOT is_living THEN 1 ELSE 0 END) AS deceased,
        SUM(CASE WHEN gender = 'male' THEN 1 ELSE 0 END) AS male,
        SUM(CASE WHEN gender = 'female' THEN 1 ELSE 0 END) AS female
      FROM persons
      WHERE clan_id = ${clanId} AND deleted_at IS NULL
      GROUP BY migration_branch
      ORDER BY branch
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
        generation: Number(g.generation),
        total: Number(g.total),
        living: Number(g.living),
        deceased: Number(g.deceased),
        male: Number(g.male),
        female: Number(g.female),
      })),
      by_branch: branchStats.map((b) => ({
        branch: b.branch,
        total: Number(b.total),
        living: Number(b.living),
        deceased: Number(b.deceased),
        male: Number(b.male),
        female: Number(b.female),
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
    @Query('clanSlug') clanSlug: string,
  ) {
    const userId = req.user.userId;
    const clanId = await this.adminService.requireAdminBySlug(clanSlug, userId);


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
    @Query('clanSlug') clanSlug: string,
  ) {
    const userId = req.user.userId;
    const clanId = await this.adminService.requireAdminBySlug(clanSlug, userId);


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
