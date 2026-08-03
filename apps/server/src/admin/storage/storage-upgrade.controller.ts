import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PrismaService } from '@geneasphere/db';
import { Prisma } from '@prisma/client';
import { serializeBigInt } from '../../common/bigint-serializer';
import { AdminService } from '../admin.service';
import { PlatformAuthGuard } from '../../platform/auth/platform-auth.guard';
import { NotificationService } from '../../common/notification.service';

/**
 * 存储扩容申请（人工审核流）
 * - 真实性整改：支付 Provider 未配置时，禁止伪造支付/立即扩容
 * - 家族管理员可提交扩容申请（含套餐、容量、原因、联系方式）
 * - 平台管理员审核通过后才真正更新 ClanQuota
 */
@ApiTags('admin/storage')
@Controller('api/admin/storage')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class StorageUpgradeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminService: AdminService,
    private readonly notify: NotificationService,
  ) {}

  /** 套餐定义：与前端 StorageUpgradePlan 对齐；只暴露 code/name/quota_bytes/price */
  static readonly PLANS: Array<{
    code: string;
    name: string;
    quota_bytes: number;
    price: number;
  }> = [
    { code: 'BASIC_20G', name: '基础版 20GB', quota_bytes: 20 * 1024 * 1024 * 1024, price: 99 },
    { code: 'PRO_100G', name: '专业版 100GB', quota_bytes: 100 * 1024 * 1024 * 1024, price: 399 },
    { code: 'FLAGSHIP_500G', name: '旗舰版 500GB', quota_bytes: 500 * 1024 * 1024 * 1024, price: 1499 },
  ];

  @Get('plans')
  @ApiOperation({ summary: '存储扩容套餐列表（仅展示，不会立即扣费）' })
  listPlans() {
    return { data: StorageUpgradeController.PLANS };
  }

  @Get('upgrade-requests')
  @ApiOperation({ summary: '查询本家族的扩容申请记录' })
  async listMyRequests(@Request() req, @Query('clanSlug') clanSlug: string) {
    const userId = req.user.userId;
    const clanId = await this.adminService.requireAdminBySlug(clanSlug, userId);
    const list = await this.prisma.storageUpgradeRequest.findMany({
      where: { clan_id: clanId },
      orderBy: { created_at: 'desc' },
    });
    return { data: serializeBigInt(list) };
  }

  @Post('upgrade-requests')
  @ApiOperation({ summary: '提交扩容申请（家族管理员）' })
  async submitRequest(
    @Request() req,
    @Query('clanSlug') clanSlug: string,
    @Body()
    body: {
      plan_code: string;
      reason?: string;
      contact_info?: string;
    },
  ) {
    const userId = req.user.userId;
    const clanId = await this.adminService.requireAdminBySlug(clanSlug, userId);

    const plan = StorageUpgradeController.PLANS.find(
      (p) => p.code === body?.plan_code,
    );
    if (!plan) {
      throw new BadRequestException('套餐不存在');
    }
    if (body.reason && body.reason.length > 500) {
      throw new BadRequestException('申请原因长度不能超过 500 字符');
    }
    if (body.contact_info && body.contact_info.length > 200) {
      throw new BadRequestException('联系方式长度不能超过 200 字符');
    }

    // 读取当前家族存储配额（Clan 暂无 quota 字段，落到 settings_json 顶层 quota_bytes）
    const clan = await this.prisma.clan.findUnique({
      where: { id: clanId },
      select: { settings_json: true },
    });
    const settings = (clan?.settings_json as Prisma.JsonObject | null) || {};
    const currentQuota =
      typeof settings['storage_quota_bytes'] === 'number'
        ? Number(settings['storage_quota_bytes'])
        : 5 * 1024 * 1024 * 1024;

    const created = await this.prisma.storageUpgradeRequest.create({
      data: {
        clan_id: clanId,
        applicant_id: userId,
        plan_code: plan.code,
        plan_name: plan.name,
        quota_bytes: BigInt(plan.quota_bytes),
        current_quota_bytes: BigInt(currentQuota),
        reason: body.reason?.trim() || null,
        contact_info: body.contact_info?.trim() || null,
      },
    });

    return { data: serializeBigInt(created) };
  }

  @Post('upgrade-requests/:id/cancel')
  @ApiOperation({ summary: '家族管理员撤销待审核的扩容申请' })
  async cancelRequest(@Request() req, @Param('id') id: string) {
    const userId = req.user.userId;
    const record = await this.prisma.storageUpgradeRequest.findUnique({
      where: { id: BigInt(id) },
    });
    if (!record) throw new NotFoundException('申请不存在');
    await this.adminService.requireAdminBySlug(
      String(record.clan_id),
      userId,
    );
    if (record.applicant_id !== userId) {
      throw new ForbiddenException('只能撤销自己提交的申请');
    }
    if (record.status !== 'PENDING') {
      throw new BadRequestException('只有待审核的申请可以撤销');
    }
    const updated = await this.prisma.storageUpgradeRequest.update({
      where: { id: record.id },
      data: { status: 'CANCELED' },
    });
    return { data: serializeBigInt(updated) };
  }

  // ==================== 平台管理员审核 ====================

  @Get('admin/upgrade-requests')
  @UseGuards(PlatformAuthGuard)
  @ApiOperation({ summary: '平台管理员查看所有扩容申请' })
  async adminListAll(
    @Query('status') status?: string,
    @Query('page') pageStr = '1',
    @Query('pageSize') pageSizeStr = '20',
  ) {
    const page = parseInt(pageStr) || 1;
    const pageSize = Math.min(parseInt(pageSizeStr) || 20, 100);
    const where = status ? { status: status as any } : {};
    const [rows, total] = await Promise.all([
      this.prisma.storageUpgradeRequest.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.storageUpgradeRequest.count({ where }),
    ]);
    return {
      data: serializeBigInt(rows),
      pagination: { page, pageSize, total },
    };
  }

  @Put('admin/upgrade-requests/:id/review')
  @UseGuards(PlatformAuthGuard)
  @ApiOperation({ summary: '平台管理员审核扩容申请' })
  async adminReview(
    @Request() req,
    @Param('id') id: string,
    @Body()
    body: {
      action: 'APPROVE' | 'REJECT';
      note?: string;
      quota_bytes?: number;
    },
  ) {
    if (!['APPROVE', 'REJECT'].includes(body?.action)) {
      throw new BadRequestException('action 必须是 APPROVE 或 REJECT');
    }
    const record = await this.prisma.storageUpgradeRequest.findUnique({
      where: { id: BigInt(id) },
    });
    if (!record) throw new NotFoundException('申请不存在');
    if (record.status !== 'PENDING') {
      throw new BadRequestException('只有待审核的申请可以审核');
    }
    const reviewerId = String(req.user.adminId);

    if (body.action === 'REJECT') {
      const updated = await this.prisma.$transaction(async (tx) => {
        const u = await tx.storageUpgradeRequest.update({
          where: { id: record.id },
          data: {
            status: 'REJECTED',
            reviewed_at: new Date(),
            reviewer_id: reviewerId,
            reviewer_note: body.note?.trim() || null,
          },
        });
        // 平台管理员操作走专属审计表，不写入业务 AuditLog
        await tx.platformOperationLog.create({
          data: {
            admin_id: BigInt(reviewerId),
            action_type: 'STORAGE_UPGRADE_REJECTED',
            target_type: 'StorageUpgradeRequest',
            target_id: String(record.id),
            detail: {
              clan_id: String(record.clan_id),
              applicant_id: record.applicant_id,
              plan_code: record.plan_code,
              note: body.note?.trim() || null,
            } as Prisma.JsonObject,
            status: 'success',
          },
        });
        return u;
      });
      return { data: serializeBigInt(updated) };
    }

    // APPROVE：仅在管理员显式传入 quota_bytes 时才真正更新家族配额；
    // 缺省时按申请单的 quota_bytes 生效。两条路径都写 audit_log。
    const finalQuota =
      typeof body.quota_bytes === 'number' && body.quota_bytes > 0
        ? body.quota_bytes
        : Number(record.quota_bytes);

    const updated = await this.prisma.$transaction(async (tx) => {
      const clan = await tx.clan.findUnique({
        where: { id: record.clan_id },
        select: { settings_json: true },
      });
      const settings = (clan?.settings_json as Prisma.JsonObject | null) || {};
      await tx.clan.update({
        where: { id: record.clan_id },
        data: {
          settings_json: {
            ...settings,
            storage_quota_bytes: finalQuota,
            storage_upgraded_at: new Date().toISOString(),
          } as Prisma.JsonObject,
        },
      });
      const u = await tx.storageUpgradeRequest.update({
        where: { id: record.id },
        data: {
          status: 'APPROVED',
          reviewed_at: new Date(),
          reviewer_id: reviewerId,
          reviewer_note: body.note?.trim() || null,
          applied_quota_bytes: BigInt(finalQuota),
        },
      });
      await tx.auditLog.create({
        data: {
          // 平台管理员并非 User，故显式传入 applicant (提交人) 作为审计主体；
          // 真正的审核动作同时写入 platformOperationLog（reject 分支已处理）
          user_id: record.applicant_id,
          action: 'STORAGE_UPGRADE_APPROVED',
          target_type: 'StorageUpgradeRequest',
          target_id: String(record.id),
          details: JSON.stringify({
            clan_id: String(record.clan_id),
            reviewer_admin_id: reviewerId,
            applicant_id: record.applicant_id,
            plan_code: record.plan_code,
            applied_quota_bytes: finalQuota,
            previous_quota_bytes: Number(record.current_quota_bytes),
            note: body.note?.trim() || null,
          }),
        },
      });
      // 平台管理员操作记录
      await tx.platformOperationLog.create({
        data: {
          admin_id: BigInt(reviewerId),
          action_type: 'STORAGE_UPGRADE_APPROVED',
          target_type: 'StorageUpgradeRequest',
          target_id: String(record.id),
          detail: {
            clan_id: String(record.clan_id),
            applicant_id: record.applicant_id,
            plan_code: record.plan_code,
            applied_quota_bytes: finalQuota,
            previous_quota_bytes: Number(record.current_quota_bytes),
            note: body.note?.trim() || null,
          } as Prisma.JsonObject,
          status: 'success',
        },
      });
      return u;
    });

    return { data: serializeBigInt(updated) };
  }
}
