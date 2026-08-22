import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminService } from '../admin.service';
import { PrismaService } from '@geneasphere/db';
import { serializeBigInt } from '../../common/bigint-serializer';

/**
 * 家族概况（菜单重构 2026-08-20）
 * --------------------------------------------------------------------
 * 合并原【数据概览】+【家族信息】，并扩展为：
 *   - 家族信息：基础信息 / 视觉元素 / 扩展信息
 *   - 家族理事会（多成员）：理事姓名、联系方式、职务
 *   - 修谱小组（多成员）：联系人、联系方式、职责
 *
 * 路由前缀：/api/admin/clan-overview
 *
 * 说明：
 *   - clan_info / slogan / origin_place / logo_url / cover_url 现在直接作为 clans 表的列存储，
 *     其余扩展字段（联系邮箱/电话/网站/成立年份/文化遗产/家族名人）仍写入 settings_json。
 *   - 理事会与修谱小组是两张独立的子表（clan_council_members / clan_revision_team_members），
 *     支持完整 CRUD。
 */
@ApiTags('admin/clan-overview')
@Controller('api/admin/clan-overview')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ClanOverviewController {
  constructor(
    private readonly adminService: AdminService,
    private readonly prisma: PrismaService,
  ) {}

  // ==================== 一站式概览数据 ====================

  /**
   * 一站式获取家族概况
   * - clan:           家族基础信息（含 slogan/origin_place/logo_url/cover_url）
   * - extra:          settings_json 中的扩展信息（联系邮箱/电话/网站/成立年份/文化遗产/家族名人）
   * - council:        家族理事会成员列表（按 sort_order 排序）
   * - revision_team:  修谱小组成员列表（按 sort_order 排序）
   * - admin_user:     创建人简要信息
   */
  @Get()
  @ApiOperation({ summary: '获取家族概况（含理事会/修谱小组）' })
  async getOverview(@Request() req, @Query('clanSlug') clanSlug: string) {
    const userId = req.user.userId;
    const clanId = await this.adminService.requireAdminBySlug(clanSlug, userId);

    const clan = await this.prisma.clan.findUnique({
      where: { id: clanId },
      include: {
        admin_user: { select: { id: true, phone: true, nickname: true } },
      },
    });

    if (!clan) {
      throw new NotFoundException('Clan not found');
    }

    const [councilMembers, revisionTeamMembers] = await Promise.all([
      this.prisma.clanCouncilMember.findMany({
        where: { clan_id: clanId },
        orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.clanRevisionTeamMember.findMany({
        where: { clan_id: clanId },
        orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
      }),
    ]);

    const settings = (clan.settings_json as Record<string, any>) || {};

    return {
      clan: {
        id: clan.id.toString(),
        name: clan.name,
        description: clan.description,
        slogan: clan.slogan,
        origin_place: clan.origin_place,
        logo_url: clan.logo_url,
        cover_url: clan.cover_url,
        spirit: clan.spirit,
        rules: clan.rules,
        created_at: clan.created_at,
        updated_at: clan.updated_at,
        admin_user: clan.admin_user
          ? {
              id: clan.admin_user.id,
              name: clan.admin_user.nickname || clan.admin_user.phone,
            }
          : null,
      },
      // settings_json 中遗留的扩展字段（保持向后兼容）
      extra: {
        contact_email: settings.contact_email || '',
        contact_phone: settings.contact_phone || '',
        website: settings.website || '',
        established_year: settings.established_year || '',
        cultural_heritage: settings.cultural_heritage || '',
        notable_figures: settings.notable_figures || '',
      },
      council: councilMembers.map((m) => serializeBigInt(m)),
      revision_team: revisionTeamMembers.map((m) => serializeBigInt(m)),
    };
  }

  // ==================== 家族信息（CRUD 全字段） ====================

  /**
   * 更新家族信息（含 slogan/origin_place/logo_url/cover_url/description + settings_json）
   * 前端 FamilyOverviewPage 顶部的「设置」图标点击后触发的弹窗使用此接口。
   */
  @Put('info')
  @ApiOperation({ summary: '更新家族信息（含 slogan/origin_place/logo_url 等扩展列）' })
  async updateInfo(@Request() req, @Body() body: any) {
    const userId = req.user.userId;
    const clanId = await this.adminService.requireAdminBySlug(body.clanSlug, userId);

    const updateData: any = {};

    // 基础信息
    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.slogan !== undefined) updateData.slogan = body.slogan || null;
    if (body.origin_place !== undefined) updateData.origin_place = body.origin_place || null;
    if (body.spirit !== undefined) updateData.spirit = body.spirit || null;
    if (body.rules !== undefined) updateData.rules = body.rules || null;

    // 视觉元素
    if (body.logo_url !== undefined) updateData.logo_url = body.logo_url || null;
    if (body.cover_url !== undefined) updateData.cover_url = body.cover_url || null;

    // 其他扩展字段（settings_json 落库）
    const EXTRA_KEYS = [
      'contact_email',
      'contact_phone',
      'website',
      'established_year',
      'cultural_heritage',
      'notable_figures',
    ];
    const hasExtra = EXTRA_KEYS.some((k) => body[k] !== undefined);
    if (hasExtra || body.settings_json !== undefined) {
      const current = ((await this.prisma.clan.findUnique({ where: { id: clanId } }))?.settings_json ||
        {}) as Record<string, any>;
      const merged: Record<string, any> = { ...current, ...(body.settings_json || {}) };
      for (const k of EXTRA_KEYS) {
        if (body[k] !== undefined) {
          merged[k] = body[k];
        }
      }
      updateData.settings_json = merged;
    }

    const updated = await this.prisma.clan.update({
      where: { id: clanId },
      data: updateData,
    });

    await this.adminService.logAction({
      clanId,
      userId,
      action: 'UPDATE_CLAN_INFO',
      targetType: 'Clan',
      targetId: clanId.toString(),
      details: `更新家族信息: ${updated.name}`,
    });

    return {
      id: updated.id.toString(),
      name: updated.name,
      description: updated.description,
      slogan: updated.slogan,
      origin_place: updated.origin_place,
      logo_url: updated.logo_url,
      cover_url: updated.cover_url,
      spirit: updated.spirit,
      rules: updated.rules,
      settings_json: updated.settings_json,
      updated_at: updated.updated_at,
    };
  }

  // ==================== 家族理事会 ====================

  @Get('council')
  @ApiOperation({ summary: '获取家族理事会成员列表' })
  async listCouncil(@Request() req, @Query('clanSlug') clanSlug: string) {
    const userId = req.user.userId;
    const clanId = await this.adminService.requireAdminBySlug(clanSlug, userId);
    const members = await this.prisma.clanCouncilMember.findMany({
      where: { clan_id: clanId },
      orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
    });
    return { members: members.map((m) => serializeBigInt(m)) };
  }

  @Post('council')
  @ApiOperation({ summary: '新增家族理事会成员' })
  async createCouncilMember(@Request() req, @Body() body: any) {
    const userId = req.user.userId;
    const clanId = await this.adminService.requireAdminBySlug(body.clanSlug, userId);

    if (!body.name?.trim()) {
      throw new NotFoundException('name is required');
    }
    if (!body.contact?.trim()) {
      throw new NotFoundException('contact is required');
    }

    // 新增默认排在最后（sort_order = max + 1）
    const maxOrder = await this.prisma.clanCouncilMember.aggregate({
      where: { clan_id: clanId },
      _max: { sort_order: true },
    });
    const sort_order = (maxOrder._max.sort_order ?? -1) + 1;

    const member = await this.prisma.clanCouncilMember.create({
      data: {
        clan_id: clanId,
        name: body.name.trim(),
        contact: body.contact.trim(),
        position: body.position?.trim() || null,
        sort_order: body.sort_order ?? sort_order,
        remark: body.remark?.trim() || null,
      },
    });

    await this.adminService.logAction({
      clanId,
      userId,
      action: 'CREATE_COUNCIL_MEMBER',
      targetType: 'ClanCouncilMember',
      targetId: member.id.toString(),
      details: `新增理事 ${member.name}`,
    });

    return serializeBigInt(member);
  }

  @Put('council/:id')
  @ApiOperation({ summary: '更新家族理事会成员' })
  async updateCouncilMember(
    @Request() req,
    @Param('id') idStr: string,
    @Body() body: any,
  ) {
    const userId = req.user.userId;
    const id = BigInt(idStr);

    const existing = await this.prisma.clanCouncilMember.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Council member not found');
    }
    await this.adminService.requireAdmin(existing.clan_id, userId);

    const data: any = {};
    if (body.name !== undefined) data.name = body.name.trim();
    if (body.contact !== undefined) data.contact = body.contact.trim();
    if (body.position !== undefined) data.position = body.position?.trim() || null;
    if (body.sort_order !== undefined) data.sort_order = body.sort_order;
    if (body.remark !== undefined) data.remark = body.remark?.trim() || null;

    const updated = await this.prisma.clanCouncilMember.update({ where: { id }, data });

    await this.adminService.logAction({
      clanId: existing.clan_id,
      userId,
      action: 'UPDATE_COUNCIL_MEMBER',
      targetType: 'ClanCouncilMember',
      targetId: idStr,
      details: `更新理事 ${updated.name}`,
    });

    return serializeBigInt(updated);
  }

  @Delete('council/:id')
  @ApiOperation({ summary: '删除家族理事会成员' })
  async deleteCouncilMember(@Request() req, @Param('id') idStr: string) {
    const userId = req.user.userId;
    const id = BigInt(idStr);

    const existing = await this.prisma.clanCouncilMember.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Council member not found');
    }
    await this.adminService.requireAdmin(existing.clan_id, userId);

    await this.prisma.clanCouncilMember.delete({ where: { id } });

    await this.adminService.logAction({
      clanId: existing.clan_id,
      userId,
      action: 'DELETE_COUNCIL_MEMBER',
      targetType: 'ClanCouncilMember',
      targetId: idStr,
      details: `删除理事 ${existing.name}`,
    });

    return { message: 'deleted', id: idStr };
  }

  // ==================== 修谱小组 ====================

  @Get('revision-team')
  @ApiOperation({ summary: '获取修谱小组成员列表' })
  async listRevisionTeam(@Request() req, @Query('clanSlug') clanSlug: string) {
    const userId = req.user.userId;
    const clanId = await this.adminService.requireAdminBySlug(clanSlug, userId);
    const members = await this.prisma.clanRevisionTeamMember.findMany({
      where: { clan_id: clanId },
      orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
    });
    return { members: members.map((m) => serializeBigInt(m)) };
  }

  @Post('revision-team')
  @ApiOperation({ summary: '新增修谱小组成员' })
  async createRevisionTeamMember(@Request() req, @Body() body: any) {
    const userId = req.user.userId;
    const clanId = await this.adminService.requireAdminBySlug(body.clanSlug, userId);

    if (!body.name?.trim()) {
      throw new NotFoundException('name is required');
    }
    if (!body.contact?.trim()) {
      throw new NotFoundException('contact is required');
    }

    const maxOrder = await this.prisma.clanRevisionTeamMember.aggregate({
      where: { clan_id: clanId },
      _max: { sort_order: true },
    });
    const sort_order = (maxOrder._max.sort_order ?? -1) + 1;

    const member = await this.prisma.clanRevisionTeamMember.create({
      data: {
        clan_id: clanId,
        name: body.name.trim(),
        contact: body.contact.trim(),
        duty: body.duty?.trim() || null,
        sort_order: body.sort_order ?? sort_order,
        remark: body.remark?.trim() || null,
      },
    });

    await this.adminService.logAction({
      clanId,
      userId,
      action: 'CREATE_REVISION_TEAM_MEMBER',
      targetType: 'ClanRevisionTeamMember',
      targetId: member.id.toString(),
      details: `新增修谱组成员 ${member.name}`,
    });

    return serializeBigInt(member);
  }

  @Put('revision-team/:id')
  @ApiOperation({ summary: '更新修谱小组成员' })
  async updateRevisionTeamMember(
    @Request() req,
    @Param('id') idStr: string,
    @Body() body: any,
  ) {
    const userId = req.user.userId;
    const id = BigInt(idStr);

    const existing = await this.prisma.clanRevisionTeamMember.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Revision team member not found');
    }
    await this.adminService.requireAdmin(existing.clan_id, userId);

    const data: any = {};
    if (body.name !== undefined) data.name = body.name.trim();
    if (body.contact !== undefined) data.contact = body.contact.trim();
    if (body.duty !== undefined) data.duty = body.duty?.trim() || null;
    if (body.sort_order !== undefined) data.sort_order = body.sort_order;
    if (body.remark !== undefined) data.remark = body.remark?.trim() || null;

    const updated = await this.prisma.clanRevisionTeamMember.update({ where: { id }, data });

    await this.adminService.logAction({
      clanId: existing.clan_id,
      userId,
      action: 'UPDATE_REVISION_TEAM_MEMBER',
      targetType: 'ClanRevisionTeamMember',
      targetId: idStr,
      details: `更新修谱组成员 ${updated.name}`,
    });

    return serializeBigInt(updated);
  }

  @Delete('revision-team/:id')
  @ApiOperation({ summary: '删除修谱小组成员' })
  async deleteRevisionTeamMember(@Request() req, @Param('id') idStr: string) {
    const userId = req.user.userId;
    const id = BigInt(idStr);

    const existing = await this.prisma.clanRevisionTeamMember.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Revision team member not found');
    }
    await this.adminService.requireAdmin(existing.clan_id, userId);

    await this.prisma.clanRevisionTeamMember.delete({ where: { id } });

    await this.adminService.logAction({
      clanId: existing.clan_id,
      userId,
      action: 'DELETE_REVISION_TEAM_MEMBER',
      targetType: 'ClanRevisionTeamMember',
      targetId: idStr,
      details: `删除修谱组成员 ${existing.name}`,
    });

    return { message: 'deleted', id: idStr };
  }
}