import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Body,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
  Request,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminService } from '../admin.service';
import { PrismaService } from '@geneasphere/db';
import { sanitizeUserText } from '../../common/sanitize';

const PIN_LIMIT = 3;

@ApiTags('admin/announcements')
@Controller('api/admin/announcements')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AdminAnnouncementController {
  constructor(
    private readonly adminService: AdminService,
    private readonly prisma: PrismaService,
  ) {}

  private async loadInClan(id: bigint, clanId: bigint) {
    const announcement = await this.prisma.clanAnnouncement.findFirst({
      where: { id, clan_id: clanId, deleted_at: null },
      include: {
        creator: {
          select: { id: true, phone: true, nickname: true },
        },
      },
    });
    if (!announcement) {
      throw new NotFoundException('公告不存在');
    }
    return announcement;
  }

  @Get()
  @ApiOperation({ summary: '获取公告列表' })
  async getAnnouncements(
    @Request() req,
    @Query('clanSlug') clanSlug: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
  ) {
    const userId = req.user.userId;
    const clanId = await this.adminService.requireAdminBySlug(clanSlug, userId);

    const pageNum = parseInt(page || '1', 10);
    const pageSizeNum = parseInt(pageSize || '20', 10);
    const skip = (pageNum - 1) * pageSizeNum;

    const where: any = { clan_id: clanId, deleted_at: null };
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

  @Get(':id')
  @ApiOperation({ summary: '获取公告详情' })
  async getAnnouncement(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Query('clanSlug') clanSlug: string,
  ) {
    const userId = req.user.userId;
    const clanId = await this.adminService.requireAdminBySlug(clanSlug, userId);
    const announcement = await this.loadInClan(BigInt(id), clanId);

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

  @Post()
  @ApiOperation({ summary: '发布公告' })
  async createAnnouncement(
    @Request() req,
    @Body() body: any,
  ) {
    const userId = req.user.userId;
    const clanId = await this.adminService.requireAdminBySlug(body.clanSlug, userId);
    const safeTitle = sanitizeUserText(body.title);
    const safeContent = sanitizeUserText(body.content);
    const wantPin = Boolean(body.is_pinned);

    const announcement = await this.prisma.$transaction(async (tx) => {
      if (wantPin) {
        const pinnedCount = await tx.clanAnnouncement.count({
          where: { clan_id: clanId, is_pinned: true },
        });
        if (pinnedCount >= PIN_LIMIT) {
          throw new BadRequestException('最多只能置顶3条公告');
        }
      }
      return tx.clanAnnouncement.create({
        data: {
          clan_id: clanId,
          title: safeTitle,
          content: safeContent,
          cover_url: body.cover_url,
          is_pinned: wantPin,
          is_active: body.is_active !== false,
          published_at: body.is_active !== false ? new Date() : null,
          created_by: userId,
        },
      });
    });

    await this.adminService.logAction({
      clanId,
      userId,
      action: 'CREATE_ANNOUNCEMENT',
      targetType: 'ClanAnnouncement',
      targetId: announcement.id.toString(),
      details: `创建公告: ${safeTitle}`,
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

  @Put(':id')
  @ApiOperation({ summary: '编辑公告' })
  async updateAnnouncement(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: any,
  ) {
    const userId = req.user.userId;
    const clanId = await this.adminService.requireAdminBySlug(body.clanSlug, userId);
    const current = await this.loadInClan(BigInt(id), clanId);
    const safeTitle = body.title !== undefined ? sanitizeUserText(body.title) : undefined;
    const safeContent = body.content !== undefined ? sanitizeUserText(body.content) : undefined;

    const announcement = await this.prisma.$transaction(async (tx) => {
      if (body.is_pinned === true && !current.is_pinned) {
        const pinnedCount = await tx.clanAnnouncement.count({
          where: { clan_id: clanId, is_pinned: true, deleted_at: null, id: { not: current.id } },
        });
        if (pinnedCount >= PIN_LIMIT) {
          throw new BadRequestException('最多只能置顶3条公告');
        }
      }
      const updated = await tx.clanAnnouncement.updateMany({
        where: { id: current.id, clan_id: clanId, deleted_at: null },
        data: {
          title: safeTitle,
          content: safeContent,
          cover_url: body.cover_url,
          is_active: body.is_active,
          is_pinned: body.is_pinned,
        },
      });
      if (updated.count !== 1) {
        throw new NotFoundException('公告不存在');
      }
      return tx.clanAnnouncement.findFirst({ where: { id: current.id, clan_id: clanId } });
    });

    await this.adminService.logAction({
      clanId,
      userId,
      action: 'UPDATE_ANNOUNCEMENT',
      targetType: 'ClanAnnouncement',
      targetId: current.id.toString(),
      details: `更新公告: ${safeTitle ?? current.title}`,
    });

    return {
      id: announcement!.id.toString(),
      title: announcement!.title,
      content: announcement!.content,
      is_pinned: announcement!.is_pinned,
      is_active: announcement!.is_active,
      updated_at: announcement!.updated_at,
    };
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除公告' })
  async deleteAnnouncement(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Query('clanSlug') clanSlug: string,
  ) {
    const userId = req.user.userId;
    const clanId = await this.adminService.requireAdminBySlug(clanSlug, userId);
    const announcement = await this.loadInClan(BigInt(id), clanId);

    const removed = await this.prisma.clanAnnouncement.updateMany({
      where: { id: announcement.id, clan_id: clanId, deleted_at: null },
      data: {
        deleted_at: new Date(),
        deleted_by: userId,
        is_active: false,
        is_pinned: false,
      },
    });
    if (removed.count !== 1) {
      throw new NotFoundException('公告不存在');
    }

    await this.adminService.logAction({
      clanId,
      userId,
      action: 'DELETE_ANNOUNCEMENT',
      targetType: 'ClanAnnouncement',
      targetId: id.toString(),
      details: `删除公告: ${announcement.title}`,
    });

    return { success: true };
  }

  @Patch(':id/pin')
  @ApiOperation({ summary: '置顶/取消置顶公告' })
  async togglePin(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Query('clanSlug') clanSlug: string,
    @Body() body: { isPinned: boolean },
  ) {
    const userId = req.user.userId;
    const clanId = await this.adminService.requireAdminBySlug(clanSlug, userId);

    const announcement = await this.prisma.$transaction(async (tx) => {
      const current = await tx.clanAnnouncement.findFirst({
        where: { id: BigInt(id), clan_id: clanId, deleted_at: null },
      });
      if (!current) {
        throw new NotFoundException('公告不存在');
      }
      if (body.isPinned) {
        const pinnedCount = await tx.clanAnnouncement.count({
          where: { clan_id: clanId, is_pinned: true, deleted_at: null, id: { not: current.id } },
        });
        if (pinnedCount >= PIN_LIMIT) {
          throw new BadRequestException('最多只能置顶3条公告');
        }
      }
      const updated = await tx.clanAnnouncement.updateMany({
        where: { id: current.id, clan_id: clanId, deleted_at: null },
        data: { is_pinned: body.isPinned },
      });
      if (updated.count !== 1) {
        throw new NotFoundException('公告不存在');
      }
      return tx.clanAnnouncement.findFirst({ where: { id: current.id, clan_id: clanId } });
    });

    await this.adminService.logAction({
      clanId,
      userId,
      action: body.isPinned ? 'PIN_ANNOUNCEMENT' : 'UNPIN_ANNOUNCEMENT',
      targetType: 'ClanAnnouncement',
      targetId: id.toString(),
      details: `${body.isPinned ? '置顶' : '取消置顶'}公告: ${announcement!.title}`,
    });

    return {
      id: announcement!.id.toString(),
      is_pinned: announcement!.is_pinned,
    };
  }

  @Patch(':id/status')
  @ApiOperation({ summary: '下架/上架公告' })
  async toggleStatus(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Query('clanSlug') clanSlug: string,
    @Body() body: { isActive: boolean },
  ) {
    const userId = req.user.userId;
    const clanId = await this.adminService.requireAdminBySlug(clanSlug, userId);
    const current = await this.loadInClan(BigInt(id), clanId);

    const updateData: any = { is_active: body.isActive };
    if (body.isActive && !current.published_at) {
      updateData.published_at = new Date();
    }

    const updated = await this.prisma.clanAnnouncement.updateMany({
      where: { id: current.id, clan_id: clanId, deleted_at: null },
      data: updateData,
    });
    if (updated.count !== 1) {
      throw new NotFoundException('公告不存在');
    }

    await this.adminService.logAction({
      clanId,
      userId,
      action: body.isActive ? 'PUBLISH_ANNOUNCEMENT' : 'UNPUBLISH_ANNOUNCEMENT',
      targetType: 'ClanAnnouncement',
      targetId: id.toString(),
      details: `${body.isActive ? '发布' : '下架'}公告: ${current.title}`,
    });

    return {
      id: current.id.toString(),
      is_active: body.isActive,
    };
  }
}
