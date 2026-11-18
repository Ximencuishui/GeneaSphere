import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Optional,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
  Request,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { createReadStream, existsSync, readFileSync } from 'fs';
import { join, relative, resolve } from 'path';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { NotificationType, Role } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminService } from '../admin.service';
import { PrismaService } from '@geneasphere/db';
import { CosService } from '../../cos/cos.service';
import { ImageProcessorService } from '../../cos/image-processor.service';
import { NotificationService } from '../../common/notification.service';
import {
  createZipFilename,
  entriesForMedia,
  resolveZipPath,
  writeMediaZip,
  zipDirectory,
} from './media-zip';
import { assignCoordinates, assignTakenFields, parseTakenYear, shiftTakenOnYear } from '../../media/capture-fields';

function blank(value: unknown): boolean {
  return value == null || (typeof value === 'string' && value.trim() === '');
}

const PRIVACY_LEVELS = ['self', 'clan', 'lineage', 'public', 'same_location'];
const SORT_FIELDS = ['created_at', 'taken_year', 'file_size'];
const REVIEW_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'];

function privacyLevel(value: unknown): string | undefined {
  if (value === undefined || blank(value)) return undefined;
  if (typeof value !== 'string' || !PRIVACY_LEVELS.includes(value)) {
    throw new BadRequestException('隐私级别无效');
  }
  return value;
}

function sameAlbum(left: bigint | null | undefined, right: bigint | null | undefined): boolean {
  if (left == null && right == null) return true;
  if (left == null || right == null) return false;
  return left === right;
}

/** 空字符串视为未填写。null 表示清空。非法数字拒绝。 */
function zipIds(value: unknown): bigint[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new BadRequestException('请选择要打包的影像');
  }
  if (value.length > 50) {
    throw new BadRequestException('单次最多打包 50 条');
  }
  return value.map((item) => {
    if (typeof item === 'number' && Number.isInteger(item) && item > 0) return BigInt(item);
    if (typeof item === 'string' && /^\d+$/.test(item)) return BigInt(item);
    throw new BadRequestException('影像编号无效');
  });
}

const COVER_CATEGORIES = ['村寨风貌', '祭祀活动'];

/** 上传日期按本地当天起止，包含边界。空值表示不筛选。 */
function uploadDayBound(value: string | undefined, end: boolean): Date | undefined {
  if (value == null || value.trim() === '') return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) throw new BadRequestException('上传日期无效');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = end
    ? new Date(year, month - 1, day, 23, 59, 59, 999)
    : new Date(year, month - 1, day, 0, 0, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new BadRequestException('上传日期无效');
  }
  return date;
}

function takenYear(value: unknown): number | null | undefined {
  return parseTakenYear(value);
}

@ApiTags('admin/media')
@Controller('api/admin/media')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AdminMediaController {
  constructor(
    private readonly adminService: AdminService,
    private readonly prisma: PrismaService,
    @Optional() private readonly cosService?: CosService,
    @Optional() private readonly notificationService?: NotificationService,
    @Optional() private readonly imageProcessor?: ImageProcessorService,
  ) {}

  private assertCanWrite(role: Role) {
    if (role === Role.VIEWER) {
      throw new ForbiddenException('观察员只能查看影像');
    }
  }

  private assertCanEdit(role: Role, userId: string, uploaderId: string) {
    this.assertCanWrite(role);
    if (role === Role.EDITOR && uploaderId !== userId) {
      throw new ForbiddenException('只能修改自己上传的影像');
    }
  }

  private async applyAlbumMoves(
    clanId: bigint,
    rows: { album_id: bigint | null }[],
    nextAlbumId: bigint | null,
  ) {
    const leaving = new Map<string, { id: bigint; count: number }>();
    let arriving = 0;
    for (const row of rows) {
      if (sameAlbum(row.album_id, nextAlbumId)) continue;
      if (row.album_id != null) {
        const key = row.album_id.toString();
        const current = leaving.get(key);
        if (current) current.count += 1;
        else leaving.set(key, { id: row.album_id, count: 1 });
      }
      if (nextAlbumId != null) arriving += 1;
    }
    for (const item of leaving.values()) {
      const album = await this.prisma.clanAlbum.findFirst({
        where: { id: item.id, clan_id: clanId },
        select: { photo_count: true },
      });
      if (!album) continue;
      await this.prisma.clanAlbum.updateMany({
        where: { id: item.id, clan_id: clanId },
        data: { photo_count: Math.max(0, album.photo_count - item.count) },
      });
    }
    if (arriving > 0 && nextAlbumId != null) {
      await this.prisma.clanAlbum.updateMany({
        where: { id: nextAlbumId, clan_id: clanId },
        data: { photo_count: { increment: arriving } },
      });
    }
  }

  /** 批量只改年份时，按每条已有拍摄日改年份、保留月日。没有拍摄日则不动。 */
  private async rebaseTakenOnYear(clanId: bigint, ids: bigint[], year: number) {
    const found = await this.prisma.mediaArchive.findMany({
      where: {
        id: { in: ids },
        clan_id: clanId,
        deleted_at: null,
        taken_on: { not: null },
      },
      select: { id: true, taken_on: true },
    });
    if (!Array.isArray(found)) return;
    for (const row of found) {
      if (!row?.taken_on) continue;
      const current = row.taken_on instanceof Date ? row.taken_on : new Date(row.taken_on);
      if (Number.isNaN(current.getTime()) || current.getUTCFullYear() === year) continue;
      await this.prisma.mediaArchive.updateMany({
        where: { id: row.id, clan_id: clanId },
        data: { taken_on: shiftTakenOnYear(current, year), taken_year: year },
      });
    }
  }

  /**
   * 获取影像列表
   */
  @Get('list')
  @ApiOperation({ summary: '获取影像列表' })
  async getMediaList(
    @Request() req,
    @Query('clanSlug') clanSlug: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('type') type?: string,
    @Query('uploaderId') uploaderId?: string,
    @Query('albumId') albumId?: string,
    @Query('startYear') startYear?: string,
    @Query('endYear') endYear?: string,
    @Query('location') location?: string,
    @Query('personId') personId?: string,
    @Query('status') status?: string,
    @Query('keyword') keyword?: string,
    @Query('year') year?: string,
    @Query('category') category?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
    @Query('reviewStatus') reviewStatus?: string,
    @Query('uploadedFrom') uploadedFrom?: string,
    @Query('uploadedTo') uploadedTo?: string,
  ) {
    const userId = req.user.userId;
    const { clanId } = await this.adminService.resolveMediaActor(clanSlug, userId);


    const pageNum = Math.max(parseInt(page || '1', 10) || 1, 1);
    const pageSizeNum = Math.min(Math.max(parseInt(pageSize || '30', 10) || 30, 1), 100);
    const skip = (pageNum - 1) * pageSizeNum;

    // 构建查询条件
    const where: any = { clan_id: clanId };

    // 只查询未删除的
    if (status !== 'deleted') {
      where.deleted_at = null;
    }

    if (type && type !== 'all') {
      where.media_type = type;
    }

    if (uploaderId) {
      where.uploader_id = uploaderId;
    }

    if (albumId) {
      where.album_id = albumId ? BigInt(albumId) : null;
    }

    if (year && year.trim()) {
      const exact = takenYear(year);
      if (exact != null) where.taken_year = exact;
    } else {
      if (startYear) {
        where.taken_year = { ...where.taken_year, gte: parseInt(startYear) };
      }
      if (endYear) {
        where.taken_year = { ...where.taken_year, lte: parseInt(endYear) };
      }
    }

    if (category && category.trim()) {
      where.category = category.trim();
    }

    if (location) {
      where.taken_location = { contains: location };
    }

    if (keyword) {
      where.OR = [
        { description: { contains: keyword } },
        { taken_location: { contains: keyword } },
        { file_url: { contains: keyword } },
        { original_key: { contains: keyword } },
        { original_filename: { contains: keyword } },
      ];
    }

    if (reviewStatus === 'none') {
      where.reviews = { none: {} };
    } else if (reviewStatus && REVIEW_STATUSES.includes(reviewStatus)) {
      where.reviews = { some: { status: reviewStatus } };
    }

    if (personId) {
      where.person_links = {
        some: { person_id: BigInt(personId) },
      };
    }

    const uploadedStart = uploadDayBound(uploadedFrom, false);
    const uploadedEnd = uploadDayBound(uploadedTo, true);
    if (uploadedStart || uploadedEnd) {
      where.created_at = {
        ...(uploadedStart ? { gte: uploadedStart } : {}),
        ...(uploadedEnd ? { lte: uploadedEnd } : {}),
      };
    }

    const sortField = SORT_FIELDS.includes(sortBy || '') ? sortBy : 'created_at';
    const orderBy: any = { [sortField as string]: sortOrder === 'asc' ? 'asc' : 'desc' };

    const [media, total] = await Promise.all([
      this.prisma.mediaArchive.findMany({
        where,
        include: {
          uploader: {
            select: { id: true, phone: true, nickname: true },
          },
          album: {
            select: { id: true, name: true },
          },
          person_links: {
            include: {
              person: {
                select: { id: true, full_name: true },
              },
            },
          },
          reviews: {
            select: { status: true },
            orderBy: { created_at: 'desc' },
            take: 1,
          },
        },
        orderBy,
        skip,
        take: pageSizeNum,
      }),
      this.prisma.mediaArchive.count({ where }),
    ]);

    return {
      data: media.map((m) => ({
        id: m.id.toString(),
        file_url: m.file_url,
        thumb_url: m.thumb_url,
        display_url: m.display_url,
        original_key: m.original_key,
        original_filename: m.original_filename,
        media_type: m.media_type,
        taken_year: m.taken_year,
        taken_on: m.taken_on,
        taken_location: m.taken_location,
        latitude: m.latitude,
        longitude: m.longitude,
        width: m.width,
        height: m.height,
        description: m.description,
        category: m.category,
        is_cover: m.is_cover,
        file_size: m.file_size.toString(),
        privacy_level: m.privacy_level,
        uploader_id: m.uploader.id,
        uploader_name: m.uploader.nickname || m.uploader.phone,
        review_status: m.reviews[0]?.status ?? null,
        album_name: m.album?.name,
        album_id: m.album_id?.toString(),
        tagged_persons: m.person_links.map((p) => ({
          id: p.person.id.toString(),
          name: p.person.full_name,
        })),
        created_at: m.created_at,
        deleted_at: m.deleted_at,
      })),
      total,
      page: pageNum,
      pageSize: pageSizeNum,
      totalPages: Math.ceil(total / pageSizeNum),
    };
  }

  /**
   * 批量更新。静态段写在 :id 之前，避免被参数路由吞掉。
   */
  @Post(':clanSlug/batch-update')
  @ApiOperation({ summary: '批量更新影像元数据' })
  async batchUpdate(
    @Request() req,
    @Param('clanSlug') clanSlug: string,
    @Body() body: any,
  ) {
    const userId = req.user.userId;
    const { clanId, role } = await this.adminService.resolveMediaActor(clanSlug, userId);
    this.assertCanWrite(role);

    const { ids, ...updates } = body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      throw new BadRequestException('ids is required and must be non-empty array');
    }

    const updateData: any = {};
    assignTakenFields(updateData, updates, null, false);
    assignCoordinates(updateData, updates.latitude, updates.longitude);
    if (!blank(updates.taken_location)) updateData.taken_location = updates.taken_location;
    if (!blank(updates.description)) updateData.description = updates.description;
    if (!blank(updates.category)) updateData.category = updates.category;
    const privacy = privacyLevel(updates.privacy_level);
    if (privacy) updateData.privacy_level = privacy;

    let nextAlbumId: bigint | null | undefined;
    if (updates.album_id === null) {
      nextAlbumId = null;
    } else if (!blank(updates.album_id)) {
      nextAlbumId = BigInt(updates.album_id);
      const album = await this.prisma.clanAlbum.findFirst({
        where: { id: nextAlbumId, clan_id: clanId },
        select: { id: true },
      });
      if (!album) {
        throw new NotFoundException('Album not found');
      }
    }
    if (Object.keys(updateData).length === 0 && nextAlbumId === undefined) {
      throw new BadRequestException('没有要更新的字段');
    }
    if (nextAlbumId !== undefined) updateData.album_id = nextAlbumId;

    const idList = ids.map((id: string) => BigInt(id));
    const needsRows = role === Role.EDITOR || nextAlbumId !== undefined;
    let rows: { id: bigint; album_id: bigint | null; uploader_id: string }[] | null = null;
    if (needsRows) {
      rows = await this.prisma.mediaArchive.findMany({
        where: { id: { in: idList }, clan_id: clanId, deleted_at: null },
        select: { id: true, album_id: true, uploader_id: true },
      });
      if (rows.length === 0) {
        throw new NotFoundException('Media not found');
      }
      if (role === Role.EDITOR && rows.some((row) => row.uploader_id !== userId)) {
        throw new ForbiddenException('只能修改自己上传的影像');
      }
    }

    const updated = await this.prisma.mediaArchive.updateMany({
      where: {
        id: { in: rows ? rows.map((row) => row.id) : idList },
        clan_id: clanId,
        ...(rows ? { deleted_at: null } : {}),
      },
      data: updateData,
    });
    if (updated.count === 0) {
      throw new NotFoundException('Media not found');
    }
    if (rows && nextAlbumId !== undefined) {
      await this.applyAlbumMoves(clanId, rows, nextAlbumId);
    }
    if (updateData.taken_on === undefined && typeof updateData.taken_year === 'number') {
      await this.rebaseTakenOnYear(
        clanId,
        rows ? rows.map((row) => row.id) : idList,
        updateData.taken_year,
      );
    }

    await this.adminService.logAction({
      clanId,
      userId,
      action: 'BATCH_UPDATE_MEDIA',
      targetType: 'MediaArchive',
      targetId: ids.join(','),
      details: `批量更新 ${updated.count} 个影像`,
    });

    return { success: true, count: updated.count };
  }

  /**
   * 批量删除。静态段写在 :id 之前，避免被参数路由吞掉。
   */
  @Post(':clanSlug/batch-delete')
  @ApiOperation({ summary: '批量删除影像' })
  async batchDelete(
    @Request() req,
    @Param('clanSlug') clanSlug: string,
    @Body() body: any,
  ) {
    const userId = req.user.userId;
    const { clanId, role } = await this.adminService.resolveMediaActor(clanSlug, userId);
    this.assertCanWrite(role);

    const { ids } = body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      throw new BadRequestException('ids is required and must be non-empty array');
    }

    const rows = await this.prisma.mediaArchive.findMany({
      where: {
        id: { in: ids.map((id: string) => BigInt(id)) },
        clan_id: clanId,
        deleted_at: null,
      },
      select: { id: true, album_id: true, uploader_id: true },
    });
    if (rows.length === 0) {
      throw new NotFoundException('Media not found');
    }
    if (role === Role.EDITOR && rows.some((row) => row.uploader_id !== userId)) {
      throw new ForbiddenException('只能删除自己上传的影像');
    }

    const deleted = await this.prisma.mediaArchive.updateMany({
      where: {
        id: { in: rows.map((row) => row.id) },
        clan_id: clanId,
        deleted_at: null,
      },
      data: {
        deleted_at: new Date(),
        deleted_by: userId,
      },
    });
    if (deleted.count === 0) {
      throw new NotFoundException('Media not found');
    }
    await this.applyAlbumMoves(clanId, rows, null);

    await this.adminService.logAction({
      clanId,
      userId,
      action: 'BATCH_DELETE_MEDIA',
      targetType: 'MediaArchive',
      targetId: ids.join(','),
      details: `批量删除 ${deleted.count} 个影像`,
    });

    return { success: true, count: deleted.count };
  }

  /**
   * 把本族未删除影像打成 ZIP。一条都不属于本族则 404，不写文件。
   */
  @Post(':clanSlug/batch-zip')
  @ApiOperation({ summary: '批量打包下载影像' })
  async batchZip(
    @Request() req,
    @Param('clanSlug') clanSlug: string,
    @Body() body: { ids?: Array<number | string> },
  ) {
    const userId = req.user.userId;
    const { clanId } = await this.adminService.resolveMediaActor(clanSlug, userId);
    const ids = zipIds(body?.ids);

    const rows = await this.prisma.mediaArchive.findMany({
      where: { id: { in: ids }, clan_id: clanId, deleted_at: null },
      select: { id: true, file_url: true, display_url: true, original_key: true },
    });
    if (rows.length === 0) {
      throw new NotFoundException('没有可打包的影像');
    }

    const readObject = this.cosService?.readObject
      ? (key: string) => this.cosService!.readObject(key)
      : undefined;
    const { entries, skipped } = await entriesForMedia(rows, readObject);
    if (entries.length === 0) {
      await this.notifyZip(userId, clanId, 0, skipped.length, null);
      return {
        url: null,
        filename: null,
        count: 0,
        skipped,
        message: '没有可打包的文件',
      };
    }

    const filename = createZipFilename(clanId);
    const dest = join(zipDirectory(), filename);
    try {
      await writeMediaZip(dest, entries);
    } catch {
      throw new BadRequestException('打包失败');
    }

    await this.notifyZip(userId, clanId, entries.length, skipped.length, filename);
    return {
      url: `/api/admin/media/${encodeURIComponent(clanSlug)}/zips/${filename}`,
      filename,
      count: entries.length,
      skipped,
      message: '打包完成',
    };
  }

  @Get(':clanSlug/zips/:filename')
  @Header('Content-Type', 'application/zip')
  @ApiOperation({ summary: '下载本族影像压缩包' })
  async downloadZip(
    @Request() req,
    @Param('clanSlug') clanSlug: string,
    @Param('filename') filename: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { clanId } = await this.adminService.resolveMediaActor(clanSlug, req.user.userId);
    const abs = resolveZipPath(filename, clanId);
    if (!abs || !existsSync(abs)) {
      throw new NotFoundException('压缩包不存在');
    }
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return new StreamableFile(createReadStream(abs));
  }

  private async notifyZip(
    userId: string,
    clanId: bigint,
    count: number,
    skipped: number,
    filename: string | null,
  ) {
    if (!this.notificationService) return;
    const content = count === 0
      ? '没有可放入压缩包的文件。'
      : skipped > 0
        ? `已打包 ${count} 个影像，${skipped} 个文件未能放入压缩包。`
        : `已打包 ${count} 个影像，可在影像库下载。`;
    await this.notificationService.notify({
      userId,
      clanId,
      type: NotificationType.SYSTEM,
      title: '影像打包完成',
      content,
      targetType: 'MediaZip',
      targetId: filename || undefined,
    });
  }

  /**
   * 按姓名搜索本族未删除人物。
   * 静态段 persons 写在 :id 之前，避免被单段参数路由吞掉。
   */
  @Get(':clanSlug/persons')
  @ApiOperation({ summary: '搜索本族人物' })
  async searchPersons(
    @Request() req,
    @Param('clanSlug') clanSlug: string,
    @Query('keyword') keyword?: string,
  ) {
    const userId = req.user.userId;
    const { clanId } = await this.adminService.resolveMediaActor(clanSlug, userId);

    const where: {
      clan_id: bigint;
      deleted_at: null;
      full_name?: { contains: string };
    } = {
      clan_id: clanId,
      deleted_at: null,
    };
    const kw = keyword?.trim();
    if (kw) where.full_name = { contains: kw };

    const persons = await this.prisma.person.findMany({
      where,
      select: { id: true, full_name: true },
      orderBy: { full_name: 'asc' },
      take: 20,
    });

    return {
      data: persons.map((person) => ({
        id: person.id.toString(),
        full_name: person.full_name,
      })),
    };
  }

  @Get(':clanSlug/uploaders')
  @ApiOperation({ summary: '影像库上传者筛选' })
  async listUploaders(@Request() req, @Param('clanSlug') clanSlug: string) {
    const { clanId } = await this.adminService.resolveMediaActor(clanSlug, req.user.userId);
    const members = await this.prisma.clanMember.findMany({
      where: { clan_id: clanId },
      select: {
        user_id: true,
        user: { select: { nickname: true, phone: true } },
      },
      orderBy: { joined_at: 'asc' },
      take: 200,
    });
    return {
      data: members.map((member) => ({
        id: member.user_id,
        name: member.user.nickname || member.user.phone,
      })),
    };
  }

  @Get(':clanSlug/locations')
  @ApiOperation({ summary: '补全本族已有拍摄地点' })
  async listLocations(
    @Request() req,
    @Param('clanSlug') clanSlug: string,
    @Query('keyword') keyword?: string,
  ) {
    const { clanId } = await this.adminService.resolveMediaActor(clanSlug, req.user.userId);
    const kw = keyword?.trim();
    const locationFilter: Record<string, unknown>[] = [
      { taken_location: { not: null } },
      { NOT: { taken_location: '' } },
    ];
    if (kw) locationFilter.push({ taken_location: { contains: kw } });

    const rows = await this.prisma.mediaArchive.findMany({
      where: {
        clan_id: clanId,
        deleted_at: null,
        AND: locationFilter,
      },
      distinct: ['taken_location'],
      select: { taken_location: true },
      orderBy: { taken_location: 'asc' },
      take: 20,
    });

    const data = rows
      .map((row) => (row.taken_location || '').trim())
      .filter((name) => name.length > 0 && (!kw || name.includes(kw)));
    return { data: data.slice(0, 20) };
  }

  /**
   * 关联人物。三段路径，和 batch-update、set-cover 的两段路径互不重叠。
   * 影像和人物都必须属于当前家族；关联已存在时视为成功。
   */
  @Post(':clanSlug/:id/persons')
  @ApiOperation({ summary: '为影像关联本族人物' })
  async linkPerson(
    @Request() req,
    @Param('clanSlug') clanSlug: string,
    @Param('id') id: string,
    @Body() body: { personId?: string },
  ) {
    const userId = req.user.userId;
    const { clanId, role } = await this.adminService.resolveMediaActor(clanSlug, userId);

    if (body?.personId == null || String(body.personId).trim() === '') {
      throw new BadRequestException('personId is required');
    }

    const media = await this.prisma.mediaArchive.findFirst({
      where: { id: BigInt(id), clan_id: clanId },
      select: { id: true, uploader_id: true },
    });
    if (!media) {
      throw new NotFoundException('Media not found');
    }
    this.assertCanEdit(role, userId, media.uploader_id);

    const person = await this.prisma.person.findFirst({
      where: { id: BigInt(body.personId), clan_id: clanId, deleted_at: null },
      select: { id: true },
    });
    if (!person) {
      throw new NotFoundException('Person not found');
    }

    await this.prisma.mediaPersonLink.createMany({
      data: [{ media_id: media.id, person_id: person.id }],
      skipDuplicates: true,
    });

    await this.adminService.logAction({
      clanId,
      userId,
      action: 'LINK_MEDIA_PERSON',
      targetType: 'MediaArchive',
      targetId: id,
      details: `关联人物 ${person.id.toString()}`,
    });

    return { success: true };
  }

  /**
   * 取消关联。先确认影像属于本族，再删除 link。
   */
  @Delete(':clanSlug/:id/persons/:personId')
  @ApiOperation({ summary: '取消影像与人物的关联' })
  async unlinkPerson(
    @Request() req,
    @Param('clanSlug') clanSlug: string,
    @Param('id') id: string,
    @Param('personId') personId: string,
  ) {
    const userId = req.user.userId;
    const { clanId, role } = await this.adminService.resolveMediaActor(clanSlug, userId);

    const media = await this.prisma.mediaArchive.findFirst({
      where: { id: BigInt(id), clan_id: clanId },
      select: { id: true, uploader_id: true },
    });
    if (!media) {
      throw new NotFoundException('Media not found');
    }
    this.assertCanEdit(role, userId, media.uploader_id);

    await this.prisma.mediaPersonLink.deleteMany({
      where: { media_id: media.id, person_id: BigInt(personId) },
    });

    await this.adminService.logAction({
      clanId,
      userId,
      action: 'UNLINK_MEDIA_PERSON',
      targetType: 'MediaArchive',
      targetId: id,
      details: `取消关联人物 ${personId}`,
    });

    return { success: true };
  }

  @Get(':clanSlug/:id/original')
  @ApiOperation({ summary: '打开原图' })
  async openOriginal(
    @Request() req,
    @Param('clanSlug') clanSlug: string,
    @Param('id') id: string,
  ) {
    const { clanId } = await this.adminService.resolveMediaActor(clanSlug, req.user.userId);
    const media = await this.prisma.mediaArchive.findFirst({
      where: { id: BigInt(id), clan_id: clanId, deleted_at: null },
      select: { original_key: true, file_url: true, display_url: true },
    });
    if (!media) {
      throw new NotFoundException('Media not found');
    }
    if (media.original_key && this.cosService) {
      try {
        const url = await this.cosService.getPresignedUrl(media.original_key);
        if (url) return { url };
      } catch {
        // 签名失败时回退到已保存的地址
      }
    }
    return { url: media.display_url || media.file_url };
  }

  /**
   * 获取影像详情
   */
  @Get(':id')
  @ApiOperation({ summary: '获取影像详情' })
  async getMediaDetail(
    @Request() req,
    @Param('id') id: string,
    @Query('clanSlug') clanSlug: string,
  ) {
    const userId = req.user.userId;
    const { clanId } = await this.adminService.resolveMediaActor(clanSlug, userId);

    const media = await this.prisma.mediaArchive.findFirst({
      where: { id: BigInt(id), clan_id: clanId },
      include: {
        uploader: {
          select: { id: true, phone: true, nickname: true },
        },
        album: true,
        person_links: {
          include: {
            person: {
              select: { id: true, full_name: true, avatar_url: true },
            },
          },
        },
      },
    });

    if (!media) {
      throw new NotFoundException('Media not found');
    }

    return {
      id: media.id.toString(),
      file_url: media.file_url,
      thumb_url: media.thumb_url,
      display_url: media.display_url,
      original_key: media.original_key,
      original_filename: media.original_filename,
      media_type: media.media_type,
      taken_year: media.taken_year,
      taken_on: media.taken_on,
      taken_location: media.taken_location,
      latitude: media.latitude,
      longitude: media.longitude,
      width: media.width,
      height: media.height,
      description: media.description,
      category: media.category,
      is_cover: media.is_cover,
      file_size: media.file_size.toString(),
      privacy_level: media.privacy_level,
      album: media.album ? {
        id: media.album.id.toString(),
        name: media.album.name,
      } : null,
      uploader: {
        id: media.uploader.id,
        name: media.uploader.nickname || media.uploader.phone,
      },
      tagged_persons: media.person_links.map((p) => ({
        id: p.person.id.toString(),
        name: p.person.full_name,
        avatar_url: p.person.avatar_url,
      })),
      created_at: media.created_at,
      updated_at: media.updated_at,
      deleted_at: media.deleted_at,
    };
  }

  /**
   * 更新影像元数据
   */
  @Put(':clanSlug/:id')
  @ApiOperation({ summary: '更新影像元数据' })
  async updateMedia(
    @Request() req,
    @Param('clanSlug') clanSlug: string,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    const userId = req.user.userId;
    const { clanId, role } = await this.adminService.resolveMediaActor(clanSlug, userId);

    const existing = await this.prisma.mediaArchive.findFirst({
      where: { id: BigInt(id), clan_id: clanId },
      select: { album_id: true, uploader_id: true, taken_on: true },
    });
    if (!existing) {
      throw new NotFoundException('Media not found');
    }
    this.assertCanEdit(role, userId, existing.uploader_id);

    const updateData: any = {};

    assignTakenFields(updateData, body, existing.taken_on, true);
    assignCoordinates(updateData, body.latitude, body.longitude);
    if (body.taken_location !== undefined) updateData.taken_location = body.taken_location;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.category !== undefined) updateData.category = body.category;
    if (body.privacy_level !== undefined) {
      const privacy = privacyLevel(body.privacy_level);
      if (privacy) updateData.privacy_level = privacy;
    }
    if (body.is_cover !== undefined) updateData.is_cover = body.is_cover;

    let nextAlbumId: bigint | null | undefined;
    if (body.album_id !== undefined) {
      nextAlbumId = body.album_id ? BigInt(body.album_id) : null;
      if (nextAlbumId) {
        const album = await this.prisma.clanAlbum.findFirst({
          where: { id: nextAlbumId, clan_id: clanId },
          select: { id: true },
        });
        if (!album) {
          throw new NotFoundException('Album not found');
        }
      }
      updateData.album_id = nextAlbumId;
    }

    const updated = await this.prisma.mediaArchive.updateMany({
      where: { id: BigInt(id), clan_id: clanId },
      data: updateData,
    });
    if (updated.count === 0) {
      throw new NotFoundException('Media not found');
    }

    if (nextAlbumId !== undefined && !sameAlbum(existing.album_id, nextAlbumId)) {
      if (existing.album_id) {
        await this.prisma.clanAlbum.updateMany({
          where: { id: existing.album_id, clan_id: clanId, photo_count: { gt: 0 } },
          data: { photo_count: { decrement: 1 } },
        });
      }
      if (nextAlbumId) {
        await this.prisma.clanAlbum.updateMany({
          where: { id: nextAlbumId, clan_id: clanId },
          data: { photo_count: { increment: 1 } },
        });
      }
    }

    await this.adminService.logAction({
      clanId,
      userId,
      action: 'UPDATE_MEDIA_METADATA',
      targetType: 'MediaArchive',
      targetId: id,
      details: `更新影像元数据`,
    });

    return {
      id,
      updated_at: new Date(),
    };
  }

  /**
   * 软删除影像
   */
  @Delete(':id')
  @ApiOperation({ summary: '软删除影像' })
  async deleteMedia(
    @Request() req,
    @Param('id') id: string,
    @Query('clanSlug') clanSlug: string,
  ) {
    const userId = req.user.userId;
    const { clanId, role } = await this.adminService.resolveMediaActor(clanSlug, userId);

    const media = await this.prisma.mediaArchive.findFirst({
      where: { id: BigInt(id), clan_id: clanId, deleted_at: null },
      select: { album_id: true, uploader_id: true },
    });
    if (!media) {
      throw new NotFoundException('Media not found');
    }
    this.assertCanEdit(role, userId, media.uploader_id);

    const deletedAt = new Date();
    const deleted = await this.prisma.mediaArchive.updateMany({
      where: { id: BigInt(id), clan_id: clanId, deleted_at: null },
      data: {
        deleted_at: deletedAt,
        deleted_by: userId,
      },
    });
    if (deleted.count === 0) {
      throw new NotFoundException('Media not found');
    }

    if (media.album_id) {
      await this.prisma.clanAlbum.updateMany({
        where: { id: media.album_id, clan_id: clanId, photo_count: { gt: 0 } },
        data: { photo_count: { decrement: 1 } },
      });
    }

    await this.adminService.logAction({
      clanId,
      userId,
      action: 'DELETE_MEDIA',
      targetType: 'MediaArchive',
      targetId: id,
      details: `软删除影像`,
    });

    return {
      id,
      deleted_at: deletedAt,
    };
  }

  /**
   * 按上传时的缩略图处理，从原图重新生成 thumb_url。视频不改文件。
   */
  @Post(':clanSlug/:id/regenerate-thumb')
  @ApiOperation({ summary: '重新生成影像缩略图' })
  async regenerateThumb(
    @Request() req,
    @Param('clanSlug') clanSlug: string,
    @Param('id') id: string,
  ) {
    const userId = req.user.userId;
    const { clanId, role } = await this.adminService.resolveMediaActor(clanSlug, userId);
    this.assertCanWrite(role);

    const media = await this.prisma.mediaArchive.findFirst({
      where: { id: BigInt(id), clan_id: clanId },
      select: {
        id: true,
        media_type: true,
        file_url: true,
        display_url: true,
        original_key: true,
      },
    });
    if (!media) {
      throw new NotFoundException('Media not found');
    }
    if (media.media_type === 'video') {
      throw new BadRequestException('视频不能重新生成缩略图');
    }
    if (media.media_type !== 'image') {
      throw new BadRequestException('只能为图片重新生成缩略图');
    }
    if (!this.imageProcessor) {
      throw new BadRequestException('无法从原图生成缩略图');
    }

    const buffer = await this.loadImageBuffer(media);
    if (!buffer?.length) {
      throw new BadRequestException('找不到原图，无法生成缩略图');
    }

    let thumbUrl: string;
    try {
      thumbUrl = await this.imageProcessor.regenerateThumb(buffer, clanId);
    } catch {
      throw new BadRequestException('无法从原图生成缩略图');
    }

    const updated = await this.prisma.mediaArchive.updateMany({
      where: { id: media.id, clan_id: clanId },
      data: { thumb_url: thumbUrl },
    });
    if (updated.count === 0) {
      throw new NotFoundException('Media not found');
    }

    return { id, thumb_url: thumbUrl };
  }

  private async loadImageBuffer(media: {
    original_key: string | null;
    file_url: string;
    display_url: string | null;
  }): Promise<Buffer | null> {
    if (media.original_key && this.cosService) {
      for (const bucket of ['cold', 'hot'] as const) {
        try {
          const body = await this.cosService.readObject(media.original_key, bucket);
          if (body?.length) return body;
        } catch {
          // 换下一个来源
        }
      }
    }
    for (const url of [media.file_url, media.display_url]) {
      const local = this.resolveLocalMedia(url);
      if (local && existsSync(local)) return readFileSync(local);
    }
    return null;
  }

  private resolveLocalMedia(url?: string | null): string | null {
    if (!url || !url.startsWith('/media/')) return null;
    let name = url.slice('/media/'.length);
    try {
      name = decodeURIComponent(name);
    } catch {
      return null;
    }
    if (!name || name.includes('..') || name.includes('/') || name.includes('\\') || name.includes('\0')) {
      return null;
    }
    const root = resolve(process.env.STORAGE_PATH || join(process.cwd(), 'storage', 'media'));
    const abs = resolve(root, name);
    const rel = relative(root, abs);
    if (!rel || rel.startsWith('..') || rel.includes('..')) return null;
    return abs;
  }

  /**
   * 设为封面
   */
  @Post(':id/set-cover')
  @ApiOperation({ summary: '设为封面' })
  async setAsCover(
    @Request() req,
    @Param('id') id: string,
    @Query('clanSlug') clanSlug: string,
  ) {
    const userId = req.user.userId;
    const clanId = await this.adminService.requireAdminBySlug(clanSlug, userId);


    const media = await this.prisma.mediaArchive.findFirst({
      where: { id: BigInt(id), clan_id: clanId },
      select: { album_id: true, category: true },
    });
    if (!media) {
      throw new NotFoundException('Media not found');
    }
    if (!media.category || !COVER_CATEGORIES.includes(media.category)) {
      throw new BadRequestException('只有标记为"村寨风貌"或"祭祀活动"的影像才能设为封面');
    }

    if (media.album_id) {
      await this.prisma.mediaArchive.updateMany({
        where: {
          album_id: media.album_id,
          clan_id: clanId,
          id: { not: BigInt(id) },
        },
        data: { is_cover: false },
      });
    }

    const updated = await this.prisma.mediaArchive.updateMany({
      where: { id: BigInt(id), clan_id: clanId },
      data: { is_cover: true },
    });
    if (updated.count === 0) {
      throw new NotFoundException('Media not found');
    }

    await this.adminService.logAction({
      clanId,
      userId,
      action: 'SET_MEDIA_AS_COVER',
      targetType: 'MediaArchive',
      targetId: id,
      details: `设置影像为封面`,
    });

    return { success: true };
  }
}
