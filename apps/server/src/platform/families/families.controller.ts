import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  NotFoundException,
  BadRequestException,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { PrismaService } from '@geneasphere/db';
import { ClanPlatformStatus } from '@prisma/client';
import { PlatformAuthGuard } from '../auth/platform-auth.guard';
import { PlatformOperationLogService } from '../common/platform-operation-log.service';
import { getClientIp } from '../common/ip.util';

@ApiTags('platform/families')
@ApiBearerAuth('platform')
@UseGuards(PlatformAuthGuard)
@Controller('api/platform/families')
export class FamiliesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logService: PlatformOperationLogService,
  ) {}

  @Get()
  @ApiOperation({ summary: '获取全平台家族列表' })
  async list(
    @Query('keyword') keyword?: string,
    @Query('status') status?: string,
    @Query('page') pageStr = '1',
    @Query('pageSize') pageSizeStr = '20',
    @Query('startDate') startDateStr?: string,
    @Query('endDate') endDateStr?: string,
  ) {
    const page = parseInt(pageStr) || 1;
    const pageSize = parseInt(pageSizeStr) || 20;
    const skip = (page - 1) * pageSize;

    const where: any = { status: { not: 'DELETED' } };
    if (keyword) {
      where.OR = [
        { name: { contains: keyword, mode: 'insensitive' } },
        { description: { contains: keyword, mode: 'insensitive' } },
      ];
    }
    if (status) {
      where.status = status;
    }
    if (startDateStr || endDateStr) {
      where.created_at = {};
      if (startDateStr) where.created_at.gte = new Date(startDateStr);
      if (endDateStr) where.created_at.lte = new Date(endDateStr);
    }

    const [items, total] = await Promise.all([
      this.prisma.clan.findMany({
        where,
        include: {
          admin_user: { select: { id: true, phone: true } },
          _count: { select: { members: true, media: true, persons: true } },
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.clan.count({ where }),
    ]);

    return {
      data: items.map((c) => ({
        id: c.id.toString(),
        name: c.name,
        description: c.description,
        status: c.status,
        admin_user_id: c.admin_user_id,
        admin_phone_masked: c.admin_user
          ? c.admin_user.phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2')
          : null,
        member_count: c._count.members,
        person_count: c._count.persons,
        media_count: c._count.media,
        register_ip: c.register_ip,
        created_at: c.created_at,
        reviewed_at: c.reviewed_at,
        has_id_card: !!c.id_card_url,
        id_card_uploaded_at: c.id_card_uploaded_at,
      })),
      pagination: {
        page,
        page_size: pageSize,
        total,
        total_pages: Math.ceil(total / pageSize),
      },
    };
  }

  @Get(':id')
  @ApiOperation({ summary: '获取家族详情' })
  async detail(@Param('id') idStr: string) {
    const id = BigInt(idStr);
    const clan = await this.prisma.clan.findUnique({
      where: { id },
      include: {
        admin_user: { select: { id: true, phone: true, created_at: true } },
      },
    });
    if (!clan) {
      throw new NotFoundException('家族不存在');
    }
    const [memberCount, mediaCount, storageSum, printOrderCount, smsBalanceRecord] =
      await Promise.all([
        this.prisma.clanMember.count({ where: { clan_id: id } }),
        this.prisma.mediaArchive.count({ where: { clan_id: id } }),
        this.prisma.mediaArchive.aggregate({
          where: { clan_id: id },
          _sum: { file_size: true },
        }),
        this.prisma.printOrder.count({ where: { clan_id: id } }),
        (this.prisma as any).clanBalance?.findUnique?.({ where: { clan_id: id } }) || Promise.resolve(null),
      ]);

    const smsBalance = smsBalanceRecord ? Number(smsBalanceRecord.balance) : 0;

    return {
      id: clan.id.toString(),
      name: clan.name,
      description: clan.description,
      status: clan.status,
      admin_user: {
        id: clan.admin_user.id,
        phone_masked: clan.admin_user.phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2'),
        created_at: clan.admin_user.created_at,
      },
      register_ip: clan.register_ip,
      reviewed_at: clan.reviewed_at,
      reviewer_id: clan.reviewer_id?.toString() ?? null,
      stats: {
        member_count: memberCount,
        media_count: mediaCount,
        storage_bytes: Number(storageSum._sum.file_size || 0),
        print_order_count: printOrderCount,
        sms_balance: smsBalance,
      },
      created_at: clan.created_at,
      updated_at: clan.updated_at,
    };
  }

  @Post(':id/approve')
  @ApiOperation({ summary: '审核通过家族（需先上传证件）' })
  async approve(@Param('id') idStr: string, @Request() req: any) {
    const id = BigInt(idStr);
    const clan = await this.prisma.clan.findUnique({
      where: { id },
      select: { id_card_url: true, status: true },
    });
    if (!clan) {
      throw new NotFoundException('家族不存在');
    }
    if (!clan.id_card_url) {
      throw new BadRequestException(
        '该家族尚未上传身份证件，无法通过审核。请要求家族管理员上传证件后再审核。',
      );
    }
    const updated = await this.prisma.clan.update({
      where: { id },
      data: {
        status: ClanPlatformStatus.NORMAL,
        reviewed_at: new Date(),
        reviewer_id: BigInt(req.user.adminId),
      },
    });
    await this.logService.log({
      adminId: req.user.adminId,
      actionType: 'APPROVE_CLAN',
      targetType: 'Clan',
      targetId: idStr,
      ipAddress: getClientIp(req),
    });
    return { message: '已通过', status: updated.status };
  }

  /**
   * 上传家族管理员身份证件（需求 §3.3.2）
   * Body: { file_url, file_name, file_size, mime_type, uploader_id? }
   * 说明：当前通过 URL 引用已上传到 COS 的文件，避免 controller 接收二进制。
   */
  @Post(':id/id-card')
  @ApiOperation({ summary: '上传家族管理员证件' })
  async uploadIdCard(
    @Param('id') idStr: string,
    @Body()
    body: {
      file_url: string;
      file_name: string;
      file_size?: number;
      mime_type: string;
      uploader_id?: string;
    },
    @Request() req: any,
  ) {
    if (!body.file_url || !body.file_name || !body.mime_type) {
      throw new BadRequestException('file_url / file_name / mime_type 必填');
    }
    const id = BigInt(idStr);
    const clan = await this.prisma.clan.findUnique({ where: { id } });
    if (!clan) throw new NotFoundException('家族不存在');

    const uploaderId =
      body.uploader_id ||
      (clan.admin_user_id ? clan.admin_user_id.toString() : req.user.adminId);

    const attachment = await this.prisma.clanReviewAttachment.create({
      data: {
        clan_id: id,
        uploader_id: uploaderId,
        file_url: body.file_url,
        file_name: body.file_name,
        file_size: body.file_size || 0,
        mime_type: body.mime_type,
      },
    });

    await this.prisma.clan.update({
      where: { id },
      data: {
        id_card_url: body.file_url,
        id_card_uploaded_at: new Date(),
      },
    });

    await this.logService.log({
      adminId: req.user.adminId,
      actionType: 'UPLOAD_CLAN_ID_CARD',
      targetType: 'Clan',
      targetId: idStr,
      detail: { attachment_id: attachment.id.toString() },
      ipAddress: getClientIp(req),
    });

    return {
      message: '证件已上传',
      attachment_id: attachment.id.toString(),
      id_card_url: body.file_url,
    };
  }

  @Get(':id/id-card')
  @ApiOperation({ summary: '获取家族管理员证件信息' })
  async getIdCard(@Param('id') idStr: string) {
    const id = BigInt(idStr);
    const clan = await this.prisma.clan.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        id_card_url: true,
        id_card_uploaded_at: true,
      },
    });
    if (!clan) throw new NotFoundException('家族不存在');

    const attachments = await this.prisma.clanReviewAttachment.findMany({
      where: { clan_id: id },
      orderBy: { created_at: 'desc' },
    });

    return {
      clan_id: clan.id.toString(),
      clan_name: clan.name,
      has_id_card: !!clan.id_card_url,
      id_card_url: clan.id_card_url,
      id_card_uploaded_at: clan.id_card_uploaded_at,
      attachments: attachments.map((a) => ({
        id: a.id.toString(),
        file_url: a.file_url,
        file_name: a.file_name,
        file_size: a.file_size,
        mime_type: a.mime_type,
        created_at: a.created_at,
      })),
    };
  }

  @Post(':id/reject')
  @ApiOperation({ summary: '驳回家族注册' })
  async reject(
    @Param('id') idStr: string,
    @Body() body: { reason: string },
    @Request() req: any,
  ) {
    if (!body.reason) {
      throw new BadRequestException('请填写驳回理由');
    }
    const id = BigInt(idStr);
    const updated = await this.prisma.clan.update({
      where: { id },
      data: { status: ClanPlatformStatus.DELETED, reviewed_at: new Date() },
    });
    await this.logService.log({
      adminId: req.user.adminId,
      actionType: 'REJECT_CLAN',
      targetType: 'Clan',
      targetId: idStr,
      detail: { reason: body.reason },
      ipAddress: getClientIp(req),
    });
    return { message: '已驳回', status: updated.status };
  }

  @Post(':id/freeze')
  @ApiOperation({ summary: '冻结家族' })
  async freeze(@Param('id') idStr: string, @Request() req: any) {
    const id = BigInt(idStr);
    const updated = await this.prisma.clan.update({
      where: { id },
      data: { status: ClanPlatformStatus.FROZEN },
    });
    await this.logService.log({
      adminId: req.user.adminId,
      actionType: 'FREEZE_CLAN',
      targetType: 'Clan',
      targetId: idStr,
      ipAddress: getClientIp(req),
    });
    return { message: '已冻结', status: updated.status };
  }

  @Post(':id/unfreeze')
  @ApiOperation({ summary: '解冻家族' })
  async unfreeze(@Param('id') idStr: string, @Request() req: any) {
    const id = BigInt(idStr);
    const updated = await this.prisma.clan.update({
      where: { id },
      data: { status: ClanPlatformStatus.NORMAL },
    });
    await this.logService.log({
      adminId: req.user.adminId,
      actionType: 'UNFREEZE_CLAN',
      targetType: 'Clan',
      targetId: idStr,
      ipAddress: getClientIp(req),
    });
    return { message: '已解冻', status: updated.status };
  }

  @Delete(':id')
  @ApiOperation({ summary: '逻辑删除家族' })
  async remove(@Param('id') idStr: string, @Request() req: any) {
    const id = BigInt(idStr);
    const updated = await this.prisma.clan.update({
      where: { id },
      data: { status: ClanPlatformStatus.DELETED },
    });
    await this.logService.log({
      adminId: req.user.adminId,
      actionType: 'DELETE_CLAN',
      targetType: 'Clan',
      targetId: idStr,
      ipAddress: getClientIp(req),
    });
    return { message: '已删除（30天内可联系客服恢复）', status: updated.status };
  }

  @Get(':id/export')
  @ApiOperation({ summary: '导出家族数据（JSON）' })
  async exportClan(@Param('id') idStr: string, @Request() req: any, @Res() res: Response) {
    const id = BigInt(idStr);
    const [clan, persons, families, familyChildren, ancestry, media, xipai, members] =
      await Promise.all([
        this.prisma.clan.findUnique({ where: { id } }),
        this.prisma.person.findMany({ where: { clan_id: id } }),
        this.prisma.familyUnit.findMany({ where: { clan_id: id } }),
        this.prisma.familyChild.findMany({ where: { family: { clan_id: id } } }),
        this.prisma.personAncestry.findMany({ where: { ancestor: { clan_id: id } } }),
        this.prisma.mediaArchive.findMany({ where: { clan_id: id } }),
        this.prisma.xipai.findMany({ where: { clan_id: id } }),
        this.prisma.clanMember.findMany({ where: { clan_id: id } }),
      ]);

    const payload = {
      exported_at: new Date().toISOString(),
      clan: clan
        ? {
            id: clan.id.toString(),
            name: clan.name,
            description: clan.description,
            created_at: clan.created_at,
          }
        : null,
      persons: persons.map((p) => ({
        id: p.id.toString(),
        full_name: p.full_name,
        gender: p.gender,
        birth_date: p.birth_date,
        death_date: p.death_date,
        is_living: p.is_living,
      })),
      families: families.map((f) => ({
        id: f.id.toString(),
        husband_id: f.husband_id?.toString() ?? null,
        wife_id: f.wife_id?.toString() ?? null,
      })),
      family_children: familyChildren.map((fc) => ({
        family_id: fc.family_id.toString(),
        child_id: fc.child_id.toString(),
        birth_order: fc.birth_order,
      })),
      ancestry: ancestry.map((a) => ({
        ancestor_id: a.ancestor_id.toString(),
        descendant_id: a.descendant_id.toString(),
        depth: a.depth,
      })),
      media_count: media.length,
      xipai: xipai.map((x) => ({ generation: x.generation, character: x.character })),
      members_count: members.length,
    };

    await this.logService.log({
      adminId: req.user.adminId,
      actionType: 'EXPORT_CLAN_DATA',
      targetType: 'Clan',
      targetId: idStr,
      ipAddress: getClientIp(req),
    });

    res.set({
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="clan_${idStr}_${Date.now()}.json"`,
    });
    res.send(JSON.stringify(payload, null, 2));
  }
}
