import { Controller, Get, Post, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminService } from '../admin.service';
import { MergeService } from './merge.service';
import { PrismaService } from '@geneasphere/db';
import { NotificationService } from '../../common/notification.service';
import { serializeBigInt } from '../../common/bigint-serializer';

const SENSITIVE_FIELD_KEYS = new Set([
  'phone',
  'phone_bound',
  'contact_phone',
  'contact_info',
  'scanner_phone',
  'id_card',
  'id_card_url',
  'id_card_uploaded_at',
  'id_card_number',
  'id_number',
]);

function stripSensitiveFields<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (typeof value === 'bigint' || value instanceof Date) return value;
  if (Array.isArray(value)) {
    return value.map((item) => stripSensitiveFields(item)) as unknown as T;
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_FIELD_KEYS.has(key)) continue;
      out[key] = stripSensitiveFields(nested);
    }
    return out as T;
  }
  return value;
}

@ApiTags('admin/merge/wizard')
@Controller('api/admin/merge')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MergeWizardController {
  constructor(
    private readonly mergeService: MergeService,
    private readonly adminService: AdminService,
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

  private present<T>(value: T): T {
    return serializeBigInt(stripSensitiveFields(value));
  }

  /**
   * 获取合并向导初始化数据
   */
  @Get('wizard/:appId')
  @ApiOperation({ summary: 'Get merge wizard initialization data' })
  async getWizardData(
    @Request() req,
    @Param('appId') appIdStr: string,
    @Query('mainClanSlug') mainClanSlug?: string,
  ) {
    const userId = req.user.userId;
    const appId = BigInt(appIdStr);

    // 获取申请详情
    const app = await this.prisma.mergeApplication.findUnique({
      where: { id: appId },
    });

    if (!app) {
      throw new Error('Application not found');
    }

    // 确定主家族ID：优先用查询参数中的 slug，否则取申请关联的 clan_id
    const mainClanId = mainClanSlug
      ? await this.adminService.requireAdminBySlug(mainClanSlug, userId)
      : app.clan_id;

    // 如果从申请中拿到的 clanId 仍未确认权限，这里再校验一次
    await this.adminService.requireAdmin(mainClanId, userId);

    const wizardData = await this.mergeService.getWizardData(appId, mainClanId);

    return this.present({
      success: true,
      data: wizardData,
    });
  }

  /**
   * 获取族谱树结构
   */
  @Get('clans/:clanSlug/tree')
  @ApiOperation({ summary: 'Get clan family tree structure' })
  async getClanTree(
    @Request() req,
    @Param('clanSlug') clanSlug: string,
  ) {
    const userId = req.user.userId;
    const clanId = await this.adminService.requireAdminBySlug(clanSlug, userId);


    const tree = await this.mergeService.getClanTree(clanId);

    return this.present({
      success: true,
      data: tree,
    });
  }

  /**
   * 获取人物的祖先链
   */
  @Get('persons/:personId/ancestors')
  @ApiOperation({ summary: 'Get ancestors of a person' })
  async getAncestors(
    @Request() req,
    @Param('personId') personIdStr: string,
    @Query('clanSlug') clanSlug: string,
  ) {
    const userId = req.user.userId;
    const personId = BigInt(personIdStr);
    const clanId = await this.adminService.requireAdminBySlug(clanSlug, userId);


    const ancestors = await this.mergeService.getAncestors(personId, clanId);

    return this.present({
      success: true,
      data: ancestors,
    });
  }

  /**
   * 验证挂载点合法性
   */
  @Post('validate-anchor')
  @ApiOperation({ summary: 'Validate anchor point for merge' })
  async validateAnchor(
    @Request() req,
    @Body() body: {
      anchorPersonId: string;
      mainClanId: string;
      applicantClanId: string;
    },
  ) {
    const userId = req.user.userId;
    const { anchorPersonId, mainClanId, applicantClanId } = body;

    await this.adminService.requireAdmin(BigInt(mainClanId), userId);

    const result = await this.mergeService.validateAnchor(
      BigInt(anchorPersonId),
      BigInt(mainClanId),
      BigInt(applicantClanId),
    );

    return this.present({
      success: result.isValid,
      data: result,
    });
  }

  /**
   * 预览世代对齐
   */
  @Post('preview-alignment')
  @ApiOperation({ summary: 'Preview generation alignment' })
  async previewAlignment(
    @Request() req,
    @Body() body: {
      anchorPersonId: string;
      applicantClanId: string;
      mainClanId: string;
    },
  ) {
    const userId = req.user.userId;
    const { anchorPersonId, applicantClanId, mainClanId } = body;

    await this.adminService.requireAdmin(BigInt(mainClanId), userId);

    const alignments = await this.mergeService.previewAlignment(
      BigInt(anchorPersonId),
      BigInt(applicantClanId),
      BigInt(mainClanId),
    );

    return this.present({
      success: true,
      data: alignments,
    });
  }

  /**
   * 执行合并
   */
  @Post('execute')
  @ApiOperation({ summary: 'Execute merge operation' })
  async executeMerge(
    @Request() req,
    @Body() body: {
      applicationId: string;
      anchorPersonId: string;
      branchRootPersonId?: string;
      generationOffset?: number;
    },
  ) {
    const userId = req.user.userId;
    const { applicationId, anchorPersonId, branchRootPersonId, generationOffset = 0 } = body;

    // 获取申请信息以验证权限
    const app = await this.prisma.mergeApplication.findUnique({
      where: { id: BigInt(applicationId) },
    });

    if (!app) {
      throw new Error('Application not found');
    }

    await this.adminService.requireAdmin(app.clan_id, userId);

    const result = await this.mergeService.executeMerge(
      BigInt(applicationId),
      BigInt(anchorPersonId),
      branchRootPersonId ? BigInt(branchRootPersonId) : null,
      generationOffset,
      userId,
    );

    // 发送通知
    try {
      await this.notificationService.notifyMergeComplete({
        applicantId: app.applicant_id,
        clanId: app.clan_id,
        applicationId,
        anchorPersonId,
      });
    } catch (err) {
      console.error('Failed to send merge complete notification:', err);
    }

    // 记录日志
    await this.adminService.logAction({
      clanId: app.clan_id,
      userId,
      action: 'EXECUTE_MERGE',
      targetType: 'MergeApplication',
      targetId: applicationId,
      details: `Merged into anchor ${anchorPersonId}, generation offset: ${generationOffset}`,
    });

    return this.present({
      success: true,
      data: result,
    });
  }

  /**
   * 获取可回滚的合并快照
   */
  @Get('merge-snapshots')
  @ApiOperation({ summary: 'Get merge snapshots for rollback' })
  async getMergeSnapshots(
    @Request() req,
    @Query('clanSlug') clanSlug: string,
  ) {
    const userId = req.user.userId;
    const clanId = await this.adminService.requireAdminBySlug(clanSlug, userId);


    const snapshots = await this.mergeService.getMergeSnapshots(clanId);

    return this.present({
      success: true,
      data: snapshots,
    });
  }

  /**
   * 回滚合并操作
   */
  @Post('rollback/:snapshotId')
  @ApiOperation({ summary: 'Rollback a merge operation' })
  async rollbackMerge(
    @Request() req,
    @Param('snapshotId') snapshotIdStr: string,
  ) {
    const userId = req.user.userId;
    const snapshotId = BigInt(snapshotIdStr);

    // 获取快照以验证权限
    const snapshot = await this.prisma.dataSnapshot.findUnique({
      where: { id: snapshotId },
    });

    if (!snapshot) {
      throw new Error('Snapshot not found');
    }

    await this.adminService.requireAdmin(snapshot.clan_id, userId);

    await this.mergeService.rollbackMerge(snapshotId, userId);

    // 发送通知
    if (snapshot.merge_application_id && snapshot.applicant_clan_id) {
      try {
        const app = await this.prisma.mergeApplication.findUnique({
          where: { id: snapshot.merge_application_id },
        });
        if (app) {
          await this.notificationService.notifyMergeRollback({
            applicantId: app.applicant_id,
            clanId: snapshot.clan_id,
            applicationId: snapshot.merge_application_id.toString(),
          });
        }
      } catch (err) {
        console.error('Failed to send rollback notification:', err);
      }
    }

    // 记录日志
    await this.adminService.logAction({
      clanId: snapshot.clan_id,
      userId,
      action: 'ROLLBACK_MERGE',
      targetType: 'DataSnapshot',
      targetId: snapshotIdStr,
      details: `Rolled back merge snapshot ${snapshotIdStr}`,
    });

    return this.present({
      success: true,
      message: 'Rollback completed successfully',
    });
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
      throw new Error('Application not found');
    }

    await this.adminService.requireAdmin(app.clan_id, userId);

    const wizardData = await this.mergeService.getWizardData(appId, app.clan_id);

    return this.present({
      success: true,
      data: wizardData,
    });
  }

  /**
   * 初审通过（进入待合并状态）
   * 页面只对 PENDING 展示该操作，条件更新限定来源状态为 PENDING。
   */
  @Post('applications/:id/approve')
  @ApiOperation({ summary: 'Approve application for merge' })
  async approveForMerge(
    @Request() req,
    @Param('id') appIdStr: string,
  ) {
    const userId = req.user.userId;
    const appId = BigInt(appIdStr);

    const app = await this.prisma.mergeApplication.findUnique({
      where: { id: appId },
    });

    if (!app) {
      throw new Error('Application not found');
    }

    await this.adminService.requireAdmin(app.clan_id, userId);

    const updated = await this.mergeService.approveApplication(appId, userId);

    // 通知申请人
    await this.notificationService.notifyMergeApproved({
      applicantId: app.applicant_id,
      clanId: app.clan_id,
      applicationId: appIdStr,
    }).catch((err) => console.error('Notification failed:', err));

    // 记录日志
    await this.adminService.logAction({
      clanId: app.clan_id,
      userId,
      action: 'APPROVE_MERGE_APPLICATION',
      targetType: 'MergeApplication',
      targetId: appIdStr,
      details: 'Application approved for merge',
    });

    return this.present({
      success: true,
      data: { status: updated.status },
    });
  }

  /**
   * 拒绝申请。只从 PENDING 条件更新。
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
      throw new Error('Application not found');
    }

    await this.adminService.requireAdmin(app.clan_id, userId);

    const updated = await this.mergeService.rejectApplication(appId, userId, body.reason);

    await this.notificationService.notifyMergeResult({
      applicantId: app.applicant_id,
      clanId: app.clan_id,
      applicationId: appIdStr,
      approved: false,
      reason: body.reason,
    }).catch((err) => console.error('Notification failed:', err));

    await this.adminService.logAction({
      clanId: app.clan_id,
      userId,
      action: 'REJECT_MERGE',
      targetType: 'MergeApplication',
      targetId: appIdStr,
      details: body.reason,
    });

    return this.present({
      success: true,
      data: { status: updated.status },
    });
  }

  /**
   * 标记为需人工核查。只从 PENDING 条件更新。
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
      throw new Error('Application not found');
    }

    await this.adminService.requireAdmin(app.clan_id, userId);

    const updated = await this.mergeService.markNeedsManualReview(appId);

    return this.present({
      success: true,
      data: { status: updated.status },
    });
  }
}
