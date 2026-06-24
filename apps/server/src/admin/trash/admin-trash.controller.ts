import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminService } from '../admin.service';
import { PrismaService } from '@geneasphere/db';

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
    @Query('clanId') clanIdStr: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const userId = req.user.userId;
    const clanId = BigInt(clanIdStr);

    await this.adminService.requireAdmin(clanId, userId);

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
    @Query('clanId') clanIdStr: string,
  ) {
    const userId = req.user.userId;
    const clanId = BigInt(clanIdStr);

    await this.adminService.requireAdmin(clanId, userId);

    const person = await this.prisma.person.findUnique({
      where: { id: BigInt(id) },
    });

    if (!person || !person.deleted_at) {
      throw new Error('Member not found or not deleted');
    }

    const restored = await this.prisma.person.update({
      where: { id: BigInt(id) },
      data: {
        deleted_at: null,
        deleted_by: null,
      },
    });

    await this.adminService.logAction({
      clanId,
      userId,
      action: 'RESTORE_MEMBER',
      targetType: 'Person',
      targetId: id,
      details: `恢复成员: ${person.full_name}`,
    });

    return {
      id: restored.id.toString(),
      full_name: restored.full_name,
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
    @Query('clanId') clanIdStr: string,
  ) {
    const userId = req.user.userId;
    const clanId = BigInt(clanIdStr);

    await this.adminService.requireOwner(clanId, userId);

    const person = await this.prisma.person.findUnique({
      where: { id: BigInt(id) },
      include: {
        ancestor_links: true,
        descendant_links: true,
        children_in: true,
        husband_in: true,
        wife_in: true,
      },
    });

    if (!person) {
      throw new Error('Member not found');
    }

    // 检查是否有未删除的关联数据
    const hasActiveRelations =
      person.ancestor_links?.length > 0 ||
      person.descendant_links?.length > 0 ||
      person.children_in?.length > 0;

    if (hasActiveRelations) {
      throw new Error('Cannot permanently delete member with active relationships');
    }

    // 永久删除
    await this.prisma.person.delete({
      where: { id: BigInt(id) },
    });

    await this.adminService.logAction({
      clanId,
      userId,
      action: 'PERMANENT_DELETE_MEMBER',
      targetType: 'Person',
      targetId: id,
      details: `永久删除成员: ${person.full_name}`,
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
    @Query('clanId') clanIdStr: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const userId = req.user.userId;
    const clanId = BigInt(clanIdStr);

    await this.adminService.requireAdmin(clanId, userId);

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
    @Query('clanId') clanIdStr: string,
  ) {
    const userId = req.user.userId;
    const clanId = BigInt(clanIdStr);

    await this.adminService.requireAdmin(clanId, userId);

    const media = await this.prisma.mediaArchive.findUnique({
      where: { id: BigInt(id) },
    });

    if (!media || !media.deleted_at) {
      throw new Error('Media not found or not deleted');
    }

    const restored = await this.prisma.mediaArchive.update({
      where: { id: BigInt(id) },
      data: {
        deleted_at: null,
        deleted_by: null,
      },
    });

    await this.adminService.logAction({
      clanId,
      userId,
      action: 'RESTORE_MEDIA',
      targetType: 'MediaArchive',
      targetId: id,
      details: `恢复影像: ${media.file_url}`,
    });

    return {
      id: restored.id.toString(),
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
    @Query('clanId') clanIdStr: string,
  ) {
    const userId = req.user.userId;
    const clanId = BigInt(clanIdStr);

    await this.adminService.requireOwner(clanId, userId);

    const media = await this.prisma.mediaArchive.findUnique({
      where: { id: BigInt(id) },
      include: {
        person_links: true,
        reviews: true,
      },
    });

    if (!media) {
      throw new Error('Media not found');
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

    // 更新相册照片数
    if (media.album_id) {
      await this.prisma.clanAlbum.update({
        where: { id: media.album_id },
        data: {
          photo_count: { decrement: 1 },
        },
      }).catch(() => {});
    }

    await this.adminService.logAction({
      clanId,
      userId,
      action: 'PERMANENT_DELETE_MEDIA',
      targetType: 'MediaArchive',
      targetId: id,
      details: `永久删除影像: ${media.file_url}`,
    });

    return { success: true };
  }
}
