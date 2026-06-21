import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, Request, NotFoundException, BadRequestException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminService } from '../admin.service';
import { PrismaService } from '@geneasphere/db';
import { ReviewStatus } from '@prisma/client';

@ApiTags('admin/reviews')
@Controller('api/admin/reviews')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ReviewsController {
  constructor(
    private readonly adminService: AdminService,
    private readonly prisma: PrismaService,
  ) {}

  // ==================== 影像审核 ====================

  /**
   * 获取待审核影像列表
   */
  @Get('media')
  @ApiOperation({ summary: 'Get pending media reviews' })
  async getMediaReviews(
    @Request() req,
    @Query('clanId') clanIdStr: string,
    @Query('page') pageStr = '1',
    @Query('pageSize') pageSizeStr = '20',
    @Query('status') status = 'PENDING',
  ) {
    const userId = req.user.userId;
    const clanId = BigInt(clanIdStr);

    await this.adminService.requireAdmin(clanId, userId);

    const page = parseInt(pageStr) || 1;
    const pageSize = parseInt(pageSizeStr) || 20;
    const skip = (page - 1) * pageSize;

    const [reviews, total] = await Promise.all([
      this.prisma.mediaReview.findMany({
        where: {
          media: { clan_id: clanId },
          status: status as ReviewStatus,
        },
        include: {
          media: true,
          reviewer: { select: { id: true, phone: true } },
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.mediaReview.count({
        where: {
          media: { clan_id: clanId },
          status: status as ReviewStatus,
        },
      }),
    ]);

    return {
      data: reviews.map(r => ({
        id: r.id.toString(),
        media_id: r.media_id.toString(),
        media_url: r.media.file_url,
        thumbnail_url: r.media.file_url, // 可以用缩略图服务
        uploader_id: r.media.uploader_id,
        taken_year: r.media.taken_year,
        taken_location: r.media.taken_location,
        description: r.media.description,
        status: r.status,
        reject_reason: r.reject_reason,
        created_at: r.created_at,
        reviewed_at: r.reviewed_at,
      })),
      pagination: {
        page,
        page_size: pageSize,
        total,
        total_pages: Math.ceil(total / pageSize),
      },
    };
  }

  /**
   * 通过影像审核
   */
  @Post('media/:id/approve')
  @ApiOperation({ summary: 'Approve media review' })
  async approveMedia(
    @Request() req,
    @Param('id') reviewIdStr: string,
  ) {
    const userId = req.user.userId;
    const reviewId = BigInt(reviewIdStr);

    const review = await this.prisma.mediaReview.findUnique({
      where: { id: reviewId },
      include: { media: true },
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    await this.adminService.requireAdmin(review.media.clan_id, userId);

    const updated = await this.prisma.mediaReview.update({
      where: { id: reviewId },
      data: {
        status: ReviewStatus.APPROVED,
        reviewer_id: userId,
        reviewed_at: new Date(),
      },
    });

    await this.adminService.logAction({
      clanId: review.media.clan_id,
      userId,
      action: 'APPROVE_MEDIA',
      targetType: 'MediaArchive',
      targetId: review.media_id.toString(),
    });

    return { message: 'Media approved successfully', status: updated.status };
  }

  /**
   * 驳回影像审核
   */
  @Post('media/:id/reject')
  @ApiOperation({ summary: 'Reject media review' })
  async rejectMedia(
    @Request() req,
    @Param('id') reviewIdStr: string,
    @Body() body: { reason: string; custom_reason?: string },
  ) {
    const userId = req.user.userId;
    const reviewId = BigInt(reviewIdStr);

    if (!body.reason) {
      throw new BadRequestException('Reject reason is required');
    }

    const review = await this.prisma.mediaReview.findUnique({
      where: { id: reviewId },
      include: { media: true },
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    await this.adminService.requireAdmin(review.media.clan_id, userId);

    const rejectReason = body.custom_reason
      ? `${body.reason}: ${body.custom_reason}`
      : body.reason;

    const updated = await this.prisma.mediaReview.update({
      where: { id: reviewId },
      data: {
        status: ReviewStatus.REJECTED,
        reject_reason: rejectReason,
        reviewer_id: userId,
        reviewed_at: new Date(),
      },
    });

    // TODO: 发送通知给上传者

    await this.adminService.logAction({
      clanId: review.media.clan_id,
      userId,
      action: 'REJECT_MEDIA',
      targetType: 'MediaArchive',
      targetId: review.media_id.toString(),
      details: rejectReason,
    });

    return { message: 'Media rejected successfully', status: updated.status };
  }

  // ==================== 生平审核 ====================

  /**
   * 获取待审核生平列表
   */
  @Get('bio')
  @ApiOperation({ summary: 'Get pending biography reviews' })
  async getBioReviews(
    @Request() req,
    @Query('clanId') clanIdStr: string,
    @Query('page') pageStr = '1',
    @Query('pageSize') pageSizeStr = '20',
    @Query('status') status = 'PENDING',
  ) {
    const userId = req.user.userId;
    const clanId = BigInt(clanIdStr);

    await this.adminService.requireAdmin(clanId, userId);

    const page = parseInt(pageStr) || 1;
    const pageSize = parseInt(pageSizeStr) || 20;
    const skip = (page - 1) * pageSize;

    const [reviews, total] = await Promise.all([
      this.prisma.bioReview.findMany({
        where: {
          person: { clan_id: clanId },
          status: status as ReviewStatus,
        },
        include: {
          person: { select: { id: true, full_name: true } },
          author: { select: { id: true, phone: true } },
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.bioReview.count({
        where: {
          person: { clan_id: clanId },
          status: status as ReviewStatus,
        },
      }),
    ]);

    return {
      data: reviews.map(r => ({
        id: r.id.toString(),
        person_id: r.person_id.toString(),
        person_name: r.person.full_name,
        title: r.title,
        content: r.content,
        author_id: r.author_id,
        author_phone: r.author.phone,
        status: r.status,
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

  /**
   * 通过生平审核
   */
  @Post('bio/:id/approve')
  @ApiOperation({ summary: 'Approve biography review' })
  async approveBio(
    @Request() req,
    @Param('id') reviewIdStr: string,
  ) {
    const userId = req.user.userId;
    const reviewId = BigInt(reviewIdStr);

    const review = await this.prisma.bioReview.findUnique({
      where: { id: reviewId },
      include: { person: true },
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    await this.adminService.requireAdmin(review.person.clan_id, userId);

    const updated = await this.prisma.bioReview.update({
      where: { id: reviewId },
      data: {
        status: ReviewStatus.APPROVED,
        reviewer_id: userId,
        reviewed_at: new Date(),
      },
    });

    await this.adminService.logAction({
      clanId: review.person.clan_id,
      userId,
      action: 'APPROVE_BIO',
      targetType: 'Person',
      targetId: review.person_id.toString(),
    });

    return { message: 'Biography approved successfully', status: updated.status };
  }

  /**
   * 驳回生平审核
   */
  @Post('bio/:id/reject')
  @ApiOperation({ summary: 'Reject biography review' })
  async rejectBio(
    @Request() req,
    @Param('id') reviewIdStr: string,
    @Body() body: { reason: string; custom_reason?: string },
  ) {
    const userId = req.user.userId;
    const reviewId = BigInt(reviewIdStr);

    if (!body.reason) {
      throw new BadRequestException('Reject reason is required');
    }

    const review = await this.prisma.bioReview.findUnique({
      where: { id: reviewId },
      include: { person: true },
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    await this.adminService.requireAdmin(review.person.clan_id, userId);

    const rejectReason = body.custom_reason
      ? `${body.reason}: ${body.custom_reason}`
      : body.reason;

    const updated = await this.prisma.bioReview.update({
      where: { id: reviewId },
      data: {
        status: ReviewStatus.REJECTED,
        reject_reason: rejectReason,
        reviewer_id: userId,
        reviewed_at: new Date(),
      },
    });

    await this.adminService.logAction({
      clanId: review.person.clan_id,
      userId,
      action: 'REJECT_BIO',
      targetType: 'Person',
      targetId: review.person_id.toString(),
      details: rejectReason,
    });

    return { message: 'Biography rejected successfully', status: updated.status };
  }
}
