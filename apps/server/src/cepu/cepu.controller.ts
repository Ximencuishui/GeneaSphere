import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  Res,
  ForbiddenException,
  NotFoundException,
  HttpException,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { CepuService } from './cepu.service';
import { ShareAccessGuard } from './share-access.guard';
import { ClanResolverService } from '../common/clan-resolver.service';
import { AdminService } from '../admin/admin.service';
import { Public } from '../auth/public.decorator';
import { serializeBigInt } from '../common/bigint-serializer';
import { Response } from 'express';

/**
 * 册谱 API（《册谱模块需求文档》一期核心闭环）
 * - 读端点：登录即可（JwtAuthGuard 全局生效，不加 @Public）
 * - 写端点（卷宗增删改/排序/PersonBio）：额外 requireAdmin（OWNER/ADMIN）
 * - clanSlug 与 tree 一致：数字 id 或 slug 均可
 */
@Controller('api/cepu')
export class CepuController {
  constructor(
    private readonly cepuService: CepuService,
    private readonly clanResolver: ClanResolverService,
    private readonly adminService: AdminService,
  ) {}

  /** 数字 id 或 slug 解析（与 tree.controller 同口径） */
  private async resolveClanId(clanSlug: string): Promise<bigint> {
    if (/^\d+$/.test(clanSlug)) {
      return this.cepuService.resolveClanIdByNumeric(BigInt(clanSlug));
    }
    const { id } = await this.clanResolver.resolveOrThrow(clanSlug);
    return id;
  }

  /** 写操作：解析 clan + requireAdmin */
  private async requireAdmin(clanSlug: string, userId: string | undefined): Promise<bigint> {
    if (!userId) throw new ForbiddenException('需要登录');
    const clanId = await this.resolveClanId(clanSlug);
    await this.adminService.requireAdmin(clanId, userId);
    return clanId;
  }

  /** 分享只读访问校验：分享 token 只能访问其所属 clan 且 scope 匹配 */
  private assertShareAllowed(req: any, clanId: bigint, scope = 'cepu') {
    if (req.shareClanId !== undefined) {
      if (String(req.shareClanId) !== String(clanId) || req.shareScope !== scope) {
        throw new ForbiddenException('分享链接无权访问该内容');
      }
    }
  }

  /** 卷宗列表（空库自动生成默认卷结构）；登录或有效分享链接可读 */
  @Public()
  @UseGuards(ShareAccessGuard)
  @Get(':clanSlug/volumes')
  async getVolumes(@Param('clanSlug') clanSlug: string, @Req() req: any) {
    const clanId = await this.resolveClanId(clanSlug);
    this.assertShareAllowed(req, clanId);
    const volumes = await this.cepuService.getVolumes(clanId);
    return serializeBigInt(volumes);
  }

  /** 单卷内容（文档卷=content；世录卷=实时生成条目）；登录或有效分享链接可读 */
  @Public()
  @UseGuards(ShareAccessGuard)
  @Get(':clanSlug/volume/:id')
  async getVolume(@Param('clanSlug') clanSlug: string, @Param('id') id: string, @Req() req: any) {
    const clanId = await this.resolveClanId(clanSlug);
    this.assertShareAllowed(req, clanId);
    return serializeBigInt(await this.cepuService.getVolume(clanId, BigInt(id)));
  }

  /** 新增卷宗（admin） */
  @Post('volumes')
  async createVolume(
    @Req() req: any,
    @Query('clanSlug') clanSlug: string,
    @Body() body: { title: string; type?: string; content?: string; config?: any },
  ) {
    const userId = req?.user?.userId as string | undefined;
    const clanId = await this.requireAdmin(clanSlug, userId);
    return serializeBigInt(await this.cepuService.createVolume(clanId, userId!, body));
  }

  /** 更新卷宗（admin；变更自动记录新版本快照） */
  @Patch('volumes/:id')
  async updateVolume(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { title?: string; content?: string; config?: any },
  ) {
    const userId = req?.user?.userId as string | undefined;
    const volume = await this.cepuService.getVolumeMeta(BigInt(id));
    if (!volume) throw new NotFoundException('卷宗不存在');
    const clanId = await this.requireAdmin(volume.clan_id.toString(), userId);
    void clanId;
    return serializeBigInt(await this.cepuService.updateVolume(BigInt(id), userId!, body));
  }

  /** 删除卷宗（admin） */
  @Delete('volumes/:id')
  async deleteVolume(@Req() req: any, @Param('id') id: string) {
    const userId = req?.user?.userId as string | undefined;
    const volume = await this.cepuService.getVolumeMeta(BigInt(id));
    if (!volume) throw new NotFoundException('卷宗不存在');
    await this.requireAdmin(volume.clan_id.toString(), userId);
    await this.cepuService.deleteVolume(BigInt(id));
    return { success: true };
  }

  /** 重排卷序（admin）：ids 数组顺序即新顺序 */
  @Post('volumes/reorder')
  async reorderVolumes(
    @Req() req: any,
    @Query('clanSlug') clanSlug: string,
    @Body() body: { ids: string[] },
  ) {
    const userId = req?.user?.userId as string | undefined;
    const clanId = await this.requireAdmin(clanSlug, userId);
    await this.cepuService.reorderVolumes(clanId, body.ids ?? []);
    return { success: true };
  }

  /** 人物传记附表（世录扩展字段）读取；登录或有效分享链接可读（分享只读，不能写） */
  @Public()
  @UseGuards(ShareAccessGuard)
  @Get('person-bio/:personId')
  async getPersonBio(@Param('personId') personId: string, @Req() req: any) {
    const person = await this.cepuService.getPersonMeta(BigInt(personId));
    if (!person) throw new NotFoundException('人物不存在');
    this.assertShareAllowed(req, person.clan_id);
    return serializeBigInt(await this.cepuService.getPersonBio(BigInt(personId)));
  }

  /** 人物传记附表写入（admin） */
  @Put('person-bio/:personId')
  async upsertPersonBio(
    @Req() req: any,
    @Param('personId') personId: string,
    @Body() body: any,
  ) {
    const userId = req?.user?.userId as string | undefined;
    const person = await this.cepuService.getPersonMeta(BigInt(personId));
    if (!person) throw new NotFoundException('人物不存在');
    await this.requireAdmin(person.clan_id.toString(), userId);
    return serializeBigInt(await this.cepuService.upsertPersonBio(BigInt(personId), body));
  }

  /** 全文检索（姓名/字号/传记/葬地/文档卷内容）；登录或有效分享链接可读 */
  @Public()
  @UseGuards(ShareAccessGuard)
  @Get(':clanSlug/search')
  async search(@Param('clanSlug') clanSlug: string, @Query('q') q: string, @Req() req: any) {
    const clanId = await this.resolveClanId(clanSlug);
    this.assertShareAllowed(req, clanId);
    return serializeBigInt(await this.cepuService.search(clanId, q ?? ''));
  }

  // ==================== 分享只读链接（二期） ====================

  /** 创建分享链接（admin；scope=cepu） */
  @Post(':clanSlug/share')
  async createShare(@Req() req: any, @Param('clanSlug') clanSlug: string) {
    const userId = req?.user?.userId as string | undefined;
    const clanId = await this.requireAdmin(clanSlug, userId);
    const token = crypto.randomBytes(24).toString('hex');
    const link = await this.cepuService.createShareLink(clanId, userId!, 'cepu', token);
    return serializeBigInt({
      id: link.id,
      token: link.token,
      scope: link.scope,
      created_at: link.created_at,
      url: `/cepu/${clanSlug}?share=${link.token}`,
    });
  }

  /** 分享链接列表（admin） */
  @Get(':clanSlug/share-links')
  async listShares(@Req() req: any, @Param('clanSlug') clanSlug: string) {
    const userId = req?.user?.userId as string | undefined;
    const clanId = await this.requireAdmin(clanSlug, userId);
    const links = await this.cepuService.listShareLinks(clanId);
    return serializeBigInt(
      links.map((l) => ({
        id: l.id,
        token: l.token,
        scope: l.scope,
        created_at: l.created_at,
        expires_at: l.expires_at,
        url: `/cepu/${clanSlug}?share=${l.token}`,
      })),
    );
  }

  /** 撤销分享链接（admin） */
  @Delete('share/:token')
  async revokeShare(@Req() req: any, @Param('token') token: string) {
    const userId = req?.user?.userId as string | undefined;
    const link = await this.cepuService.getShareLinkMeta(token);
    if (!link) throw new NotFoundException('分享链接不存在');
    await this.requireAdmin(link.clan_id.toString(), userId);
    await this.cepuService.deleteShareLink(token);
    return { success: true };
  }

  /** 整本 PDF 导出（二期：支持页眉页脚自定义、批注可选输出）；登录或有效分享链接可导出 */
  @Public()
  @UseGuards(ShareAccessGuard)
  @Get(':clanSlug/export-pdf')
  async exportPdf(
    @Param('clanSlug') clanSlug: string,
    @Req() req: any,
    @Query('header') header: string | undefined,
    @Query('footer') footer: string | undefined,
    @Query('withAnnotations') withAnnotations: string | undefined,
    @Res() res: Response,
  ) {
    const clanId = await this.resolveClanId(clanSlug);
    this.assertShareAllowed(req, clanId);
    try {
      const buffer = await this.cepuService.exportPdf(clanId, {
        header,
        footer,
        withAnnotations: withAnnotations === '1' || withAnnotations === 'true',
      });
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="cepu_${clanId}.pdf"`,
        'Content-Length': buffer.length,
      });
      res.send(buffer);
    } catch (error: any) {
      throw new HttpException(
        error?.message || 'PDF 生成失败',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /** 导出 Word（.doc，Word 兼容 HTML，线下二次编辑）；登录或有效分享链接可导出 */
  @Public()
  @UseGuards(ShareAccessGuard)
  @Get(':clanSlug/export-word')
  async exportWord(
    @Param('clanSlug') clanSlug: string,
    @Req() req: any,
    @Query('withAnnotations') withAnnotations: string | undefined,
    @Res() res: Response,
  ) {
    const clanId = await this.resolveClanId(clanSlug);
    this.assertShareAllowed(req, clanId);
    try {
      const buffer = await this.cepuService.exportWord(clanId, {
        withAnnotations: withAnnotations === '1' || withAnnotations === 'true',
      });
      res.set({
        'Content-Type': 'application/msword',
        'Content-Disposition': `attachment; filename="cepu_${clanId}.doc"`,
        'Content-Length': buffer.length,
      });
      res.send(buffer);
    } catch (error: any) {
      throw new HttpException(
        error?.message || 'Word 导出失败',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ==================== 批注（二期，决策清单 §G） ====================

  /** 卷宗批注列表 */
  @Get('volume/:id/annotations')
  async getAnnotations(@Param('id') id: string) {
    return serializeBigInt(await this.cepuService.getAnnotations(BigInt(id)));
  }

  /** 卷宗版本历史（登录可见；share 只读不可见） */
  @Get('volume/:id/versions')
  async listVersions(@Param('id') id: string) {
    return serializeBigInt(await this.cepuService.listVolumeVersions(BigInt(id)));
  }

  /** 回滚到指定版本（admin；回滚本身也记录一个新版本） */
  @Post('volume/:id/versions/:version/restore')
  async restoreVersion(
    @Req() req: any,
    @Param('id') id: string,
    @Param('version') version: string,
  ) {
    const userId = req?.user?.userId as string | undefined;
    const volume = await this.cepuService.getVolumeMeta(BigInt(id));
    if (!volume) throw new NotFoundException('卷宗不存在');
    await this.requireAdmin(volume.clan_id.toString(), userId);
    return serializeBigInt(
      await this.cepuService.restoreVolumeVersion(BigInt(id), Number(version), userId!),
    );
  }

  /** 新增批注（admin） */
  @Post('volume/:id/annotations')
  async createAnnotation(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { anchor: string; note: string },
  ) {
    const userId = req?.user?.userId as string | undefined;
    const volume = await this.cepuService.getVolumeMeta(BigInt(id));
    if (!volume) throw new NotFoundException('卷宗不存在');
    await this.requireAdmin(volume.clan_id.toString(), userId);
    return serializeBigInt(await this.cepuService.createAnnotation(BigInt(id), userId!, body));
  }

  /** 删除批注（admin） */
  @Delete('annotations/:annotationId')
  async deleteAnnotation(@Req() req: any, @Param('annotationId') annotationId: string) {
    const userId = req?.user?.userId as string | undefined;
    const ann = await this.cepuService.getAnnotationMeta(BigInt(annotationId));
    if (!ann) throw new NotFoundException('批注不存在');
    await this.requireAdmin(ann.volume.clan_id.toString(), userId);
    await this.cepuService.deleteAnnotation(BigInt(annotationId));
    return { success: true };
  }
}
