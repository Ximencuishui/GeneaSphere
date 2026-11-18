import {
  Controller,
  Get,
  Post,
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
    await this.adminService.requireAdmin(record.clan_id, userId);
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
}
