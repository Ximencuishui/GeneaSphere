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

@ApiTags('admin/toolbox-usage')
@Controller('api/admin/toolbox-usage')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AdminToolboxUsageController {
  constructor(
    private readonly adminService: AdminService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * 获取工具使用记录列表
   */
  @Get('list')
  @ApiOperation({ summary: '获取AI工具使用记录' })
  async getUsageList(
    @Request() req,
    @Query('clanId') clanIdStr: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('toolType') toolType?: string,
    @Query('filterUserId') filterUserId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const currentUserId = req.user.userId;
    const clanId = BigInt(clanIdStr);

    await this.adminService.requireAdmin(clanId, currentUserId);

    const pageNum = parseInt(page || '1', 10);
    const pageSizeNum = parseInt(pageSize || '20', 10);
    const skip = (pageNum - 1) * pageSizeNum;

    // 构建查询条件 - 从 clan_members 获取该家族的用户
    const where: any = {
      user: {
        clans: {
          some: { clan_id: clanId },
        },
      },
    };

    if (toolType) {
      where.tool_type = toolType;
    }

    if (filterUserId) {
      where.user_id = filterUserId;
    }

    if (startDate) {
      where.created_at = {
        ...where.created_at,
        gte: new Date(startDate),
      };
    }

    if (endDate) {
      where.created_at = {
        ...where.created_at,
        lte: new Date(endDate),
      };
    }

    const [logs, total] = await Promise.all([
      this.prisma.toolUsageLog.findMany({
        where,
        include: {
          user: {
            select: { id: true, phone: true, nickname: true },
          },
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: pageSizeNum,
      }),
      this.prisma.toolUsageLog.count({ where }),
    ]);

    return {
      data: logs.map((log) => ({
        id: log.id.toString(),
        user_id: log.user_id,
        user_name: log.user.nickname || log.user.phone,
        tool_type: log.tool_type,
        media_id: log.media_id?.toString(),
        credits_used: log.credits_used,
        estimated_cost: log.estimated_cost,
        status: log.status,
        input_url: log.input_url,
        output_url: log.output_url,
        created_at: log.created_at,
        completed_at: log.completed_at,
      })),
      total,
      page: pageNum,
      pageSize: pageSizeNum,
      totalPages: Math.ceil(total / pageSizeNum),
    };
  }

  /**
   * 获取统计概览
   */
  @Get('stats')
  @ApiOperation({ summary: '获取工具使用统计' })
  async getStats(
    @Request() req,
    @Query('clanId') clanIdStr: string,
  ) {
    const userId = req.user.userId;
    const clanId = BigInt(clanIdStr);

    await this.adminService.requireAdmin(clanId, userId);

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - 7);

    // 获取本月数据
    const monthWhere = {
      user: {
        clans: {
          some: { clan_id: clanId },
        },
      },
      created_at: { gte: startOfMonth },
    };

    const weekWhere = {
      user: {
        clans: {
          some: { clan_id: clanId },
        },
      },
      created_at: { gte: startOfWeek },
    };

    const [
      monthlyStats,
      weeklyStats,
      totalStats,
      toolBreakdown,
    ] = await Promise.all([
      // 本月使用统计
      this.prisma.toolUsageLog.aggregate({
        where: monthWhere,
        _count: true,
        _sum: { credits_used: true },
      }),
      // 本周使用统计
      this.prisma.toolUsageLog.aggregate({
        where: weekWhere,
        _count: true,
        _sum: { credits_used: true },
      }),
      // 全部时间统计
      this.prisma.toolUsageLog.aggregate({
        where: {
          user: {
            clans: {
              some: { clan_id: clanId },
            },
          },
        },
        _count: true,
        _sum: { credits_used: true },
      }),
      // 各工具使用次数
      this.prisma.$queryRaw<any[]>`
        SELECT 
          tool_type,
          COUNT(*) as usage_count,
          SUM(credits_used) as total_credits
        FROM tool_usage_logs
        WHERE user_id IN (
          SELECT user_id FROM clan_members WHERE clan_id = ${clanId}
        )
        GROUP BY tool_type
        ORDER BY usage_count DESC
      `,
    ]);

    // 获取活跃用户数
    const activeUsers = await this.prisma.$queryRaw<any[]>`
      SELECT COUNT(DISTINCT user_id) as count
      FROM tool_usage_logs
      WHERE user_id IN (
        SELECT user_id FROM clan_members WHERE clan_id = ${clanId}
      )
        AND created_at >= ${startOfMonth}
    `;

    return {
      total: {
        usage_count: totalStats._count || 0,
        credits_used: Number(totalStats._sum?.credits_used || 0),
      },
      this_month: {
        usage_count: monthlyStats._count || 0,
        credits_used: Number(monthlyStats._sum?.credits_used || 0),
        active_users: Number(activeUsers[0]?.count || 0),
      },
      this_week: {
        usage_count: weeklyStats._count || 0,
        credits_used: Number(weeklyStats._sum?.credits_used || 0),
      },
      by_tool: toolBreakdown.map((t) => ({
        tool: t.tool_type,
        count: Number(t.usage_count),
        credits: Number(t.total_credits),
      })),
    };
  }
}
