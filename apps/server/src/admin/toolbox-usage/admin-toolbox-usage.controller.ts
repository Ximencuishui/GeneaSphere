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
    @Query('clanSlug') clanSlug: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('toolType') toolType?: string,
    @Query('filterUserId') filterUserId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const currentUserId = req.user.userId;
    const clanId = await this.adminService.requireAdminBySlug(clanSlug, currentUserId);


    const pageNum = parseInt(page || '1', 10);
    const pageSizeNum = parseInt(pageSize || '20', 10);
    const skip = (pageNum - 1) * pageSizeNum;

    const where: any = { clan_id: clanId };

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
        image_count: 1,
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
    @Query('clanSlug') clanSlug: string,
  ) {
    const userId = req.user.userId;
    const clanId = await this.adminService.requireAdminBySlug(clanSlug, userId);


    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - 7);

    const clanWhere = { clan_id: clanId };
    const monthWhere = { ...clanWhere, created_at: { gte: startOfMonth } };
    const weekWhere = { ...clanWhere, created_at: { gte: startOfWeek } };

    const [
      monthlyStats,
      weeklyStats,
      totalStats,
      toolBreakdown,
      monthUsers,
      credits,
    ] = await Promise.all([
      this.prisma.toolUsageLog.aggregate({
        where: monthWhere,
        _count: true,
        _sum: { credits_used: true },
      }),
      this.prisma.toolUsageLog.aggregate({
        where: weekWhere,
        _count: true,
        _sum: { credits_used: true },
      }),
      this.prisma.toolUsageLog.aggregate({
        where: clanWhere,
        _count: true,
        _sum: { credits_used: true },
      }),
      this.prisma.toolUsageLog.groupBy({
        by: ['tool_type'],
        where: monthWhere,
        _count: { _all: true },
        _sum: { credits_used: true },
      }),
      this.prisma.toolUsageLog.groupBy({
        by: ['user_id'],
        where: monthWhere,
      }),
      this.prisma.familySharedCredit.aggregate({
        where: { clan_id: clanId, expires_at: { gt: now } },
        _sum: { remaining_credits: true },
      }),
    ]);

    return {
      total: {
        usage_count: totalStats._count || 0,
        credits_used: Number(totalStats._sum?.credits_used || 0),
      },
      this_month: {
        usage_count: monthlyStats._count || 0,
        credits_used: Number(monthlyStats._sum?.credits_used || 0),
        active_users: monthUsers.length,
      },
      this_week: {
        usage_count: weeklyStats._count || 0,
        credits_used: Number(weeklyStats._sum?.credits_used || 0),
      },
      remaining_free_credits: Number(credits._sum.remaining_credits || 0),
      by_tool: toolBreakdown.map((row) => ({
        tool: row.tool_type,
        count: row._count._all,
        credits: Number(row._sum.credits_used || 0),
      })),
    };
  }
}
