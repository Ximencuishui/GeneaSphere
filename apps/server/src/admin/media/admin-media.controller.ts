import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
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

@ApiTags('admin/media')
@Controller('api/admin/media')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AdminMediaController {
  constructor(
    private readonly adminService: AdminService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * 获取影像列表
   */
  @Get('list')
  @ApiOperation({ summary: '获取影像列表' })
  async getMediaList(
    @Request() req,
    @Query('clanId') clanIdStr: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('type') type?: string,
    @Query('uploaderId') uploaderId?: string,
    @Query('albumId') albumId?: string,
    @Query('startYear') startYear?: string,
    @Query('endYear') endYear?: string,
    @Query('location') location?: string,
    @Query('personId') personId?: string,
    @Query('status') status?: string,
    @Query('keyword') keyword?: string,
  ) {
    const userId = req.user.userId;
    const clanId = BigInt(clanIdStr);

    await this.adminService.requireAdmin(clanId, userId);

    const pageNum = parseInt(page || '1', 10);
    const pageSizeNum = parseInt(pageSize || '30', 10);
    const skip = (pageNum - 1) * pageSizeNum;

    // 构建查询条件
    const where: any = { clan_id: clanId };

    // 只查询未删除的
    if (status !== 'deleted') {
      where.deleted_at = null;
    }

    if (type && type !== 'all') {
      where.media_type = type;
    }

    if (uploaderId) {
      where.uploader_id = uploaderId;
    }

    if (albumId) {
      where.album_id = albumId ? BigInt(albumId) : null;
    }

    if (startYear) {
      where.taken_year = { ...where.taken_year, gte: parseInt(startYear) };
    }

    if (endYear) {
      where.taken_year = { ...where.taken_year, lte: parseInt(endYear) };
    }

    if (location) {
      where.taken_location = { contains: location };
    }

    if (keyword) {
      where.OR = [
        { description: { contains: keyword } },
        { taken_location: { contains: keyword } },
      ];
    }

    if (personId) {
      where.person_links = {
        some: { person_id: BigInt(personId) },
      };
    }

    // 排序
    const orderBy: any = { created_at: 'desc' };

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
          person_links: {
            include: {
              person: {
                select: { id: true, full_name: true },
              },
            },
          },
        },
        orderBy,
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
        display_url: m.display_url,
        media_type: m.media_type,
        taken_year: m.taken_year,
        taken_location: m.taken_location,
        description: m.description,
        category: m.category,
        is_cover: m.is_cover,
        file_size: m.file_size.toString(),
        privacy_level: m.privacy_level,
        uploader_name: m.uploader.nickname || m.uploader.phone,
        album_name: m.album?.name,
        album_id: m.album_id?.toString(),
        tagged_persons: m.person_links.map((p) => ({
          id: p.person.id.toString(),
          name: p.person.full_name,
        })),
        created_at: m.created_at,
        deleted_at: m.deleted_at,
      })),
      total,
      page: pageNum,
      pageSize: pageSizeNum,
      totalPages: Math.ceil(total / pageSizeNum),
    };
  }

  /**
   * 获取影像详情
   */
  @Get(':id')
  @ApiOperation({ summary: '获取影像详情' })
  async getMediaDetail(
    @Request() req,
    @Param('id') id: string,
    @Query('clanId') clanIdStr: string,
  ) {
    const userId = req.user.userId;
    const clanId = BigInt(clanIdStr);

    await this.adminService.requireAdmin(clanId, userId);

    const media = await this.prisma.mediaArchive.findUnique({
      where: { id: BigInt(id) },
      include: {
        uploader: {
          select: { id: true, phone: true, nickname: true },
        },
        album: true,
        person_links: {
          include: {
            person: {
              select: { id: true, full_name: true, avatar_url: true },
            },
          },
        },
      },
    });

    if (!media) {
      throw new Error('Media not found');
    }

    return {
      id: media.id.toString(),
      file_url: media.file_url,
      thumb_url: media.thumb_url,
      display_url: media.display_url,
      original_key: media.original_key,
      media_type: media.media_type,
      taken_year: media.taken_year,
      taken_location: media.taken_location,
      description: media.description,
      category: media.category,
      is_cover: media.is_cover,
      file_size: media.file_size.toString(),
      privacy_level: media.privacy_level,
      album: media.album ? {
        id: media.album.id.toString(),
        name: media.album.name,
      } : null,
      uploader: {
        id: media.uploader.id,
        name: media.uploader.nickname || media.uploader.phone,
      },
      tagged_persons: media.person_links.map((p) => ({
        id: p.person.id.toString(),
        name: p.person.full_name,
        avatar_url: p.person.avatar_url,
      })),
      created_at: media.created_at,
      updated_at: media.updated_at,
      deleted_at: media.deleted_at,
    };
  }

  /**
   * 更新影像元数据
   */
  @Put(':id')
  @ApiOperation({ summary: '更新影像元数据' })
  async updateMedia(
    @Request() req,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    const userId = req.user.userId;
    const clanId = BigInt(body.clanId);

    await this.adminService.requireAdmin(clanId, userId);

    const updateData: any = {};

    if (body.taken_year !== undefined) updateData.taken_year = body.taken_year;
    if (body.taken_location !== undefined) updateData.taken_location = body.taken_location;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.category !== undefined) updateData.category = body.category;
    if (body.privacy_level !== undefined) updateData.privacy_level = body.privacy_level;
    if (body.is_cover !== undefined) updateData.is_cover = body.is_cover;

    // 如果更改了相册
    if (body.album_id !== undefined) {
      const oldMedia = await this.prisma.mediaArchive.findUnique({
        where: { id: BigInt(id) },
        select: { album_id: true },
      });

      updateData.album_id = body.album_id ? BigInt(body.album_id) : null;

      // 更新旧相册计数
      if (oldMedia?.album_id) {
        await this.prisma.clanAlbum.update({
          where: { id: oldMedia.album_id },
          data: { photo_count: { decrement: 1 } },
        }).catch(() => {});
      }

      // 更新新相册计数
      if (body.album_id) {
        await this.prisma.clanAlbum.update({
          where: { id: BigInt(body.album_id) },
          data: { photo_count: { increment: 1 } },
        }).catch(() => {});
      }
    }

    const updated = await this.prisma.mediaArchive.update({
      where: { id: BigInt(id) },
      data: updateData,
    });

    await this.adminService.logAction({
      clanId,
      userId,
      action: 'UPDATE_MEDIA_METADATA',
      targetType: 'MediaArchive',
      targetId: id,
      details: `更新影像元数据`,
    });

    return {
      id: updated.id.toString(),
      updated_at: updated.updated_at,
    };
  }

  /**
   * 软删除影像
   */
  @Delete(':id')
  @ApiOperation({ summary: '软删除影像' })
  async deleteMedia(
    @Request() req,
    @Param('id') id: string,
    @Query('clanId') clanIdStr: string,
  ) {
    const userId = req.user.userId;
    const clanId = BigInt(clanIdStr);

    await this.adminService.requireAdmin(clanId, userId);

    const media = await this.prisma.mediaArchive.findUnique({
      where: { id: BigInt(id) },
      select: { album_id: true },
    });

    const deleted = await this.prisma.mediaArchive.update({
      where: { id: BigInt(id) },
      data: {
        deleted_at: new Date(),
        deleted_by: userId,
      },
    });

    // 更新相册计数
    if (media?.album_id) {
      await this.prisma.clanAlbum.update({
        where: { id: media.album_id },
        data: { photo_count: { decrement: 1 } },
      }).catch(() => {});
    }

    await this.adminService.logAction({
      clanId,
      userId,
      action: 'DELETE_MEDIA',
      targetType: 'MediaArchive',
      targetId: id,
      details: `软删除影像`,
    });

    return {
      id: deleted.id.toString(),
      deleted_at: deleted.deleted_at,
    };
  }

  /**
   * 批量更新
   */
  @Post('batch-update')
  @ApiOperation({ summary: '批量更新影像元数据' })
  async batchUpdate(
    @Request() req,
    @Body() body: any,
  ) {
    const userId = req.user.userId;
    const clanId = BigInt(body.clanId);

    await this.adminService.requireAdmin(clanId, userId);

    const { ids, ...updates } = body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      throw new Error('ids is required and must be non-empty array');
    }

    const updateData: any = {};
    if (updates.taken_year !== undefined) updateData.taken_year = updates.taken_year;
    if (updates.taken_location !== undefined) updateData.taken_location = updates.taken_location;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.category !== undefined) updateData.category = updates.category;
    if (updates.privacy_level !== undefined) updateData.privacy_level = updates.privacy_level;

    await this.prisma.mediaArchive.updateMany({
      where: {
        id: { in: ids.map((id: string) => BigInt(id)) },
        clan_id: clanId,
      },
      data: updateData,
    });

    await this.adminService.logAction({
      clanId,
      userId,
      action: 'BATCH_UPDATE_MEDIA',
      targetType: 'MediaArchive',
      targetId: ids.join(','),
      details: `批量更新 ${ids.length} 个影像`,
    });

    return { success: true, count: ids.length };
  }

  /**
   * 批量删除
   */
  @Post('batch-delete')
  @ApiOperation({ summary: '批量删除影像' })
  async batchDelete(
    @Request() req,
    @Body() body: any,
  ) {
    const userId = req.user.userId;
    const clanId = BigInt(body.clanId);

    await this.adminService.requireAdmin(clanId, userId);

    const { ids } = body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      throw new Error('ids is required and must be non-empty array');
    }

    await this.prisma.mediaArchive.updateMany({
      where: {
        id: { in: ids.map((id: string) => BigInt(id)) },
        clan_id: clanId,
      },
      data: {
        deleted_at: new Date(),
        deleted_by: userId,
      },
    });

    await this.adminService.logAction({
      clanId,
      userId,
      action: 'BATCH_DELETE_MEDIA',
      targetType: 'MediaArchive',
      targetId: ids.join(','),
      details: `批量删除 ${ids.length} 个影像`,
    });

    return { success: true, count: ids.length };
  }

  /**
   * 设为封面
   */
  @Post(':id/set-cover')
  @ApiOperation({ summary: '设为封面' })
  async setAsCover(
    @Request() req,
    @Param('id') id: string,
    @Query('clanId') clanIdStr: string,
  ) {
    const userId = req.user.userId;
    const clanId = BigInt(clanIdStr);

    await this.adminService.requireAdmin(clanId, userId);

    // 先取消该相册下其他图片的封面状态
    const media = await this.prisma.mediaArchive.findUnique({
      where: { id: BigInt(id) },
      select: { album_id: true },
    });

    if (media?.album_id) {
      await this.prisma.mediaArchive.updateMany({
        where: {
          album_id: media.album_id,
          id: { not: BigInt(id) },
        },
        data: { is_cover: false },
      });
    }

    const updated = await this.prisma.mediaArchive.update({
      where: { id: BigInt(id) },
      data: { is_cover: true },
    });

    await this.adminService.logAction({
      clanId,
      userId,
      action: 'SET_MEDIA_AS_COVER',
      targetType: 'MediaArchive',
      targetId: id,
      details: `设置影像为封面`,
    });

    return { success: true };
  }

  /**
   * 获取相册列表
   */
  @Get('../albums/list')
  @ApiOperation({ summary: '获取相册列表' })
  async getAlbums(
    @Request() req,
    @Query('clanId') clanIdStr: string,
  ) {
    const userId = req.user.userId;
    const clanId = BigInt(clanIdStr);

    await this.adminService.requireAdmin(clanId, userId);

    const albums = await this.prisma.clanAlbum.findMany({
      where: { clan_id: clanId },
      orderBy: { created_at: 'desc' },
    });

    return {
      data: albums.map((a) => ({
        id: a.id.toString(),
        name: a.name,
        description: a.description,
        cover_url: a.cover_url,
        default_privacy: a.default_privacy,
        photo_count: a.photo_count,
        created_at: a.created_at,
      })),
      total: albums.length,
    };
  }

  /**
   * 创建相册
   */
  @Post('../albums')
  @ApiOperation({ summary: '创建相册' })
  async createAlbum(
    @Request() req,
    @Body() body: any,
  ) {
    const userId = req.user.userId;
    const clanId = BigInt(body.clanId);

    await this.adminService.requireAdmin(clanId, userId);

    const album = await this.prisma.clanAlbum.create({
      data: {
        clan_id: clanId,
        name: body.name,
        description: body.description,
        cover_url: body.cover_url,
        default_privacy: body.default_privacy || 'clan',
        creator_id: userId,
      },
    });

    await this.adminService.logAction({
      clanId,
      userId,
      action: 'CREATE_ALBUM',
      targetType: 'ClanAlbum',
      targetId: album.id.toString(),
      details: `创建相册: ${body.name}`,
    });

    return {
      id: album.id.toString(),
      name: album.name,
      created_at: album.created_at,
    };
  }

  /**
   * 更新相册
   */
  @Put('../albums/:id')
  @ApiOperation({ summary: '更新相册' })
  async updateAlbum(
    @Request() req,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    const userId = req.user.userId;
    const clanId = BigInt(body.clanId);

    await this.adminService.requireAdmin(clanId, userId);

    const updateData: any = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.cover_url !== undefined) updateData.cover_url = body.cover_url;
    if (body.default_privacy !== undefined) updateData.default_privacy = body.default_privacy;

    const album = await this.prisma.clanAlbum.update({
      where: { id: BigInt(id) },
      data: updateData,
    });

    await this.adminService.logAction({
      clanId,
      userId,
      action: 'UPDATE_ALBUM',
      targetType: 'ClanAlbum',
      targetId: id,
      details: `更新相册: ${body.name}`,
    });

    return {
      id: album.id.toString(),
      updated_at: album.updated_at,
    };
  }

  /**
   * 删除相册
   */
  @Delete('../albums/:id')
  @ApiOperation({ summary: '删除相册' })
  async deleteAlbum(
    @Request() req,
    @Param('id') id: string,
    @Query('clanId') clanIdStr: string,
  ) {
    const userId = req.user.userId;
    const clanId = BigInt(clanIdStr);

    await this.adminService.requireAdmin(clanId, userId);

    // 将相册中的照片移到"未分类"
    await this.prisma.mediaArchive.updateMany({
      where: { album_id: BigInt(id) },
      data: { album_id: null },
    });

    await this.prisma.clanAlbum.delete({
      where: { id: BigInt(id) },
    });

    await this.adminService.logAction({
      clanId,
      userId,
      action: 'DELETE_ALBUM',
      targetType: 'ClanAlbum',
      targetId: id,
      details: `删除相册`,
    });

    return { success: true };
  }
}
