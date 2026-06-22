import { Controller, Get, Put, Post, Delete, Body, Param, Query, UseGuards, Request, NotFoundException, Header, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminService } from '../admin.service';
import { PrismaService } from '@geneasphere/db';
import { Role } from '@prisma/client';

@ApiTags('admin/settings')
@Controller('api/admin/settings')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SettingsController {
  constructor(
    private readonly adminService: AdminService,
    private readonly prisma: PrismaService,
  ) {}

  // ==================== 隐私配置 ====================

  /**
   * 获取隐私配置
   */
  @Get('privacy')
  @ApiOperation({ summary: 'Get privacy settings' })
  async getPrivacySettings(
    @Request() req,
    @Query('clanId') clanIdStr: string,
  ) {
    const userId = req.user.userId;
    const clanId = BigInt(clanIdStr);

    await this.adminService.requireAdmin(clanId, userId);

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
    const clanId = BigInt(body.clanId);

    await this.adminService.requireAdmin(clanId, userId);

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
    @Query('clanId') clanIdStr: string,
  ) {
    const userId = req.user.userId;
    const clanId = BigInt(clanIdStr);

    await this.adminService.requireAdmin(clanId, userId);

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
    @Body() body: { clanId: string; generation: number; character: string; note?: string },
  ) {
    const userId = req.user.userId;
    const clanId = BigInt(body.clanId);

    await this.adminService.requireAdmin(clanId, userId);

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

    return { message: 'Xipai added successfully', data: xipai };
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

    return { message: 'Xipai updated successfully', data: updated };
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
    @Query('clanId') clanIdStr: string,
  ) {
    const userId = req.user.userId;
    const clanId = BigInt(clanIdStr);

    await this.adminService.requireAdmin(clanId, userId);

    // 获取各类文件大小
    // 说明：云存储分项计数（视频/其他文件）暂仅返回 0，
// 需求文档 4.5.3 中明确表示"本次暂不实现"，仅展示提示。
// 后续可扩展为根据 media_type 字段聚合统计。
const [photos, videos, others] = await Promise.all([
      this.prisma.mediaArchive.count({
        where: { clan_id: clanId },
      }),
      Promise.resolve(0), // 视频数量统计预留，当前 schema 未提供 media_type 字段
      Promise.resolve(0), // 其他文件数量统计预留，当前 schema 未提供 media_type 字段
    ]);

    const totalSize = await this.calculateStorageUsage(clanId);
    const maxStorage = 5 * 1024 * 1024 * 1024; // 5GB

    return {
      used_bytes: totalSize,
      used_percentage: Math.round((totalSize / maxStorage) * 100),
      max_bytes: maxStorage,
      breakdown: {
        photos: photos,
        videos: videos,
        others: others,
      },
    };
  }

  private async calculateStorageUsage(clanId: bigint): Promise<number> {
    // 这里假设 media_archives 有 file_size 字段
    // 如果没有，需要在 schema 中添加
    const result = await this.prisma.$queryRaw<[{ total: bigint }]>`
      SELECT COALESCE(SUM(file_size), 0) as total
      FROM media_archives
      WHERE clan_id = ${clanId}
    `.catch(() => [{ total: BigInt(0) }]);

    return Number(result[0]?.total || 0);
  }

  // ==================== 数据导出 ====================

  /**
   * 导出家族全部数据（JSON 格式）
   */
  @Get('export')
  @ApiOperation({ summary: 'Export all clan data as JSON' })
  async exportClanData(
    @Request() req,
    @Query('clanId') clanIdStr: string,
  ) {
    const userId = req.user.userId;
    const clanId = BigInt(clanIdStr);

    await this.adminService.requireAdmin(clanId, userId);

    // 收集所有家族数据
    const [
      clan,
      persons,
      families,
      familyChildren,
      ancestry,
      media,
      xipai,
      privacySettings,
      members,
    ] = await Promise.all([
      this.prisma.clan.findUnique({ where: { id: clanId } }),
      this.prisma.person.findMany({ where: { clan_id: clanId } }),
      this.prisma.familyUnit.findMany({ where: { clan_id: clanId } }),
      this.prisma.familyChild.findMany({
        where: { family: { clan_id: clanId } },
      }),
      this.prisma.personAncestry.findMany({
        where: { ancestor: { clan_id: clanId } },
      }),
      this.prisma.mediaArchive.findMany({ where: { clan_id: clanId } }),
      this.prisma.xipai.findMany({ where: { clan_id: clanId } }),
      this.prisma.privacySetting.findUnique({ where: { clan_id: clanId } }),
      this.prisma.clanMember.findMany({ where: { clan_id: clanId } }),
    ]);

    const exportData = {
      exported_at: new Date().toISOString(),
      clan: {
        id: clan?.id.toString(),
        name: clan?.name,
        description: clan?.description,
        created_at: clan?.created_at,
      },
      persons: persons.map(p => ({
        id: p.id.toString(),
        full_name: p.full_name,
        gender: p.gender,
        birth_date: p.birth_date,
        death_date: p.death_date,
        is_living: p.is_living,
      })),
      families: families.map(f => ({
        id: f.id.toString(),
        husband_id: f.husband_id?.toString(),
        wife_id: f.wife_id?.toString(),
      })),
      family_children: familyChildren.map(fc => ({
        family_id: fc.family_id.toString(),
        child_id: fc.child_id.toString(),
        birth_order: fc.birth_order,
      })),
      ancestry: ancestry.map(a => ({
        ancestor_id: a.ancestor_id.toString(),
        descendant_id: a.descendant_id.toString(),
        depth: a.depth,
      })),
      media_count: media.length,
      xipai: xipai.map(x => ({
        generation: x.generation,
        character: x.character,
      })),
      privacy_settings: privacySettings ? {
        allow_visitor_deceased: privacySettings.allow_visitor_deceased,
        max_generations_visible: privacySettings.max_generations_visible,
        hide_living_photos: privacySettings.hide_living_photos,
        hide_living_spouses: privacySettings.hide_living_spouses,
      } : null,
      members_count: members.length,
    };

    await this.adminService.logAction({
      clanId,
      userId,
      action: 'EXPORT_CLAN_DATA',
      targetType: 'Clan',
      targetId: clanId.toString(),
    });

    // 返回 JSON（后续可扩展为压缩包下载）
    return exportData;
  }
}
