import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
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
import { clientIp } from '../../common/client-ip';

@ApiTags('admin/trash')
@Controller('api/admin/trash')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AdminTrashController {
  constructor(
    private readonly adminService: AdminService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * 获取已删除成员列表
   */
  @Get('members')
  @ApiOperation({ summary: '获取已删除成员列表' })
  async getDeletedMembers(
    @Request() req,
    @Query('clanSlug') clanSlug: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const userId = req.user.userId;
    const clanId = await this.adminService.requireAdminBySlug(clanSlug, userId);

    const pageNum = parseInt(page || '1', 10);
    const pageSizeNum = parseInt(pageSize || '20', 10);
    const skip = (pageNum - 1) * pageSizeNum;

    const where = { clan_id: clanId, deleted_at: { not: null } };

    const [members, total] = await Promise.all([
      this.prisma.person.findMany({
        where,
        include: {
          husband_in: true,
          wife_in: true,
          children_in: {
            include: { child: true },
          },
        },
        orderBy: { deleted_at: 'desc' },
        skip,
        take: pageSizeNum,
      }),
      this.prisma.person.count({ where }),
    ]);

    return {
      data: members.map((p) => ({
        id: p.id.toString(),
        full_name: p.full_name,
        gender: p.gender,
        birth_date: p.birth_date,
        death_date: p.death_date,
        is_living: p.is_living,
        deleted_at: p.deleted_at,
        deleted_by: p.deleted_by,
        family_info: {
          spouse_count: (p.husband_in?.length || 0) + (p.wife_in?.length || 0),
          children_count: p.children_in?.length || 0,
        },
      })),
      total,
      page: pageNum,
      pageSize: pageSizeNum,
      totalPages: Math.ceil(total / pageSizeNum),
    };
  }

  /**
   * 恢复成员
   */
  @Post('members/:id/restore')
  @ApiOperation({ summary: '恢复已删除成员' })
  async restoreMember(
    @Request() req,
    @Param('id') id: string,
    @Query('clanSlug') clanSlug: string,
  ) {
    const userId = req.user.userId;
    const clanId = await this.adminService.requireAdminBySlug(clanSlug, userId);

    const person = await this.prisma.person.findFirst({
      where: { id: BigInt(id), clan_id: clanId, deleted_at: { not: null } },
    });

    if (!person) {
      throw new NotFoundException('成员不存在或不属于当前家族回收站');
    }

    const restored = await this.prisma.person.updateMany({
      where: { id: person.id, clan_id: clanId, deleted_at: { not: null } },
      data: {
        deleted_at: null,
        deleted_by: null,
      },
    });
    if (restored.count === 0) {
      throw new NotFoundException('成员不存在或不属于当前家族回收站');
    }

    await this.adminService.logAction({
      clanId,
      userId,
      action: 'RESTORE_MEMBER',
      targetType: 'Person',
      targetId: id,
      details: `恢复成员: ${person.full_name}`,
      ipAddress: clientIp(req),
    });

    return {
      id: person.id.toString(),
      full_name: person.full_name,
      restored_at: new Date(),
    };
  }

  /**
   * 永久删除成员
   */
  @Delete('members/:id')
  @ApiOperation({ summary: '永久删除成员' })
  async permanentDeleteMember(
    @Request() req,
    @Param('id') id: string,
    @Query('clanSlug') clanSlug: string,
  ) {
    const userId = req.user.userId;
    const clanId = await this.adminService.requireAdminBySlug(clanSlug, userId);

    const person = await this.prisma.person.findFirst({
      where: { id: BigInt(id), clan_id: clanId, deleted_at: { not: null } },
    });

    if (!person) {
      throw new NotFoundException('成员不存在或不属于当前家族回收站');
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.personAncestry.deleteMany({
          where: { OR: [{ ancestor_id: person.id }, { descendant_id: person.id }] },
        });
        await tx.familyChild.deleteMany({ where: { child_id: person.id } });
        await tx.familyUnit.updateMany({
          where: { clan_id: clanId, husband_id: person.id },
          data: { husband_id: null },
        });
        await tx.familyUnit.updateMany({
          where: { clan_id: clanId, wife_id: person.id },
          data: { wife_id: null },
        });
        await tx.person.delete({ where: { id: person.id } });
      });
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) throw error;
      throw new BadRequestException('永久删除失败，该成员仍被其他资料引用');
    }

    await this.adminService.logAction({
      clanId,
      userId,
      action: 'PERMANENT_DELETE_MEMBER',
      targetType: 'Person',
      targetId: id,
      details: `永久删除成员: ${person.full_name}`,
      ipAddress: clientIp(req),
    });

    return { success: true };
  }

  /**
   * 获取已删除影像列表
   */
  @Get('media')
  @ApiOperation({ summary: '获取已删除影像列表' })
  async getDeletedMedia(
    @Request() req,
    @Query('clanSlug') clanSlug: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const userId = req.user.userId;
    const clanId = await this.adminService.requireAdminBySlug(clanSlug, userId);

    const pageNum = parseInt(page || '1', 10);
    const pageSizeNum = parseInt(pageSize || '20', 10);
    const skip = (pageNum - 1) * pageSizeNum;

    const where = { clan_id: clanId, deleted_at: { not: null } };

    const [media, total] = await Promise.all([
      this.prisma.mediaArchive.findMany({
        where,
        include: {
          uploader: {
            select: { id: true, phone: true, nickname: true },
          },
          album: {
            select: { id: true, name: true },
          },
        },
        orderBy: { deleted_at: 'desc' },
        skip,
        take: pageSizeNum,
      }),
      this.prisma.mediaArchive.count({ where }),
    ]);

    return {
      data: media.map((m) => ({
        id: m.id.toString(),
        file_url: m.file_url,
        thumb_url: m.thumb_url,
        media_type: m.media_type,
        taken_year: m.taken_year,
        taken_location: m.taken_location,
        description: m.description,
        category: m.category,
        deleted_at: m.deleted_at,
        deleted_by: m.deleted_by,
        uploader_name: m.uploader.nickname || m.uploader.phone,
        album_name: m.album?.name,
      })),
      total,
      page: pageNum,
      pageSize: pageSizeNum,
      totalPages: Math.ceil(total / pageSizeNum),
    };
  }

  /**
   * 恢复影像
   */
  @Post('media/:id/restore')
  @ApiOperation({ summary: '恢复已删除影像' })
  async restoreMedia(
    @Request() req,
    @Param('id') id: string,
    @Query('clanSlug') clanSlug: string,
  ) {
    const userId = req.user.userId;
    const clanId = await this.adminService.requireAdminBySlug(clanSlug, userId);

    const media = await this.prisma.mediaArchive.findFirst({
      where: { id: BigInt(id), clan_id: clanId, deleted_at: { not: null } },
    });

    if (!media) {
      throw new NotFoundException('Media not found');
    }

    const restored = await this.prisma.mediaArchive.updateMany({
      where: { id: BigInt(id), clan_id: clanId, deleted_at: { not: null } },
      data: {
        deleted_at: null,
        deleted_by: null,
      },
    });
    if (restored.count === 0) {
      throw new NotFoundException('Media not found');
    }

    if (media.album_id != null) {
      await this.prisma.clanAlbum.updateMany({
        where: { id: media.album_id, clan_id: clanId },
        data: { photo_count: { increment: 1 } },
      });
    }

    await this.adminService.logAction({
      clanId,
      userId,
      action: 'RESTORE_MEDIA',
      targetType: 'MediaArchive',
      targetId: id,
      details: `恢复影像: ${media.file_url}`,
      ipAddress: clientIp(req),
    });

    return {
      id,
      restored_at: new Date(),
    };
  }

  /**
   * 永久删除影像
   */
  @Delete('media/:id')
  @ApiOperation({ summary: '永久删除影像' })
  async permanentDeleteMedia(
    @Request() req,
    @Param('id') id: string,
    @Query('clanSlug') clanSlug: string,
  ) {
    const userId = req.user.userId;
    const clanId = await this.adminService.requireAdminBySlug(clanSlug, userId);

    const media = await this.prisma.mediaArchive.findFirst({
      where: { id: BigInt(id), clan_id: clanId },
      include: {
        person_links: true,
        reviews: true,
      },
    });

    if (!media) {
      throw new NotFoundException('Media not found');
    }

    // 先删除关联数据
    await Promise.all([
      this.prisma.mediaPersonLink.deleteMany({
        where: { media_id: BigInt(id) },
      }),
      this.prisma.mediaReview.deleteMany({
        where: { media_id: BigInt(id) },
      }),
    ]);

    // 永久删除
    await this.prisma.mediaArchive.delete({
      where: { id: BigInt(id) },
    });

    await this.adminService.logAction({
      clanId,
      userId,
      action: 'PERMANENT_DELETE_MEDIA',
      targetType: 'MediaArchive',
      targetId: id,
      details: `永久删除影像: ${media.file_url}`,
      ipAddress: clientIp(req),
    });

    return { success: true };
  }

  @Get('announcements')
  @ApiOperation({ summary: '获取已删除公告列表' })
  async getDeletedAnnouncements(
    @Request() req,
    @Query('clanSlug') clanSlug: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const userId = req.user.userId;
    const clanId = await this.adminService.requireAdminBySlug(clanSlug, userId);
    const pageNum = parseInt(page || '1', 10);
    const pageSizeNum = parseInt(pageSize || '20', 10);
    const skip = (pageNum - 1) * pageSizeNum;
    const where = { clan_id: clanId, deleted_at: { not: null } };
    const [rows, total] = await Promise.all([
      this.prisma.clanAnnouncement.findMany({
        where,
        orderBy: { deleted_at: 'desc' },
        skip,
        take: pageSizeNum,
      }),
      this.prisma.clanAnnouncement.count({ where }),
    ]);
    return {
      data: rows.map((row) => ({
        id: row.id.toString(),
        title: row.title,
        deleted_at: row.deleted_at,
        deleted_by: row.deleted_by,
      })),
      total,
      page: pageNum,
      pageSize: pageSizeNum,
      totalPages: Math.ceil(total / pageSizeNum),
    };
  }

  @Post('announcements/:id/restore')
  @ApiOperation({ summary: '恢复已删除公告' })
  async restoreAnnouncement(
    @Request() req,
    @Param('id') id: string,
    @Query('clanSlug') clanSlug: string,
  ) {
    const userId = req.user.userId;
    const clanId = await this.adminService.requireAdminBySlug(clanSlug, userId);
    const restored = await this.prisma.clanAnnouncement.updateMany({
      where: { id: BigInt(id), clan_id: clanId, deleted_at: { not: null } },
      data: { deleted_at: null, deleted_by: null, is_active: false },
    });
    if (restored.count === 0) throw new NotFoundException('公告不存在');
    await this.adminService.logAction({
      clanId,
      userId,
      action: 'RESTORE_ANNOUNCEMENT',
      targetType: 'ClanAnnouncement',
      targetId: id,
      details: '恢复公告',
      ipAddress: clientIp(req),
    });
    return { id, restored_at: new Date() };
  }

  @Delete('announcements/:id')
  @ApiOperation({ summary: '永久删除公告' })
  async permanentDeleteAnnouncement(
    @Request() req,
    @Param('id') id: string,
    @Query('clanSlug') clanSlug: string,
  ) {
    const userId = req.user.userId;
    const clanId = await this.adminService.requireAdminBySlug(clanSlug, userId);
    const removed = await this.prisma.clanAnnouncement.deleteMany({
      where: { id: BigInt(id), clan_id: clanId, deleted_at: { not: null } },
    });
    if (removed.count === 0) throw new NotFoundException('公告不存在');
    await this.adminService.logAction({
      clanId,
      userId,
      action: 'PERMANENT_DELETE_ANNOUNCEMENT',
      targetType: 'ClanAnnouncement',
      targetId: id,
      details: '永久删除公告',
      ipAddress: clientIp(req),
    });
    return { success: true };
  }
}
