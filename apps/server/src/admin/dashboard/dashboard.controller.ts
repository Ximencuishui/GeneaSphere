import { Controller, Get, UseGuards, Request, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminService } from '../admin.service';
import { PrismaService } from '@geneasphere/db';

@ApiTags('admin/dashboard')
@Controller('api/admin/dashboard')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DashboardController {
  constructor(
    private readonly adminService: AdminService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get dashboard statistics' })
  async getDashboard(@Request() req) {
    const userId = req.user.userId;
    const clanId = BigInt(req.query.clanId || '0');

    if (clanId === BigInt(0)) {
      throw new ForbiddenException('clanId is required');
    }

    await this.adminService.requireAdmin(clanId, userId);

    const [
      totalMembers,
      livingCount,
      photoCount,
      storageUsed,
      pendingMediaReviews,
      pendingApplications,
    ] = await Promise.all([
      this.prisma.person.count({
        where: { clan_id: clanId },
      }),
      this.prisma.person.count({
        where: { clan_id: clanId, is_living: true },
      }),
      this.prisma.mediaArchive.count({
        where: { clan_id: clanId },
      }),
      this.getStorageUsage(clanId),
      this.prisma.mediaReview.count({
        where: { media: { clan_id: clanId }, status: 'PENDING' },
      }),
      this.prisma.mergeApplication.count({
        where: { clan_id: clanId, status: 'PENDING' },
      }),
    ]);

    // 获取最近5条待审核内容
    const recentReviews = await this.prisma.mediaReview.findMany({
      where: { media: { clan_id: clanId }, status: 'PENDING' },
      include: { media: true },
      orderBy: { created_at: 'desc' },
      take: 5,
    });

    return {
      statistics: {
        total_members: totalMembers,
        living_count: livingCount,
        photo_count: photoCount,
        storage_used: storageUsed,
        storage_percentage: await this.getStoragePercentage(clanId),
        pending_media_reviews: pendingMediaReviews,
        pending_applications: pendingApplications,
      },
      recent_reviews: recentReviews.map(r => ({
        id: r.id.toString(),
        media_id: r.media_id.toString(),
        media_url: r.media.file_url,
        uploader_id: r.media.uploader_id,
        created_at: r.created_at,
      })),
    };
  }

  private async getStorageUsage(clanId: bigint): Promise<number> {
    const result = await this.prisma.$queryRaw<[{ total_size: bigint }]>`
      SELECT COALESCE(SUM(file_size), 0) as total_size
      FROM media_archives
      WHERE clan_id = ${clanId}
    `;
    return Number(result[0]?.total_size || 0);
  }

  private async getStoragePercentage(clanId: bigint): Promise<number> {
    // 假设免费存储空间为 5GB
    const maxStorage = 5 * 1024 * 1024 * 1024;
    const used = await this.getStorageUsage(clanId);
    return Math.round((used / maxStorage) * 100);
  }
}
