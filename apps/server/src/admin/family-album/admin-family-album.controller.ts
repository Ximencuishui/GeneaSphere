import {
  Controller,
  Get,
  Put,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminService } from '../admin.service';
import { PrismaService } from '@geneasphere/db';

@ApiTags('admin/family-albums')
@Controller('api/admin/family-albums')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AdminFamilyAlbumController {
  constructor(
    private readonly adminService: AdminService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * 获取家庭图册列表
   */
  @Get()
  @ApiOperation({ summary: '获取家庭图册列表' })
  async getFamilyAlbums(
    @Request() req,
    @Query('clanSlug') clanSlug: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
    @Query('filterUserId') filterUserId?: string,
  ) {
    const currentUserId = req.user.userId;
    const clanId = await this.adminService.requireAdminBySlug(clanSlug, currentUserId);


    const pageNum = parseInt(page || '1', 10);
    const pageSizeNum = parseInt(pageSize || '20', 10);
    const skip = (pageNum - 1) * pageSizeNum;

    const where: any = { clan_id: clanId };

    if (status && status !== 'all') {
      where.status = status.toLowerCase();
    }

    if (filterUserId) {
      where.user_id = filterUserId;
    }

    const [albums, total] = await Promise.all([
      this.prisma.familyBookProject.findMany({
        where,
        include: {
          user: {
            select: { id: true, phone: true, nickname: true },
          },
          start_person: {
            select: { id: true, full_name: true, avatar_url: true },
          },
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: pageSizeNum,
      }),
      this.prisma.familyBookProject.count({ where }),
    ]);

    return {
      data: albums.map((a) => ({
        id: a.id.toString(),
        title: a.title,
        status: a.status,
        cover_template: a.cover_template,
        generations: a.generations,
        include_spouse: a.include_spouse,
        page_count: a.page_count,
        person_count: a.person_count,
        estimated_price: a.estimated_price,
        user_name: a.user.nickname || a.user.phone,
        start_person: a.start_person ? {
          id: a.start_person.id.toString(),
          name: a.start_person.full_name,
          avatar: a.start_person.avatar_url,
        } : null,
        created_at: a.created_at,
        updated_at: a.updated_at,
      })),
      total,
      page: pageNum,
      pageSize: pageSizeNum,
      totalPages: Math.ceil(total / pageSizeNum),
    };
  }

  /**
   * 获取图册详情
   */
  @Get(':id')
  @ApiOperation({ summary: '获取图册详情' })
  async getFamilyAlbumDetail(
    @Request() req,
    @Param('id') id: string,
    @Query('clanSlug') clanSlug: string,
  ) {
    const userId = req.user.userId;
    const clanId = await this.adminService.requireAdminBySlug(clanSlug, userId);


    const album = await this.prisma.familyBookProject.findUnique({
      where: { id: BigInt(id) },
      include: {
        user: {
          select: { id: true, phone: true, nickname: true },
        },
        start_person: {
          select: { id: true, full_name: true, avatar_url: true },
        },
        pages: {
          orderBy: { page_number: 'asc' },
        },
      },
    });

    if (!album) {
      throw new Error('Family album not found');
    }

    return {
      id: album.id.toString(),
      title: album.title,
      preface: album.preface,
      status: album.status,
      cover_template: album.cover_template,
      generations: album.generations,
      include_spouse: album.include_spouse,
      grouping: album.grouping,
      selected_fields: album.selected_fields,
      page_count: album.page_count,
      person_count: album.person_count,
      estimated_price: album.estimated_price,
      user_name: album.user.nickname || album.user.phone,
      start_person: album.start_person ? {
        id: album.start_person.id.toString(),
        name: album.start_person.full_name,
        avatar: album.start_person.avatar_url,
      } : null,
      pages: album.pages.map((p) => ({
        id: p.id.toString(),
        page_number: p.page_number,
        page_type: p.page_type,
        title: p.title,
        subtitle: p.subtitle,
        content: p.content,
      })),
      created_at: album.created_at,
      updated_at: album.updated_at,
    };
  }

  /**
   * 更新图册
   */
  @Put(':id')
  @ApiOperation({ summary: '更新图册' })
  async updateFamilyAlbum(
    @Request() req,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    const userId = req.user.userId;
    const clanId = await this.adminService.requireAdminBySlug(body.clanSlug, userId);


    const updateData: any = {};

    if (body.title !== undefined) updateData.title = body.title;
    if (body.preface !== undefined) updateData.preface = body.preface;
    if (body.status !== undefined) updateData.status = body.status;

    const album = await this.prisma.familyBookProject.update({
      where: { id: BigInt(id) },
      data: updateData,
    });

    await this.adminService.logAction({
      clanId,
      userId,
      action: 'UPDATE_FAMILY_ALBUM',
      targetType: 'FamilyBookProject',
      targetId: id,
      details: `更新家庭图册: ${body.title}`,
    });

    return {
      id: album.id.toString(),
      updated_at: album.updated_at,
    };
  }

  /**
   * 删除图册
   */
  @Delete(':id')
  @ApiOperation({ summary: '删除图册' })
  async deleteFamilyAlbum(
    @Request() req,
    @Param('id') id: string,
    @Query('clanSlug') clanSlug: string,
  ) {
    const userId = req.user.userId;
    const clanId = await this.adminService.requireAdminBySlug(clanSlug, userId);


    const album = await this.prisma.familyBookProject.findUnique({
      where: { id: BigInt(id) },
    });

    if (!album) {
      throw new Error('Family album not found');
    }

    // 删除关联的页面
    await this.prisma.familyBookPage.deleteMany({
      where: { project_id: BigInt(id) },
    });

    // 删除图册项目
    await this.prisma.familyBookProject.delete({
      where: { id: BigInt(id) },
    });

    await this.adminService.logAction({
      clanId,
      userId,
      action: 'DELETE_FAMILY_ALBUM',
      targetType: 'FamilyBookProject',
      targetId: id,
      details: `删除家庭图册: ${album.title}`,
    });

    return { success: true };
  }

  /**
   * 获取图册统计数据
   */
  @Get('stats/overview')
  @ApiOperation({ summary: '获取家庭图册统计' })
  async getStats(
    @Request() req,
    @Query('clanSlug') clanSlug: string,
  ) {
    const userId = req.user.userId;
    const clanId = await this.adminService.requireAdminBySlug(clanSlug, userId);


    const [
      totalAlbums,
      draftCount,
      previewCount,
      orderedCount,
      totalPages,
      totalPersons,
    ] = await Promise.all([
      this.prisma.familyBookProject.count({
        where: { clan_id: clanId },
      }),
      this.prisma.familyBookProject.count({
        where: { clan_id: clanId, status: 'draft' },
      }),
      this.prisma.familyBookProject.count({
        where: { clan_id: clanId, status: 'preview' },
      }),
      this.prisma.familyBookProject.count({
        where: { clan_id: clanId, status: 'ordered' },
      }),
      this.prisma.familyBookPage.count({
        where: { project: { clan_id: clanId } },
      }),
      this.prisma.familyBookProject.aggregate({
        where: { clan_id: clanId },
        _sum: { page_count: true, person_count: true },
      }),
    ]);

    return {
      total: totalAlbums,
      by_status: {
        draft: draftCount,
        preview: previewCount,
        ordered: orderedCount,
      },
      totals: {
        pages: totalPages,
        persons: Number(totalPersons._sum?.person_count || 0),
      },
    };
  }
}
