import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, Request, NotFoundException, BadRequestException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminService } from '../admin.service';
import { PrismaService } from '@geneasphere/db';
import { ApplicationStatus } from '@prisma/client';

@ApiTags('admin/merge')
@Controller('api/admin/merge')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MergeController {
  constructor(
    private readonly adminService: AdminService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * 获取认亲申请列表
   */
  @Get('applications')
  @ApiOperation({ summary: 'Get merge applications list' })
  async getApplications(
    @Request() req,
    @Query('clanId') clanIdStr: string,
    @Query('page') pageStr = '1',
    @Query('pageSize') pageSizeStr = '20',
    @Query('status') status?: string,
  ) {
    const userId = req.user.userId;
    const clanId = BigInt(clanIdStr);

    await this.adminService.requireAdmin(clanId, userId);

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

  /**
   * 获取申请详情（包含比对信息）
   */
  @Get('applications/:id')
  @ApiOperation({ summary: 'Get application detail with comparison' })
  async getApplicationDetail(
    @Request() req,
    @Param('id') appIdStr: string,
  ) {
    const userId = req.user.userId;
    const appId = BigInt(appIdStr);

    const app = await this.prisma.mergeApplication.findUnique({
      where: { id: appId },
      include: {
        applicant: { select: { id: true, phone: true } },
        matched_person: true,
        clan: true,
      },
    });

    if (!app) {
      throw new NotFoundException('Application not found');
    }

    await this.adminService.requireAdmin(app.clan_id, userId);

    // 执行自动比对
    const comparisonResult = await this.performComparison(app);

    return {
      id: app.id.toString(),
      applicant_id: app.applicant_id,
      origin_place: app.origin_place,
      xipai_info: app.xipai_info,
      ancestor_name: app.ancestor_name,
      migration_history: app.migration_history,
      match_score: app.match_score,
      match_details: app.match_details,
      status: app.status,
      comparison: comparisonResult,
      created_at: app.created_at,
    };
  }

  /**
   * 通过申请并执行归宗合并
   */
  @Post('applications/:id/approve')
  @ApiOperation({ summary: 'Approve merge application and execute merge' })
  async approveMerge(
    @Request() req,
    @Param('id') appIdStr: string,
    @Body() body: { merge_target_id: string; snapshot?: boolean },
  ) {
    const userId = req.user.userId;
    const appId = BigInt(appIdStr);
    const mergeTargetId = BigInt(body.merge_target_id);

    const app = await this.prisma.mergeApplication.findUnique({
      where: { id: appId },
      include: { clan: true },
    });

    if (!app) {
      throw new NotFoundException('Application not found');
    }

    await this.adminService.requireAdmin(app.clan_id, userId);

    // 创建数据快照（用于回滚）
    const snapshotId = await this.createSnapshot(app.clan_id, userId);

    // 执行合并
    // TODO: 实际的闭包表重算和人员迁移逻辑
    // 1. 将申请人分支的人员重新关联到目标节点
    // 2. 重新计算 PersonAncestry 闭包表

    const updated = await this.prisma.mergeApplication.update({
      where: { id: appId },
      data: {
        status: ApplicationStatus.APPROVED,
        merge_target_id: mergeTargetId,
        reviewed_by: userId,
        reviewed_at: new Date(),
      },
    });

    await this.adminService.logAction({
      clanId: app.clan_id,
      userId,
      action: 'MERGE_BRANCH',
      targetType: 'MergeApplication',
      targetId: appIdStr,
      details: `Merged applicant ${app.applicant_id} into person ${body.merge_target_id}. Snapshot: ${snapshotId}`,
    });

    return {
      message: 'Merge approved successfully',
      status: updated.status,
      snapshot_id: snapshotId,
    };
  }

  /**
   * 回滚合并操作（24小时内有效）
   */
  @Post('rollback/:snapshotId')
  @ApiOperation({ summary: 'Rollback a merge operation within 24 hours' })
  async rollbackMerge(
    @Request() req,
    @Param('snapshotId') snapshotIdStr: string,
  ) {
    const userId = req.user.userId;
    const snapshotId = BigInt(snapshotIdStr);

    const snapshot = await this.prisma.dataSnapshot.findUnique({
      where: { id: snapshotId },
    });

    if (!snapshot) {
      throw new NotFoundException('Snapshot not found');
    }

    if (new Date() > snapshot.expires_at) {
      throw new BadRequestException('Snapshot has expired (24 hour limit)');
    }

    await this.adminService.requireAdmin(snapshot.clan_id, userId);

    // 执行回滚：恢复快照中的数据
    const snapshotData = snapshot.data as any;

    if (snapshotData.persons) {
      // 恢复被修改的人员数据
      for (const person of snapshotData.persons) {
        await this.prisma.person.update({
          where: { id: BigInt(person.id) },
          data: {
            clan_id: BigInt(person.clan_id),
            full_name: person.full_name,
            gender: person.gender,
            birth_date: person.birth_date ? new Date(person.birth_date) : null,
            death_date: person.death_date ? new Date(person.death_date) : null,
            is_living: person.is_living,
          },
        }).catch(() => {
          // 如果人员已删除，重新创建
          return this.prisma.person.create({
            data: {
              id: BigInt(person.id),
              clan_id: BigInt(person.clan_id),
              full_name: person.full_name,
              gender: person.gender,
              birth_date: person.birth_date ? new Date(person.birth_date) : null,
              death_date: person.death_date ? new Date(person.death_date) : null,
              is_living: person.is_living,
            },
          });
        });
      }
    }

    if (snapshotData.ancestry) {
      // 恢复闭包表
      await this.prisma.personAncestry.deleteMany({
        where: { ancestor: { clan_id: snapshot.clan_id } },
      });

      for (const entry of snapshotData.ancestry) {
        await this.prisma.personAncestry.create({
          data: {
            ancestor_id: BigInt(entry.ancestor_id),
            descendant_id: BigInt(entry.descendant_id),
            depth: entry.depth,
          },
        }).catch(() => {}); // 忽略重复键错误
      }
    }

    await this.adminService.logAction({
      clanId: snapshot.clan_id,
      userId,
      action: 'ROLLBACK_MERGE',
      targetType: 'DataSnapshot',
      targetId: snapshotIdStr,
      details: `Rolled back snapshot ${snapshotIdStr}`,
    });

    return { message: 'Rollback successful' };
  }

  // ==================== 寻亲帖管理 ====================

  /**
   * 获取寻亲帖列表
   */
  @Get('posts')
  @ApiOperation({ summary: 'Get search posts list' })
  async getSearchPosts(
    @Request() req,
    @Query('clanId') clanIdStr: string,
    @Query('page') pageStr = '1',
    @Query('pageSize') pageSizeStr = '20',
    @Query('status') status?: string,
  ) {
    const userId = req.user.userId;
    const clanId = BigInt(clanIdStr);

    await this.adminService.requireAdmin(clanId, userId);

    const page = parseInt(pageStr) || 1;
    const pageSize = parseInt(pageSizeStr) || 20;
    const skip = (page - 1) * pageSize;

    // SearchPost 没有 clan_id，需要通过其他方式关联
    // 这里简化处理：根据创建者关联到 clan
    const clanMembers = await this.prisma.clanMember.findMany({
      where: { clan_id: clanId },
      select: { user_id: true },
    });
    const memberUserIds = clanMembers.map(m => m.user_id);

    const where: any = {
      created_by: { in: memberUserIds },
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
        contact_info: p.contact_info,
        created_by: p.created_by,
        created_at: p.created_at,
        updated_at: p.updated_at,
      })),
      pagination: { page, page_size: pageSize, total, total_pages: Math.ceil(total / pageSize) },
    };
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
  ) {
    const userId = req.user.userId;
    const postId = BigInt(postIdStr);

    const post = await this.prisma.searchPost.findUnique({
      where: { id: postId },
    });

    if (!post) {
      throw new NotFoundException('Search post not found');
    }

    const updated = await this.prisma.searchPost.update({
      where: { id: postId },
      data: {
        origin_place: body.origin_place ?? post.origin_place,
        xipai_keywords: body.xipai_keywords ?? post.xipai_keywords,
        contact_info: body.contact_info ?? post.contact_info,
      },
    });

    await this.adminService.logAction({
      userId,
      action: 'EDIT_SEARCH_POST',
      targetType: 'SearchPost',
      targetId: postIdStr,
    });

    return { message: 'Post updated successfully', data: updated };
  }

  /**
   * 删除寻亲帖
   */
  @Post('posts/:id/delete')
  @ApiOperation({ summary: 'Delete search post' })
  async deleteSearchPost(
    @Request() req,
    @Param('id') postIdStr: string,
  ) {
    const userId = req.user.userId;
    const postId = BigInt(postIdStr);

    const post = await this.prisma.searchPost.findUnique({
      where: { id: postId },
    });

    if (!post) {
      throw new NotFoundException('Search post not found');
    }

    await this.prisma.searchPost.delete({
      where: { id: postId },
    });

    await this.adminService.logAction({
      userId,
      action: 'DELETE_SEARCH_POST',
      targetType: 'SearchPost',
      targetId: postIdStr,
    });

    return { message: 'Post deleted successfully' };
  }

  /**
   * 获取可回滚的快照列表
   */
  @Get('snapshots')
  @ApiOperation({ summary: 'Get available rollback snapshots' })
  async getSnapshots(
    @Request() req,
    @Query('clanId') clanIdStr: string,
  ) {
    const userId = req.user.userId;
    const clanId = BigInt(clanIdStr);

    await this.adminService.requireAdmin(clanId, userId);

    const snapshots = await this.prisma.dataSnapshot.findMany({
      where: {
        clan_id: clanId,
        expires_at: { gt: new Date() },
      },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        reason: true,
        created_at: true,
        expires_at: true,
      },
    });

    return snapshots.map(s => ({
      id: s.id.toString(),
      reason: s.reason,
      created_at: s.created_at,
      expires_at: s.expires_at,
      expires_in_minutes: Math.max(0, Math.round((s.expires_at.getTime() - Date.now()) / 60000)),
    }));
  }

  /**
   * 拒绝申请
   */
  @Post('applications/:id/reject')
  @ApiOperation({ summary: 'Reject merge application' })
  async rejectMerge(
    @Request() req,
    @Param('id') appIdStr: string,
    @Body() body: { reason: string },
  ) {
    const userId = req.user.userId;
    const appId = BigInt(appIdStr);

    const app = await this.prisma.mergeApplication.findUnique({
      where: { id: appId },
    });

    if (!app) {
      throw new NotFoundException('Application not found');
    }

    await this.adminService.requireAdmin(app.clan_id, userId);

    const updated = await this.prisma.mergeApplication.update({
      where: { id: appId },
      data: {
        status: ApplicationStatus.REJECTED,
        reject_reason: body.reason,
        reviewed_by: userId,
        reviewed_at: new Date(),
      },
    });

    await this.adminService.logAction({
      clanId: app.clan_id,
      userId,
      action: 'REJECT_MERGE',
      targetType: 'MergeApplication',
      targetId: appIdStr,
      details: body.reason,
    });

    return { message: 'Merge rejected successfully', status: updated.status };
  }

  /**
   * 标记为需人工核查
   */
  @Post('applications/:id/mark-manual')
  @ApiOperation({ summary: 'Mark application as needs manual review' })
  async markManualReview(
    @Request() req,
    @Param('id') appIdStr: string,
  ) {
    const userId = req.user.userId;
    const appId = BigInt(appIdStr);

    const app = await this.prisma.mergeApplication.findUnique({
      where: { id: appId },
    });

    if (!app) {
      throw new NotFoundException('Application not found');
    }

    await this.adminService.requireAdmin(app.clan_id, userId);

    const updated = await this.prisma.mergeApplication.update({
      where: { id: appId },
      data: {
        status: ApplicationStatus.NEEDS_MANUAL_REVIEW,
      },
    });

    return { message: 'Marked as needs manual review', status: updated.status };
  }

  /**
   * 执行自动比对
   */
  private async performComparison(app: any): Promise<any> {
    // 根据字辈、地名进行比对
    const matches: any[] = [];

    // 1. 字辈匹配
    if (app.xipai_info && app.xipai_info.length > 0) {
      const xipaiMatches = await this.prisma.xipai.findMany({
        where: {
          clan_id: app.clan_id,
          character: { in: app.xipai_info },
        },
      });

      matches.push(...xipaiMatches.map(x => ({
        type: 'XIPAI',
        value: x.character,
        generation: x.generation,
        score: 30,
      })));
    }

    // 2. 地名匹配
    if (app.origin_place) {
      // 查找有相同地名的媒体记录
      const locationMatches = await this.prisma.mediaArchive.findMany({
        where: {
          clan_id: app.clan_id,
          taken_location: { contains: app.origin_place },
        },
        take: 5,
      });

      if (locationMatches.length > 0) {
        matches.push({
          type: 'LOCATION',
          value: app.origin_place,
          count: locationMatches.length,
          score: 20,
        });
      }
    }

    // 计算总分
    const totalScore = matches.reduce((sum, m) => sum + m.score, 0);

    return {
      matches,
      total_score: Math.min(totalScore, 100),
      suggestion: totalScore > 50 ? 'LIKELY_MATCH' : 'NEEDS_REVIEW',
    };
  }

  /**
   * 创建家族数据快照
   */
  private async createSnapshot(clanId: bigint, userId: string): Promise<string> {
    // 导出当前家族的 persons 和 ancestry 数据
    const [persons, ancestry] = await Promise.all([
      this.prisma.person.findMany({
        where: { clan_id: clanId },
      }),
      this.prisma.personAncestry.findMany({
        where: { ancestor: { clan_id: clanId } },
      }),
    ]);

    const snapshotData = {
      persons: persons.map(p => ({
        id: p.id.toString(),
        clan_id: p.clan_id.toString(),
        full_name: p.full_name,
        gender: p.gender,
        birth_date: p.birth_date?.toISOString() || null,
        death_date: p.death_date?.toISOString() || null,
        is_living: p.is_living,
      })),
      ancestry: ancestry.map(a => ({
        ancestor_id: a.ancestor_id.toString(),
        descendant_id: a.descendant_id.toString(),
        depth: a.depth,
      })),
    };

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24小时

    const snapshot = await this.prisma.dataSnapshot.create({
      data: {
        clan_id: clanId,
        data: snapshotData,
        reason: 'Pre-merge snapshot',
        created_by: userId,
        expires_at: expiresAt,
      },
    });

    await this.adminService.logAction({
      clanId,
      userId,
      action: 'CREATE_SNAPSHOT',
      targetType: 'DataSnapshot',
      targetId: snapshot.id.toString(),
      details: 'Snapshot created before merge operation (valid 24h)',
    });

    return snapshot.id.toString();
  }
}
