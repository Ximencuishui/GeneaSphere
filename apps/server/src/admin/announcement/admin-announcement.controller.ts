import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminService } from '../admin.service';
import { PrismaService } from '@geneasphere/db';

@ApiTags('admin/announcements')
@Controller('api/admin/announcements')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AdminAnnouncementController {
  constructor(
    private readonly adminService: AdminService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * 获取公告列表
   */
  @Get()
  @ApiOperation({ summary: '获取公告列表' })
  async getAnnouncements(
    @Request() req,
    @Query('clanId') clanIdStr: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
  ) {
    const userId = req.user.userId;
    const clanId = BigInt(clanIdStr);

    await this.adminService.requireAdmin(clanId, userId);

    const pageNum = parseInt(page || '1', 10);
    const pageSizeNum = parseInt(pageSize || '20', 10);
    const skip = (pageNum - 1) * pageSizeNum;

    const where: any = { clan_id: clanId };
    if (status === 'active') {
      where.is_active = true;
    } else if (status === 'inactive') {
      where.is_active = false;
    }

    const [announcements, total] = await Promise.all([
      this.prisma.clanAnnouncement.findMany({
        where,
        include: {
          creator: {
            select: { id: true, phone: true, nickname: true },
          },
        },
        orderBy: [
          { is_pinned: 'desc' },
          { published_at: 'desc' },
          { created_at: 'desc' },
        ],
        skip,
        take: pageSizeNum,
      }),
      this.prisma.clanAnnouncement.count({ where }),
    ]);

    return {
      data: announcements.map((a) => ({
        id: a.id.toString(),
        title: a.title,
        content: a.content,
        cover_url: a.cover_url,
        is_pinned: a.is_pinned,
        is_active: a.is_active,
        published_at: a.published_at,
        created_by: a.created_by,
        creator_name: a.creator.nickname || a.creator.phone,
        created_at: a.created_at,
      })),
      total,
      page: pageNum,
      pageSize: pageSizeNum,
      totalPages: Math.ceil(total / pageSizeNum),
    };
  }

  /**
   * 获取公告详情
   */
  @Get(':id')
  @ApiOperation({ summary: '获取公告详情' })
  async getAnnouncement(
    @Request() req,
    @Param('id') id: string,
    @Query('clanId') clanIdStr: string,
  ) {
    const userId = req.user.userId;
    const clanId = BigInt(clanIdStr);

    await this.adminService.requireAdmin(clanId, userId);

    const announcement = await this.prisma.clanAnnouncement.findUnique({
      where: { id: BigInt(id) },
      include: {
        creator: {
          select: { id: true, phone: true, nickname: true },
        },
      },
    });

    if (!announcement) {
      throw new Error('Announcement not found');
    }

    return {
      id: announcement.id.toString(),
      title: announcement.title,
      content: announcement.content,
      cover_url: announcement.cover_url,
      is_pinned: announcement.is_pinned,
      is_active: announcement.is_active,
      published_at: announcement.published_at,
      created_by: announcement.created_by,
      creator_name: announcement.creator.nickname || announcement.creator.phone,
      created_at: announcement.created_at,
      updated_at: announcement.updated_at,
    };
  }

  /**
   * 创建公告
   */
  @Post()
  @ApiOperation({ summary: '发布公告' })
  async createAnnouncement(
    @Request() req,
    @Body() body: any,
  ) {
    const userId = req.user.userId;
    const clanId = BigInt(body.clanId);

    await this.adminService.requireAdmin(clanId, userId);

    const announcement = await this.prisma.clanAnnouncement.create({
      data: {
        clan_id: clanId,
        title: body.title,
        content: body.content,
        cover_url: body.cover_url,
        is_pinned: body.is_pinned || false,
        is_active: body.is_active !== false,
        published_at: body.is_active !== false ? new Date() : null,
        created_by: userId,
      },
    });

    await this.adminService.logAction({
      clanId,
      userId,
      action: 'CREATE_ANNOUNCEMENT',
      targetType: 'ClanAnnouncement',
      targetId: announcement.id.toString(),
      details: `创建公告: ${body.title}`,
    });

    return {
      id: announcement.id.toString(),
      title: announcement.title,
      content: announcement.content,
      is_pinned: announcement.is_pinned,
      is_active: announcement.is_active,
      published_at: announcement.published_at,
      created_at: announcement.created_at,
    };
  }

  /**
   * 更新公告
   */
  @Put(':id')
  @ApiOperation({ summary: '编辑公告' })
  async updateAnnouncement(
    @Request() req,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    const userId = req.user.userId;
    const clanId = BigInt(body.clanId);

    await this.adminService.requireAdmin(clanId, userId);

    const announcement = await this.prisma.clanAnnouncement.update({
      where: { id: BigInt(id) },
      data: {
        title: body.title,
        content: body.content,
        cover_url: body.cover_url,
        is_active: body.is_active,
        is_pinned: body.is_pinned,
      },
    });

    await this.adminService.logAction({
      clanId,
      userId,
      action: 'UPDATE_ANNOUNCEMENT',
      targetType: 'ClanAnnouncement',
      targetId: announcement.id.toString(),
      details: `更新公告: ${body.title}`,
    });

    return {
      id: announcement.id.toString(),
      title: announcement.title,
      content: announcement.content,
      is_pinned: announcement.is_pinned,
      is_active: announcement.is_active,
      updated_at: announcement.updated_at,
    };
  }

  /**
   * 删除公告
   */
  @Delete(':id')
  @ApiOperation({ summary: '删除公告' })
  async deleteAnnouncement(
    @Request() req,
    @Param('id') id: string,
    @Query('clanId') clanIdStr: string,
  ) {
    const userId = req.user.userId;
    const clanId = BigInt(clanIdStr);

    await this.adminService.requireAdmin(clanId, userId);

    const announcement = await this.prisma.clanAnnouncement.findUnique({
      where: { id: BigInt(id) },
    });

    if (!announcement) {
      throw new Error('Announcement not found');
    }

    await this.prisma.clanAnnouncement.delete({
      where: { id: BigInt(id) },
    });

    await this.adminService.logAction({
      clanId,
      userId,
      action: 'DELETE_ANNOUNCEMENT',
      targetType: 'ClanAnnouncement',
      targetId: id,
      details: `删除公告: ${announcement.title}`,
    });

    return { success: true };
  }

  /**
   * 置顶/取消置顶
   */
  @Patch(':id/pin')
  @ApiOperation({ summary: '置顶/取消置顶公告' })
  async togglePin(
    @Request() req,
    @Param('id') id: string,
    @Query('clanId') clanIdStr: string,
    @Body() body: { isPinned: boolean },
  ) {
    const userId = req.user.userId;
    const clanId = BigInt(clanIdStr);

    await this.adminService.requireAdmin(clanId, userId);

    // 最多置顶3条
    if (body.isPinned) {
      const pinnedCount = await this.prisma.clanAnnouncement.count({
        where: { clan_id: clanId, is_pinned: true, id: { not: BigInt(id) } },
      });
      if (pinnedCount >= 3) {
        throw new Error('最多只能置顶3条公告');
      }
    }

    const announcement = await this.prisma.clanAnnouncement.update({
      where: { id: BigInt(id) },
      data: { is_pinned: body.isPinned },
    });

    await this.adminService.logAction({
      clanId,
      userId,
      action: body.isPinned ? 'PIN_ANNOUNCEMENT' : 'UNPIN_ANNOUNCEMENT',
      targetType: 'ClanAnnouncement',
      targetId: id,
      details: `${body.isPinned ? '置顶' : '取消置顶'}公告: ${announcement.title}`,
    });

    return {
      id: announcement.id.toString(),
      is_pinned: announcement.is_pinned,
    };
  }

  /**
   * 下架/上架公告
   */
  @Patch(':id/status')
  @ApiOperation({ summary: '下架/上架公告' })
  async toggleStatus(
    @Request() req,
    @Param('id') id: string,
    @Query('clanId') clanIdStr: string,
    @Body() body: { isActive: boolean },
  ) {
    const userId = req.user.userId;
    const clanId = BigInt(clanIdStr);

    await this.adminService.requireAdmin(clanId, userId);

    // 先获取当前状态
    const current = await this.prisma.clanAnnouncement.findUnique({
      where: { id: BigInt(id) },
    });

    if (!current) {
      throw new Error('Announcement not found');
    }

    const updateData: any = { is_active: body.isActive };
    if (body.isActive && !current.published_at) {
      updateData.published_at = new Date();
    }

    const announcement = await this.prisma.clanAnnouncement.update({
      where: { id: BigInt(id) },
      data: updateData,
    });

    await this.adminService.logAction({
      clanId,
      userId,
      action: body.isActive ? 'PUBLISH_ANNOUNCEMENT' : 'UNPUBLISH_ANNOUNCEMENT',
      targetType: 'ClanAnnouncement',
      targetId: id,
      details: `${body.isActive ? '发布' : '下架'}公告: ${announcement.title}`,
    });

    return {
      id: announcement.id.toString(),
      is_active: announcement.is_active,
    };
  }
}
