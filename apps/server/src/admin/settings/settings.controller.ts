import { Controller, Get, Put, Post, Delete, Body, Param, Query, UseGuards, Request, NotFoundException, BadRequestException, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminService } from '../admin.service';
import { PrismaService } from '@geneasphere/db';
import { serializeBigInt } from '../../common/bigint-serializer';
import { refreshFamilyRulesVolume } from '../../cepu/clan-rules';
import { GenealogyEditionService } from '../../genealogy-edition/genealogy-edition.service';
import { clientIp } from '../../common/client-ip';
import { clanStorageQuotaBytes, summarizeMediaUsage } from '../storage/storage-quota';
import { assertExportRequest } from './clan-export-format';
import { ClanExportService } from './clan-export.service';

@ApiTags('admin/settings')
@Controller('api/admin/settings')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SettingsController {
  constructor(
    private readonly adminService: AdminService,
    private readonly prisma: PrismaService,
    private readonly edition: GenealogyEditionService,
    private readonly exports: ClanExportService,
  ) {}

  // ==================== 隐私配置 ====================

  /**
   * 获取隐私配置
   */
  @Get('privacy')
  @ApiOperation({ summary: 'Get privacy settings' })
  async getPrivacySettings(
    @Request() req,
    @Query('clanSlug') clanSlug: string,
  ) {
    const userId = req.user.userId;
    const clanId = await this.adminService.requireAdminBySlug(clanSlug, userId);


    let settings = await this.prisma.privacySetting.findUnique({
      where: { clan_id: clanId },
    });

    // 如果不存在则创建默认配置
    if (!settings) {
      settings = await this.prisma.privacySetting.create({
        data: {
          clan_id: clanId,
        },
      });
    }

    return {
      allow_visitor_deceased: settings.allow_visitor_deceased,
      max_generations_visible: settings.max_generations_visible,
      hide_living_photos: settings.hide_living_photos,
      hide_living_spouses: settings.hide_living_spouses,
      enable_relative_verify: settings.enable_relative_verify,
      verify_questions: settings.verify_questions,
      verify_max_attempts: settings.verify_max_attempts,
    };
  }

  /**
   * 更新隐私配置
   */
  @Put('privacy')
  @ApiOperation({ summary: 'Update privacy settings' })
  async updatePrivacySettings(
    @Request() req,
    @Body() body: any,
  ) {
    const userId = req.user.userId;
    const clanId = await this.adminService.requireAdminBySlug(body.clanSlug, userId);


    const settings = await this.prisma.privacySetting.upsert({
      where: { clan_id: clanId },
      update: {
        allow_visitor_deceased: body.allow_visitor_deceased,
        max_generations_visible: body.max_generations_visible,
        hide_living_photos: body.hide_living_photos,
        hide_living_spouses: body.hide_living_spouses,
        enable_relative_verify: body.enable_relative_verify,
        verify_questions: body.verify_questions,
        verify_max_attempts: body.verify_max_attempts,
      },
      create: {
        clan_id: clanId,
        allow_visitor_deceased: body.allow_visitor_deceased ?? false,
        max_generations_visible: body.max_generations_visible ?? 5,
        hide_living_photos: body.hide_living_photos ?? true,
        hide_living_spouses: body.hide_living_spouses ?? true,
        enable_relative_verify: body.enable_relative_verify ?? false,
        verify_questions: body.verify_questions ?? [],
        verify_max_attempts: body.verify_max_attempts ?? 3,
      },
    });

    await this.adminService.logAction({
      clanId,
      userId,
      action: 'UPDATE_PRIVACY_SETTINGS',
      targetType: 'PrivacySetting',
      targetId: settings.id.toString(),
      ipAddress: clientIp(req),
    });

    return { message: 'Privacy settings updated successfully', settings };
  }

  // ==================== 字辈管理 ====================

  /**
   * 获取字辈列表
   */
  @Get('xipai')
  @ApiOperation({ summary: 'Get xipai (generation characters) list' })
  async getXipai(
    @Request() req,
    @Query('clanSlug') clanSlug: string,
  ) {
    const userId = req.user.userId;
    const clanId = await this.adminService.requireAdminBySlug(clanSlug, userId);


    const xipai = await this.prisma.xipai.findMany({
      where: { clan_id: clanId },
      orderBy: { generation: 'asc' },
    });

    return xipai.map(x => ({
      id: x.id.toString(),
      generation: x.generation,
      character: x.character,
      note: x.note,
    }));
  }

  /**
   * 添加字辈
   */
  @Post('xipai')
  @ApiOperation({ summary: 'Add xipai character' })
  async addXipai(
    @Request() req,
    @Body() body: { clanSlug: string; generation: number; character: string; note?: string },
  ) {
    const userId = req.user.userId;
    const clanId = await this.adminService.requireAdminBySlug(body.clanSlug, userId);
    await this.edition.assertWritable(clanId);

    const xipai = await this.prisma.xipai.create({
      data: {
        clan_id: clanId,
        generation: body.generation,
        character: body.character,
        note: body.note,
      },
    });

    await this.adminService.logAction({
      clanId,
      userId,
      action: 'ADD_XIPAI',
      targetType: 'Xipai',
      targetId: xipai.id.toString(),
      details: `Added character ${body.character} for generation ${body.generation}`,
    });

    return { message: 'Xipai added successfully', data: serializeBigInt(xipai) };
  }

  /**
   * 更新字辈
   */
  @Put('xipai/:id')
  @ApiOperation({ summary: 'Update xipai character' })
  async updateXipai(
    @Request() req,
    @Param('id') xipaiIdStr: string,
    @Body() body: { character?: string; note?: string },
  ) {
    const userId = req.user.userId;
    const xipaiId = BigInt(xipaiIdStr);

    const xipai = await this.prisma.xipai.findUnique({
      where: { id: xipaiId },
    });

    if (!xipai) {
      throw new NotFoundException('Xipai not found');
    }

    await this.adminService.requireAdmin(xipai.clan_id, userId);
    await this.edition.assertWritable(xipai.clan_id);

    const updated = await this.prisma.xipai.update({
      where: { id: xipaiId },
      data: {
        character: body.character,
        note: body.note,
      },
    });

    await this.adminService.logAction({
      clanId: xipai.clan_id,
      userId,
      action: 'UPDATE_XIPAI',
      targetType: 'Xipai',
      targetId: xipaiIdStr,
    });

    return { message: 'Xipai updated successfully', data: serializeBigInt(updated) };
  }

  /**
   * 删除字辈
   */
  @Delete('xipai/:id')
  @ApiOperation({ summary: 'Delete xipai character' })
  async deleteXipai(
    @Request() req,
    @Param('id') xipaiIdStr: string,
  ) {
    const userId = req.user.userId;
    const xipaiId = BigInt(xipaiIdStr);

    const xipai = await this.prisma.xipai.findUnique({
      where: { id: xipaiId },
    });

    if (!xipai) {
      throw new NotFoundException('Xipai not found');
    }

    await this.adminService.requireAdmin(xipai.clan_id, userId);
    await this.edition.assertWritable(xipai.clan_id);

    const used = await this.prisma.personBio.count({
      where: {
        generation_char: xipai.character,
        person: { clan_id: xipai.clan_id },
      },
    });
    if (used > 0) {
      throw new BadRequestException('该字辈仍被人物使用，无法删除');
    }

    await this.prisma.xipai.delete({
      where: { id: xipaiId },
    });

    await this.adminService.logAction({
      clanId: xipai.clan_id,
      userId,
      action: 'DELETE_XIPAI',
      targetType: 'Xipai',
      targetId: xipaiIdStr,
    });

    return { message: 'Xipai deleted successfully' };
  }

  // ==================== 云存储 ====================

  /**
   * 获取存储用量
   */
  @Get('storage')
  @ApiOperation({ summary: 'Get storage usage' })
  async getStorageUsage(
    @Request() req,
    @Query('clanSlug') clanSlug: string,
  ) {
    const userId = req.user.userId;
    const clanId = await this.adminService.requireAdminBySlug(clanSlug, userId);
    const clan = await this.prisma.clan.findUnique({
      where: { id: clanId },
      select: { settings_json: true },
    });
    const maxStorage = clanStorageQuotaBytes(clan?.settings_json);
    const groups = await this.prisma.mediaArchive.groupBy({
      by: ['media_type'],
      where: { clan_id: clanId },
      _count: { _all: true },
      _sum: { file_size: true },
    });
    const summary = summarizeMediaUsage(groups.map((group) => ({
      media_type: group.media_type,
      count: group._count._all,
      bytes: Number(group._sum.file_size || 0),
    })));

    return {
      used_bytes: summary.used,
      used_percentage: maxStorage > 0 ? Math.round((summary.used / maxStorage) * 100) : 0,
      max_bytes: maxStorage,
      breakdown: summary.breakdown,
    };
  }

  // ==================== 数据导出 ====================

  @Post('exports')
  @ApiOperation({ summary: '提交家族数据异步导出任务' })
  async createExport(
    @Request() req,
    @Body() body: { clanSlug: string; type?: string; format?: string },
  ) {
    const userId = req.user.userId;
    const clanId = await this.adminService.requireAdminBySlug(body.clanSlug, userId);
    const request = assertExportRequest(body.type || 'all', body.format || 'json');
    const task = await this.exports.createPending(clanId, userId, body.clanSlug, request.type, request.format);
    await this.adminService.logAction({
      clanId,
      userId,
      action: 'EXPORT_CLAN_DATA',
      targetType: 'ClanExportTask',
      targetId: task.id.toString(),
      details: `${request.type}/${request.format}`,
      ipAddress: clientIp(req),
    });
    return {
      id: task.id.toString(),
      status: task.status,
      type: task.export_type,
      format: task.format,
      expires_at: task.expires_at,
    };
  }

  @Get('exports')
  @ApiOperation({ summary: '本家族导出任务' })
  async listExports(@Request() req, @Query('clanSlug') clanSlug: string) {
    const userId = req.user.userId;
    const clanId = await this.adminService.requireAdminBySlug(clanSlug, userId);
    const rows = await this.exports.list(clanId);
    return {
      data: rows.map((row) => ({
        id: row.id.toString(),
        type: row.export_type,
        format: row.format,
        status: row.status,
        file_name: row.file_name,
        error_message: row.error_message,
        created_at: row.created_at,
        completed_at: row.completed_at,
        expires_at: row.expires_at,
      })),
    };
  }

  @Get('exports/:id/download')
  @ApiOperation({ summary: '下载已完成的导出文件' })
  async downloadExport(
    @Request() req,
    @Param('id') id: string,
    @Query('clanSlug') clanSlug: string,
  ) {
    const userId = req.user.userId;
    const clanId = await this.adminService.requireAdminBySlug(clanSlug, userId);
    const file = await this.exports.openDownload(clanId, BigInt(id));
    return new StreamableFile(file.stream, {
      type: file.contentType,
      disposition: `attachment; filename="${file.filename}"`,
    });
  }

  // ==================== 家族信息编辑 ====================

  /**
   * 获取家族信息（含 slogan/origin_place/logo_url/cover_url 等扩展列）
   */
  @Get('clan-info')
  @ApiOperation({ summary: '获取家族信息' })
  async getClanInfo(
    @Request() req,
    @Query('clanSlug') clanSlug: string,
  ) {
    const userId = req.user.userId;
    const clanId = await this.adminService.requireAdminBySlug(clanSlug, userId);


    const clan = await this.prisma.clan.findUnique({
      where: { id: clanId },
      include: {
        admin_user: {
          select: { id: true, phone: true, nickname: true },
        },
      },
    });

    if (!clan) {
      throw new NotFoundException('Clan not found');
    }

    const settings = (clan.settings_json as Record<string, any>) || {};

    return {
      id: clan.id.toString(),
      name: clan.name,
      description: clan.description,
      slogan: clan.slogan,
      origin_place: clan.origin_place,
      logo_url: clan.logo_url,
      cover_url: clan.cover_url,
      spirit: clan.spirit,
      rules: clan.rules,
      admin_user: clan.admin_user ? {
        id: clan.admin_user.id,
        name: clan.admin_user.nickname || clan.admin_user.phone,
      } : null,
      settings_json: settings,
      // 便捷字段：直接读出 settings_json 里的扩展信息
      contact_email: settings.contact_email || '',
      contact_phone: settings.contact_phone || '',
      website: settings.website || '',
      established_year: settings.established_year || '',
      cultural_heritage: settings.cultural_heritage || '',
      notable_figures: settings.notable_figures || '',
      created_at: clan.created_at,
      updated_at: clan.updated_at,
    };
  }

  /**
   * 更新家族信息（含 slogan/origin_place/logo_url/cover_url 全字段）
   * - 兼容老字段（name/description/cover_url/default_role）
   * - 新增字段（slogan/origin_place/logo_url）落 clans 表扩展列
   * - 其他扩展信息（contact_email 等）入 settings_json
   */
  @Put('clan-info')
  @ApiOperation({ summary: '更新家族信息' })
  async updateClanInfo(
    @Request() req,
    @Body() body: any,
  ) {
    const userId = req.user.userId;
    const clanId = await this.adminService.requireAdminBySlug(body.clanSlug, userId);
    const touchesPublishedCopy = ['name', 'slogan', 'origin_place', 'cover_url', 'rules'].some((key) => body[key] !== undefined);
    if (touchesPublishedCopy) await this.edition.assertWritable(clanId);

    const updateData: any = {};

    // ---------- 基础字段（直接落 clans 表）----------
    if (body.name !== undefined) {
      updateData.name = body.name;
    }
    if (body.description !== undefined) {
      updateData.description = body.description;
    }
    if (body.slogan !== undefined) {
      updateData.slogan = body.slogan || null;
    }
    if (body.origin_place !== undefined) {
      updateData.origin_place = body.origin_place || null;
    }
    if (body.spirit !== undefined) {
      updateData.spirit = body.spirit || null;
    }
    if (body.rules !== undefined) {
      updateData.rules = body.rules || null;
    }
    if (body.logo_url !== undefined) {
      updateData.logo_url = body.logo_url || null;
    }

    // ---------- settings_json 中的老兼容字段 ----------
    let currentSettings: Record<string, any> =
      ((await this.prisma.clan.findUnique({ where: { id: clanId } }))?.settings_json as Record<string, any>) || {};

    let settingsChanged = false;

    // 兼容老逻辑：cover_url 在原代码中会写入 settings_json，
    // 但 clans 表新增了独立 cover_url 列后，统一以列为准；仅在未设列时才回填到 settings_json。
    if (body.cover_url !== undefined) {
      const coverUrl = body.cover_url || null;
      updateData.cover_url = coverUrl;
      if (coverUrl !== currentSettings.cover_url) {
        currentSettings = { ...currentSettings, cover_url: coverUrl };
        settingsChanged = true;
      }
    }

    if (body.default_role !== undefined) {
      currentSettings = { ...currentSettings, default_role: body.default_role };
      settingsChanged = true;
    }

    // 新增扩展字段（contact_email / contact_phone / website / established_year /
    //                cultural_heritage / notable_figures）统一入 settings_json
    const EXTRA_FIELDS = [
      'contact_email',
      'contact_phone',
      'website',
      'established_year',
      'cultural_heritage',
      'notable_figures',
    ];
    for (const key of EXTRA_FIELDS) {
      if (body[key] !== undefined) {
        currentSettings = { ...currentSettings, [key]: body[key] };
        settingsChanged = true;
      }
    }

    if (body.settings_json !== undefined && body.settings_json !== null) {
      currentSettings = { ...currentSettings, ...body.settings_json };
      settingsChanged = true;
    }

    if (settingsChanged) {
      updateData.settings_json = currentSettings;
    }

    const updated = await this.prisma.clan.update({
      where: { id: clanId },
      data: updateData,
    });
    if (body.rules !== undefined) {
      await refreshFamilyRulesVolume(this.prisma, clanId, updated.rules);
    }

    await this.adminService.logAction({
      clanId,
      userId,
      action: 'UPDATE_CLAN_INFO',
      targetType: 'Clan',
      targetId: clanId.toString(),
      details: `更新家族信息: ${body.name || ''}`,
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
}
