import { Controller, Get, Post, Body, Param, Query, UseGuards, Request, NotFoundException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminService } from '../admin.service';
import { PrismaService } from '@geneasphere/db';
import { ApplicationStatus } from '@prisma/client';
import { ClanResolverService } from '../../common/clan-resolver.service';
import { serializeBigInt } from '../../common/bigint-serializer';
import { SEARCH_CONTACT_MASK, SearchService } from '../../search/search.service';

@ApiTags('admin/merge')
@Controller('api/admin/merge')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MergeController {
  constructor(
    private readonly adminService: AdminService,
    private readonly prisma: PrismaService,
    private readonly clanResolver: ClanResolverService,
    private readonly searchService: SearchService,
  ) {}

  /**
   * 获取认亲申请列表
   */
  @Get('applications')
  @ApiOperation({ summary: 'Get merge applications list' })
  async getApplications(
    @Request() req,
    @Query('clanSlug') clanSlug: string,
    @Query('page') pageStr = '1',
    @Query('pageSize') pageSizeStr = '20',
    @Query('status') status?: string,
  ) {
    const userId = req.user.userId;
    const clanId = await this.adminService.requireAdminBySlug(clanSlug, userId);


    const page = parseInt(pageStr) || 1;
    const pageSize = parseInt(pageSizeStr) || 20;
    const skip = (page - 1) * pageSize;

    const where: any = { clan_id: clanId };
    if (status) {
      where.status = status as ApplicationStatus;
    }

    const [applications, total] = await Promise.all([
      this.prisma.mergeApplication.findMany({
        where,
        include: {
          applicant: { select: { id: true, phone: true } },
          matched_person: { select: { id: true, full_name: true } },
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.mergeApplication.count({ where }),
    ]);

    return {
      data: applications.map(a => ({
        id: a.id.toString(),
        applicant_id: a.applicant_id,
        applicant_phone: a.applicant.phone,
        origin_place: a.origin_place,
        xipai_info: a.xipai_info,
        ancestor_name: a.ancestor_name,
        migration_history: a.migration_history,
        matched_person_id: a.matched_person_id?.toString(),
        matched_person_name: a.matched_person?.full_name,
        match_score: a.match_score,
        status: a.status,
        created_at: a.created_at,
      })),
      pagination: {
        page,
        page_size: pageSize,
        total,
        total_pages: Math.ceil(total / pageSize),
      },
    };
  }

  // ==================== 寻亲帖管理 ====================

  /**
   * 获取寻亲帖列表
   */
  @Get('posts')
  @ApiOperation({ summary: 'Get search posts list' })
  async getSearchPosts(
    @Request() req,
    @Query('clanSlug') clanSlug: string,
    @Query('page') pageStr = '1',
    @Query('pageSize') pageSizeStr = '20',
    @Query('status') status?: string,
  ) {
    const userId = req.user.userId;
    const clanId = await this.adminService.requireAdminBySlug(clanSlug, userId);


    const page = parseInt(pageStr) || 1;
    const pageSize = parseInt(pageSizeStr) || 20;
    const skip = (page - 1) * pageSize;

    // search_posts 没有 clan_id。本族帖 = 创建者是本族成员或本族 admin_user_id。
    // 广场发帖写入的是登录用户 id，因此本族成员的广场帖会落在这个集合里。
    const creatorIds = await this.searchService.listCreatorIdsForClan(clanId);
    if (creatorIds.length === 0) {
      return {
        data: [],
        pagination: { page, page_size: pageSize, total: 0, total_pages: 0 },
      };
    }

    const where: any = {
      created_by: { in: creatorIds },
    };

    const [posts, total] = await Promise.all([
      this.prisma.searchPost.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.searchPost.count({ where }),
    ]);

    return {
      data: posts.map(p => ({
        id: p.id.toString(),
        origin_place: p.origin_place,
        xipai_keywords: p.xipai_keywords,
        contact_info: SEARCH_CONTACT_MASK,
        created_by: p.created_by,
        created_at: p.created_at,
        updated_at: p.updated_at,
      })),
      pagination: { page, page_size: pageSize, total, total_pages: Math.ceil(total / pageSize) },
    };
  }

  /**
   * 帖子必须属于当前家族。当前用户是该族管理员，或就是帖子创建者，才能改删。
   * 跨家族一律 404，避免探明其他家族的帖是否存在。
   */
  private async assertCanManageSearchPost(
    post: { created_by: string },
    clanId: bigint,
    userId: string,
  ) {
    const belongs = await this.searchService.postBelongsToClan(post.created_by, clanId);
    if (!belongs) {
      throw new NotFoundException('Search post not found');
    }
    if (post.created_by === userId) return;
    await this.adminService.requireAdmin(clanId, userId);
  }

  /**
   * 编辑寻亲帖
   */
  @Post('posts/:id/edit')
  @ApiOperation({ summary: 'Edit search post' })
  async editSearchPost(
    @Request() req,
    @Param('id') postIdStr: string,
    @Body() body: { origin_place?: string; xipai_keywords?: string[]; contact_info?: string },
    @Query('clanSlug') clanSlug: string,
  ) {
    const userId = req.user.userId;
    const clan = await this.clanResolver.resolveOrThrow(clanSlug);
    const postId = BigInt(postIdStr);

    const post = await this.prisma.searchPost.findUnique({
      where: { id: postId },
    });

    if (!post) {
      throw new NotFoundException('Search post not found');
    }

    await this.assertCanManageSearchPost(post, clan.id, userId);

    const data: {
      origin_place: string;
      xipai_keywords: string[];
      contact_info?: string;
    } = {
      origin_place: body.origin_place ?? post.origin_place,
      xipai_keywords: body.xipai_keywords ?? post.xipai_keywords,
    };
    const nextContact = this.searchService.encryptContactIfChanged(body.contact_info);
    if (nextContact !== undefined) {
      data.contact_info = nextContact;
    }

    const updated = await this.prisma.searchPost.update({
      where: { id: postId },
      data,
    });

    await this.adminService.logAction({
      clanId: clan.id,
      userId,
      action: 'EDIT_SEARCH_POST',
      targetType: 'SearchPost',
      targetId: postIdStr,
    });

    return serializeBigInt({
      message: 'Post updated successfully',
      data: { ...updated, contact_info: SEARCH_CONTACT_MASK },
    });
  }

  /**
   * 删除寻亲帖
   */
  @Post('posts/:id/delete')
  @ApiOperation({ summary: 'Delete search post' })
  async deleteSearchPost(
    @Request() req,
    @Param('id') postIdStr: string,
    @Query('clanSlug') clanSlug: string,
  ) {
    const userId = req.user.userId;
    const clan = await this.clanResolver.resolveOrThrow(clanSlug);
    const postId = BigInt(postIdStr);

    const post = await this.prisma.searchPost.findUnique({
      where: { id: postId },
    });

    if (!post) {
      throw new NotFoundException('Search post not found');
    }

    await this.assertCanManageSearchPost(post, clan.id, userId);

    await this.prisma.searchPost.delete({
      where: { id: postId },
    });

    await this.adminService.logAction({
      clanId: clan.id,
      userId,
      action: 'DELETE_SEARCH_POST',
      targetType: 'SearchPost',
      targetId: postIdStr,
    });

    return { message: 'Post deleted successfully' };
  }
}
