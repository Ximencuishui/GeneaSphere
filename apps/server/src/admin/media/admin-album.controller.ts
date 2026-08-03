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

/**
 * 相册管理。
 *
 * 历史注记：原 AdminMediaController 里用 `@Get('../albums/list')` 把方法从
 * `api/admin/media` 控制器"溢出"到 `api/admin/albums`，与 `@Get(':id')` 冲突，
 * NestJS 把 `albums` 解析成 `:id` 参数，Prisma 后续 BigInt 转换 500。
 *
 * 现拆为独立 controller（路径 `api/admin/albums`），路由稳定。
 */
@ApiTags('admin/albums')
@Controller('api/admin/albums')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AdminAlbumController {
  constructor(
    private readonly adminService: AdminService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * 获取相册列表（list 别名）
   */
  @Get()
  @ApiOperation({ summary: '获取相册列表（直接访问）' })
  async getAlbumsRoot(
    @Request() req,
    @Query('clanSlug') clanSlug: string,
  ) {
    return this.getAlbums(req, clanSlug);
  }

  /**
   * 获取相册列表
   */
  @Get('list')
  @ApiOperation({ summary: '获取相册列表' })
  async getAlbums(
    @Request() req,
    @Query('clanSlug') clanSlug: string,
  ) {
    const userId = req.user.userId;
    const clanId = await this.adminService.requireAdminBySlug(clanSlug, userId);

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
  @Post()
  @ApiOperation({ summary: '创建相册' })
  async createAlbum(
    @Request() req,
    @Body() body: any,
  ) {
    const userId = req.user.userId;
    const clanId = await this.adminService.requireAdminBySlug(body.clanSlug, userId);

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
  @Put(':id')
  @ApiOperation({ summary: '更新相册' })
  async updateAlbum(
    @Request() req,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    const userId = req.user.userId;
    const clanId = await this.adminService.requireAdminBySlug(body.clanSlug, userId);

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
  @Delete(':id')
  @ApiOperation({ summary: '删除相册' })
  async deleteAlbum(
    @Request() req,
    @Param('id') id: string,
    @Query('clanSlug') clanSlug: string,
  ) {
    const userId = req.user.userId;
    const clanId = await this.adminService.requireAdminBySlug(clanSlug, userId);

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
