import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '@geneasphere/db';
import { ReviewStatus } from '@prisma/client';
import { PlatformAuthGuard } from '../auth/platform-auth.guard';
import { PlatformOperationLogService } from '../common/platform-operation-log.service';
import { getClientIp } from '../common/ip.util';
import { ClanResolverService } from '../../common/clan-resolver.service';

@ApiTags('platform/reviews')
@ApiBearerAuth('platform')
@UseGuards(PlatformAuthGuard)
@Controller('api/platform/reviews')
export class ContentReviewsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logService: PlatformOperationLogService,
    private readonly clanResolver: ClanResolverService,
  ) {}

  // ==================== 影像审核 ====================

  @Get('media')
  @ApiOperation({ summary: '全平台待审核影像' })
  async mediaList(
    @Query('status') status = 'PENDING',
    @Query('clanSlug') clanSlug?: string,
    @Query('startDate') startDateStr?: string,
    @Query('endDate') endDateStr?: string,
    @Query('page') pageStr = '1',
    @Query('pageSize') pageSizeStr = '20',
  ) {
    const page = parseInt(pageStr) || 1;
    const pageSize = parseInt(pageSizeStr) || 20;
    const skip = (page - 1) * pageSize;

    const where: any = { status: status as ReviewStatus };
    if (clanSlug) {
      // 平台管理端可按 clanSlug 筛选（解析为 bigint 后用于数据库过滤）
      const { id: clanIdBig } = await this.clanResolver.resolveOrThrow(clanSlug);
      where.media = { clan_id: clanIdBig };
    }
    if (startDateStr || endDateStr) {
      where.created_at = {};
      if (startDateStr) where.created_at.gte = new Date(startDateStr);
      if (endDateStr) where.created_at.lte = new Date(endDateStr);
    }

    const [items, total] = await Promise.all([
      this.prisma.mediaReview.findMany({
        where,
        include: {
          media: { include: { clan: { select: { id: true, name: true } } } },
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.mediaReview.count({ where }),
    ]);

    return {
      data: items.map((r) => ({
        id: r.id.toString(),
        media_id: r.media_id.toString(),
        media_url: r.media.file_url,
        media_type: (r.media as any).media_type,
        file_size: Number((r.media as any).file_size || 0),
        uploader_id: r.media.uploader_id,
        clan: { id: r.media.clan.id.toString(), name: r.media.clan.name },
        taken_year: r.media.taken_year,
        taken_location: r.media.taken_location,
        description: r.media.description,
        status: r.status,
        reject_reason: r.reject_reason,
        reviewed_at: r.reviewed_at,
        created_at: r.created_at,
      })),
      pagination: {
        page,
        page_size: pageSize,
        total,
        total_pages: Math.ceil(total / pageSize),
      },
    };
  }

  @Post('media/:id/approve')
  @ApiOperation({ summary: '通过影像审核' })
  async approveMedia(@Param('id') idStr: string, @Request() req: any) {
    const id = BigInt(idStr);
    const review = await this.prisma.mediaReview.findUnique({ where: { id } });
    if (!review) throw new NotFoundException('审核记录不存在');
    const updated = await this.prisma.mediaReview.update({
      where: { id },
      data: {
        status: ReviewStatus.APPROVED,
        reviewed_at: new Date(),
      },
    });
    await this.logService.log({
      adminId: req.user.adminId,
      actionType: 'PLATFORM_APPROVE_MEDIA',
      targetType: 'MediaArchive',
      targetId: review.media_id.toString(),
      ipAddress: getClientIp(req),
    });
    return { message: '已通过', status: updated.status };
  }

  @Post('media/:id/reject')
  @ApiOperation({ summary: '驳回影像审核' })
  async rejectMedia(
    @Param('id') idStr: string,
    @Body() body: { reason: string },
    @Request() req: any,
  ) {
    if (!body.reason) throw new BadRequestException('请填写驳回理由');
    const id = BigInt(idStr);
    const review = await this.prisma.mediaReview.findUnique({ where: { id } });
    if (!review) throw new NotFoundException('审核记录不存在');
    const updated = await this.prisma.mediaReview.update({
      where: { id },
      data: {
        status: ReviewStatus.REJECTED,
        reject_reason: body.reason,
        reviewed_at: new Date(),
      },
    });
    await this.logService.log({
      adminId: req.user.adminId,
      actionType: 'PLATFORM_REJECT_MEDIA',
      targetType: 'MediaArchive',
      targetId: review.media_id.toString(),
      detail: { reason: body.reason },
      ipAddress: getClientIp(req),
    });
    return { message: '已驳回', status: updated.status };
  }

  @Post('media/:id/delete')
  @ApiOperation({ summary: '违规删除影像' })
  async deleteMedia(@Param('id') idStr: string, @Request() req: any) {
    const id = BigInt(idStr);
    const review = await this.prisma.mediaReview.findUnique({ where: { id } });
    if (!review) throw new NotFoundException('审核记录不存在');
    await this.prisma.$transaction([
      this.prisma.mediaReview.delete({ where: { id } }),
      this.prisma.mediaArchive.delete({ where: { id: review.media_id } }),
    ]);
    await this.logService.log({
      adminId: req.user.adminId,
      actionType: 'PLATFORM_DELETE_MEDIA',
      targetType: 'MediaArchive',
      targetId: review.media_id.toString(),
      ipAddress: getClientIp(req),
    });
    return { message: '已删除违规影像' };
  }

  // ==================== 寻亲帖审核 ====================

  @Get('posts')
  @ApiOperation({ summary: '全平台寻亲帖' })
  async postList(
    @Query('status') status?: string,
    @Query('keyword') keyword?: string,
    @Query('page') pageStr = '1',
    @Query('pageSize') pageSizeStr = '20',
  ) {
    const page = parseInt(pageStr) || 1;
    const pageSize = parseInt(pageSizeStr) || 20;
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (status) where.status = status;
    if (keyword) {
      where.OR = [
        { origin_place: { contains: keyword, mode: 'insensitive' } },
        { xipai_keywords: { has: keyword } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.searchPost.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.searchPost.count({ where }),
    ]);

    return {
      data: items.map((p) => ({
        id: p.id.toString(),
        origin_place: p.origin_place,
        xipai_keywords: p.xipai_keywords,
        contact_info: p.contact_info,
        status: p.status,
        reject_reason: p.reject_reason,
        reviewed_at: p.reviewed_at,
        created_by: p.created_by,
        created_at: p.created_at,
      })),
      pagination: {
        page,
        page_size: pageSize,
        total,
        total_pages: Math.ceil(total / pageSize),
      },
    };
  }

  @Post('posts/:id/approve')
  @ApiOperation({ summary: '通过寻亲帖审核' })
  async approvePost(@Param('id') idStr: string, @Request() req: any) {
    const id = BigInt(idStr);
    const post = await this.prisma.searchPost.findUnique({ where: { id } });
    if (!post) throw new NotFoundException('寻亲帖不存在');
    const updated = await this.prisma.searchPost.update({
      where: { id },
      data: {
        status: 'PUBLISHED' as any,
        reviewed_at: new Date(),
        reviewer_id: BigInt(req.user.adminId),
      },
    });
    await this.logService.log({
      adminId: req.user.adminId,
      actionType: 'PLATFORM_APPROVE_POST',
      targetType: 'SearchPost',
      targetId: idStr,
      ipAddress: getClientIp(req),
    });
    return { message: '已通过', status: updated.status };
  }

  @Post('posts/:id/remove')
  @ApiOperation({ summary: '下架寻亲帖' })
  async removePost(
    @Param('id') idStr: string,
    @Body() body: { reason: string },
    @Request() req: any,
  ) {
    if (!body.reason) throw new BadRequestException('请填写下架理由');
    const id = BigInt(idStr);
    const post = await this.prisma.searchPost.findUnique({ where: { id } });
    if (!post) throw new NotFoundException('寻亲帖不存在');
    const updated = await this.prisma.searchPost.update({
      where: { id },
      data: {
        status: 'REMOVED' as any,
        reject_reason: body.reason,
        reviewed_at: new Date(),
        reviewer_id: BigInt(req.user.adminId),
      },
    });
    await this.logService.log({
      adminId: req.user.adminId,
      actionType: 'PLATFORM_REMOVE_POST',
      targetType: 'SearchPost',
      targetId: idStr,
      detail: { reason: body.reason },
      ipAddress: getClientIp(req),
    });
    return { message: '已下架', status: updated.status };
  }

  // ==================== 举报管理 ====================
  // v1.0 阶段将违规内容呈现为 status=REJECTED/REMOVED 的列表

  @Get('reports')
  @ApiOperation({ summary: '违规内容举报（违规内容汇总）' })
  async reports(
    @Query('type') type = 'all',
    @Query('page') pageStr = '1',
    @Query('pageSize') pageSizeStr = '20',
  ) {
    const page = parseInt(pageStr) || 1;
    const pageSize = parseInt(pageSizeStr) || 20;
    const skip = (page - 1) * pageSize;

    if (type === 'media' || type === 'all') {
      const [rejectedMedia, totalMedia] = await Promise.all([
        this.prisma.mediaReview.findMany({
          where: { status: 'REJECTED' as any },
          include: { media: true },
          orderBy: { reviewed_at: 'desc' },
          skip: type === 'media' ? skip : 0,
          take: type === 'media' ? pageSize : 5,
        }),
        this.prisma.mediaReview.count({ where: { status: 'REJECTED' as any } }),
      ]);
      if (type === 'media') {
        return {
          data: rejectedMedia.map((r) => ({
            id: r.id.toString(),
            type: 'media',
            target_id: r.media_id.toString(),
            media_url: r.media.file_url,
            reject_reason: r.reject_reason,
            reviewed_at: r.reviewed_at,
          })),
          pagination: { page, page_size: pageSize, total: totalMedia, total_pages: Math.ceil(totalMedia / pageSize) },
        };
      }
    }

    if (type === 'post' || type === 'all') {
      const [removedPosts, totalPosts] = await Promise.all([
        this.prisma.searchPost.findMany({
          where: { status: 'REMOVED' as any },
          orderBy: { reviewed_at: 'desc' },
          take: type === 'post' ? pageSize : 5,
        }),
        this.prisma.searchPost.count({ where: { status: 'REMOVED' as any } }),
      ]);
      if (type === 'post') {
        return {
          data: removedPosts.map((p) => ({
            id: p.id.toString(),
            type: 'post',
            target_id: p.id.toString(),
            origin_place: p.origin_place,
            reject_reason: p.reject_reason,
            reviewed_at: p.reviewed_at,
          })),
          pagination: { page, page_size: pageSize, total: totalPosts, total_pages: Math.ceil(totalPosts / pageSize) },
        };
      }
    }

    return { data: [], pagination: { page, page_size: pageSize, total: 0, total_pages: 0 } };
  }
}
