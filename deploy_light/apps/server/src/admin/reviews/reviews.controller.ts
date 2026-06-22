import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, Request, NotFoundException, BadRequestException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminService } from '../admin.service';
import { PrismaService } from '@geneasphere/db';
import { ReviewStatus } from '@prisma/client';
import { NotificationService } from '../../common/notification.service';

@ApiTags('admin/reviews')
@Controller('api/admin/reviews')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ReviewsController {
  constructor(
    private readonly adminService: AdminService,
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
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

    // 发送通知给上传者
    await this.notificationService.notifyMediaReview({
      uploaderId: review.media.uploader_id,
      clanId: review.media.clan_id,
      mediaId: review.media_id.toString(),
      approved: false,
      reason: rejectReason,
    }).catch((err) => console.error('Failed to send notification:', err));

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

  /**
   * 批量通过影像审核
   */
  @Post('media/batch-approve')
  @ApiOperation({ summary: 'Batch approve media reviews' })
  async batchApproveMedia(
    @Request() req,
    @Body() body: { reviewIds: string[] },
  ) {
    const userId = req.user.userId;

    if (!body.reviewIds || body.reviewIds.length === 0) {
      throw new BadRequestException('reviewIds is required');
    }

    const reviewIds = body.reviewIds.map((id) => BigInt(id));

    // 获取所有待审核记录
    const reviews = await this.prisma.mediaReview.findMany({
      where: {
        id: { in: reviewIds },
        status: ReviewStatus.PENDING,
      },
      include: { media: true },
    });

    if (reviews.length === 0) {
      throw new NotFoundException('No pending reviews found');
    }

    // 按 clan_id 分组进行权限校验
    const clanIds = [...new Set(reviews.map((r) => r.media.clan_id))];
    for (const clanId of clanIds) {
      await this.adminService.requireAdmin(clanId, userId);
    }

    // 批量更新
    const now = new Date();
    const result = await this.prisma.mediaReview.updateMany({
      where: {
        id: { in: reviews.map((r) => r.id) },
        status: ReviewStatus.PENDING,
      },
      data: {
        status: ReviewStatus.APPROVED,
        reviewer_id: userId,
        reviewed_at: now,
      },
    });

    // 逐个发送通知并记录日志
    await Promise.all(
      reviews.map(async (review) => {
        await this.notificationService
          .notifyMediaReview({
            uploaderId: review.media.uploader_id,
            clanId: review.media.clan_id,
            mediaId: review.media_id.toString(),
            approved: true,
          })
          .catch((err) => console.error('Notification failed:', err));

        await this.adminService.logAction({
          clanId: review.media.clan_id,
          userId,
          action: 'BATCH_APPROVE_MEDIA',
          targetType: 'MediaArchive',
          targetId: review.media_id.toString(),
          details: `Batch approved with ${reviews.length} items`,
        });
      }),
    );

    return {
      message: `Successfully approved ${result.count} reviews`,
      count: result.count,
    };
  }

  /**
   * 批量驳回影像审核
   */
  @Post('media/batch-reject')
  @ApiOperation({ summary: 'Batch reject media reviews' })
  async batchRejectMedia(
    @Request() req,
    @Body() body: { reviewIds: string[]; reason: string },
  ) {
    const userId = req.user.userId;

    if (!body.reviewIds || body.reviewIds.length === 0) {
      throw new BadRequestException('reviewIds is required');
    }
    if (!body.reason) {
      throw new BadRequestException('reason is required');
    }

    const reviewIds = body.reviewIds.map((id) => BigInt(id));

    const reviews = await this.prisma.mediaReview.findMany({
      where: {
        id: { in: reviewIds },
        status: ReviewStatus.PENDING,
      },
      include: { media: true },
    });

    if (reviews.length === 0) {
      throw new NotFoundException('No pending reviews found');
    }

    const clanIds = [...new Set(reviews.map((r) => r.media.clan_id))];
    for (const clanId of clanIds) {
      await this.adminService.requireAdmin(clanId, userId);
    }

    const now = new Date();
    const result = await this.prisma.mediaReview.updateMany({
      where: {
        id: { in: reviews.map((r) => r.id) },
        status: ReviewStatus.PENDING,
      },
      data: {
        status: ReviewStatus.REJECTED,
        reject_reason: body.reason,
        reviewer_id: userId,
        reviewed_at: now,
      },
    });

    await Promise.all(
      reviews.map(async (review) => {
        await this.notificationService
          .notifyMediaReview({
            uploaderId: review.media.uploader_id,
            clanId: review.media.clan_id,
            mediaId: review.media_id.toString(),
            approved: false,
            reason: body.reason,
          })
          .catch((err) => console.error('Notification failed:', err));

        await this.adminService.logAction({
          clanId: review.media.clan_id,
          userId,
          action: 'BATCH_REJECT_MEDIA',
          targetType: 'MediaArchive',
          targetId: review.media_id.toString(),
          details: `Batch rejected: ${body.reason}`,
        });
      }),
    );

    return {
      message: `Successfully rejected ${result.count} reviews`,
      count: result.count,
    };
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

    // 发送通知给作者
    await this.notificationService.notifyBioReview({
      authorId: review.author_id,
      clanId: review.person.clan_id,
      personId: review.person_id.toString(),
      title: review.title,
      approved: false,
      reason: rejectReason,
    }).catch((err) => console.error('Failed to send notification:', err));

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

  /**
   * 批量通过生平审核
   */
  @Post('bio/batch-approve')
  @ApiOperation({ summary: 'Batch approve bio reviews' })
  async batchApproveBio(
    @Request() req,
    @Body() body: { reviewIds: string[] },
  ) {
    const userId = req.user.userId;

    if (!body.reviewIds || body.reviewIds.length === 0) {
      throw new BadRequestException('reviewIds is required');
    }

    const reviewIds = body.reviewIds.map((id) => BigInt(id));

    const reviews = await this.prisma.bioReview.findMany({
      where: {
        id: { in: reviewIds },
        status: ReviewStatus.PENDING,
      },
      include: { person: true },
    });

    if (reviews.length === 0) {
      throw new NotFoundException('No pending reviews found');
    }

    const clanIds = [...new Set(reviews.map((r) => r.person.clan_id))];
    for (const clanId of clanIds) {
      await this.adminService.requireAdmin(clanId, userId);
    }

    const now = new Date();
    const result = await this.prisma.bioReview.updateMany({
      where: {
        id: { in: reviews.map((r) => r.id) },
        status: ReviewStatus.PENDING,
      },
      data: {
        status: ReviewStatus.APPROVED,
        reviewer_id: userId,
        reviewed_at: now,
      },
    });

    await Promise.all(
      reviews.map(async (review) => {
        await this.notificationService
          .notifyBioReview({
            authorId: review.author_id,
            clanId: review.person.clan_id,
            personId: review.person_id.toString(),
            title: review.title,
            approved: true,
          })
          .catch((err) => console.error('Notification failed:', err));

        await this.adminService.logAction({
          clanId: review.person.clan_id,
          userId,
          action: 'BATCH_APPROVE_BIO',
          targetType: 'Person',
          targetId: review.person_id.toString(),
          details: `Batch approved with ${reviews.length} items`,
        });
      }),
    );

    return {
      message: `Successfully approved ${result.count} reviews`,
      count: result.count,
    };
  }

  /**
   * 批量驳回生平审核
   */
  @Post('bio/batch-reject')
  @ApiOperation({ summary: 'Batch reject bio reviews' })
  async batchRejectBio(
    @Request() req,
    @Body() body: { reviewIds: string[]; reason: string },
  ) {
    const userId = req.user.userId;

    if (!body.reviewIds || body.reviewIds.length === 0) {
      throw new BadRequestException('reviewIds is required');
    }
    if (!body.reason) {
      throw new BadRequestException('reason is required');
    }

    const reviewIds = body.reviewIds.map((id) => BigInt(id));

    const reviews = await this.prisma.bioReview.findMany({
      where: {
        id: { in: reviewIds },
        status: ReviewStatus.PENDING,
      },
      include: { person: true },
    });

    if (reviews.length === 0) {
      throw new NotFoundException('No pending reviews found');
    }

    const clanIds = [...new Set(reviews.map((r) => r.person.clan_id))];
    for (const clanId of clanIds) {
      await this.adminService.requireAdmin(clanId, userId);
    }

    const now = new Date();
    const result = await this.prisma.bioReview.updateMany({
      where: {
        id: { in: reviews.map((r) => r.id) },
        status: ReviewStatus.PENDING,
      },
      data: {
        status: ReviewStatus.REJECTED,
        reject_reason: body.reason,
        reviewer_id: userId,
        reviewed_at: now,
      },
    });

    await Promise.all(
      reviews.map(async (review) => {
        await this.notificationService
          .notifyBioReview({
            authorId: review.author_id,
            clanId: review.person.clan_id,
            personId: review.person_id.toString(),
            title: review.title,
            approved: false,
            reason: body.reason,
          })
          .catch((err) => console.error('Notification failed:', err));

        await this.adminService.logAction({
          clanId: review.person.clan_id,
          userId,
          action: 'BATCH_REJECT_BIO',
          targetType: 'Person',
          targetId: review.person_id.toString(),
          details: `Batch rejected: ${body.reason}`,
        });
      }),
    );

    return {
      message: `Successfully rejected ${result.count} reviews`,
      count: result.count,
    };
  }
}
