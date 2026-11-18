import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@geneasphere/db';
import { serializeBigInt } from '../../common/bigint-serializer';
import { clientIp } from '../../common/client-ip';
import { PlatformAuthGuard } from '../auth/platform-auth.guard';

function reviewerNote(adminId: string, note?: string): string {
  const prefix = `platform_admin:${adminId}`;
  const text = note?.trim();
  return text ? `${prefix} ${text}` : prefix;
}

/**
 * 平台管理员审核扩容。单独挂在 /api/platform，避免和家族用户 JWT 抢同一套守卫。
 * reviewer_id 指向 User，不能写入平台管理员 id。
 */
@ApiTags('platform/storage')
@ApiBearerAuth('platform')
@UseGuards(PlatformAuthGuard)
@Controller('api/platform/storage')
export class PlatformStorageUpgradeController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('upgrade-requests')
  @ApiOperation({ summary: '平台管理员查看所有扩容申请' })
  async adminListAll(
    @Query('status') status?: string,
    @Query('page') pageStr = '1',
    @Query('pageSize') pageSizeStr = '20',
  ) {
    const page = parseInt(pageStr) || 1;
    const pageSize = Math.min(parseInt(pageSizeStr) || 20, 100);
    const where = status ? { status: status as never } : {};
    const [rows, total] = await Promise.all([
      this.prisma.storageUpgradeRequest.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.storageUpgradeRequest.count({ where }),
    ]);
    return { data: serializeBigInt(rows), pagination: { page, pageSize, total } };
  }

  @Put('upgrade-requests/:id/review')
  @ApiOperation({ summary: '平台管理员审核扩容申请' })
  async adminReview(
    @Request() req,
    @Param('id') id: string,
    @Body() body: { action: 'APPROVE' | 'REJECT'; note?: string; quota_bytes?: number },
  ) {
    if (!['APPROVE', 'REJECT'].includes(body?.action)) {
      throw new BadRequestException('action 必须是 APPROVE 或 REJECT');
    }
    const record = await this.prisma.storageUpgradeRequest.findUnique({ where: { id: BigInt(id) } });
    if (!record) throw new NotFoundException('申请不存在');
    if (record.status !== 'PENDING') throw new BadRequestException('只有待审核的申请可以审核');
    const adminId = String(req.user.adminId);
    const note = reviewerNote(adminId, body.note);
    const ip = clientIp(req);

    if (body.action === 'REJECT') {
      const updated = await this.prisma.$transaction(async (tx) => {
        const row = await tx.storageUpgradeRequest.update({
          where: { id: record.id },
          data: {
            status: 'REJECTED',
            reviewed_at: new Date(),
            reviewer_id: null,
            reviewer_note: note,
          },
        });
        await tx.platformOperationLog.create({
          data: {
            admin_id: BigInt(adminId),
            action_type: 'STORAGE_UPGRADE_REJECTED',
            target_type: 'StorageUpgradeRequest',
            target_id: String(record.id),
            detail: {
              clan_id: String(record.clan_id),
              applicant_id: record.applicant_id,
              plan_code: record.plan_code,
              note,
              ip: ip || null,
            } as Prisma.JsonObject,
            status: 'success',
          },
        });
        return row;
      });
      return { data: serializeBigInt(updated) };
    }

    const finalQuota = typeof body.quota_bytes === 'number' && body.quota_bytes > 0
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
      const row = await tx.storageUpgradeRequest.update({
        where: { id: record.id },
        data: {
          status: 'APPROVED',
          reviewed_at: new Date(),
          reviewer_id: null,
          reviewer_note: note,
          applied_quota_bytes: BigInt(finalQuota),
        },
      });
      await tx.auditLog.create({
        data: {
          clan_id: record.clan_id,
          user_id: record.applicant_id,
          action: 'STORAGE_UPGRADE_APPROVED',
          target_type: 'StorageUpgradeRequest',
          target_id: String(record.id),
          ip_address: ip,
          details: JSON.stringify({
            reviewer_admin_id: adminId,
            applicant_id: record.applicant_id,
            plan_code: record.plan_code,
            applied_quota_bytes: finalQuota,
            previous_quota_bytes: Number(record.current_quota_bytes),
            note,
          }),
        },
      });
      await tx.platformOperationLog.create({
        data: {
          admin_id: BigInt(adminId),
          action_type: 'STORAGE_UPGRADE_APPROVED',
          target_type: 'StorageUpgradeRequest',
          target_id: String(record.id),
          detail: {
            clan_id: String(record.clan_id),
            applicant_id: record.applicant_id,
            plan_code: record.plan_code,
            applied_quota_bytes: finalQuota,
            previous_quota_bytes: Number(record.current_quota_bytes),
            note,
          } as Prisma.JsonObject,
          status: 'success',
        },
      });
      return row;
    });
    return { data: serializeBigInt(updated) };
  }
}
