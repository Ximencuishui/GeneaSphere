import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Post, Query, Req, Request, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { MediaArchive, ReviewStatus } from '@prisma/client';
import { PrismaService } from '@geneasphere/db';
import { MediaService } from './media.service';
import { UploadMediaDto } from './dto/upload-media.dto';
import { QueryMediaDto } from './dto/query-media.dto';
import { LinkMediaDto } from './dto/link-media.dto';
import { RecommendMediaDto } from './dto/recommend-media.dto';
import { serializeBigInt } from '../common/bigint-serializer';
import { coverMediaWhere } from './media-visibility';
import { MediaCaptureInput, parseCoordinatePair, parseTakenOn } from './capture-fields';
import { PrivacyService } from '../privacy/privacy.service';
import { CLAN_QUOTA_EXCEEDED_MESSAGE, clanStorageQuotaBytes, quotaExceeded } from '../admin/storage/storage-quota';

const IMAGE_MAX = 50 * 1024 * 1024;
const VIDEO_MAX = 200 * 1024 * 1024;
const PRIVACY_LEVELS = ['self', 'clan', 'lineage', 'public', 'same_location'];
const uploadInterceptor = FileInterceptor('file', {
  storage: memoryStorage(),
  limits: { fileSize: VIDEO_MAX },
});

@Controller('api/media')
export class MediaController {
  constructor(
    private readonly mediaService: MediaService,
    private readonly prisma: PrismaService,
    private readonly privacy?: PrivacyService,
  ) {}

  @Post('upload')
  @UseInterceptors(uploadInterceptor)
  async uploadFile(
    @Request() req,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadMediaDto,
  ): Promise<MediaArchive> {
    return serializeBigInt(await this.storeAndQueue(req.user.userId, file, dto));
  }

  @Post('upload/oss')
  @UseInterceptors(uploadInterceptor)
  async uploadToOSS(
    @Request() req,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadMediaDto,
  ): Promise<MediaArchive> {
    return serializeBigInt(await this.storeAndQueue(req.user.userId, file, dto));
  }

  private assertUploadFile(file?: Express.Multer.File) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('请选择文件');
    }
    const isImage = file.mimetype?.startsWith('image/');
    const isVideo = file.mimetype?.startsWith('video/');
    if (!isImage && !isVideo) {
      throw new BadRequestException('只支持图片或视频');
    }
    if (isImage && file.size > IMAGE_MAX) {
      throw new BadRequestException('图片不能超过 50MB');
    }
    if (isVideo && file.size > VIDEO_MAX) {
      throw new BadRequestException('视频不能超过 200MB');
    }
  }

  private async requireClanAccess(clanId: bigint, userId: string) {
    const clan = await this.prisma.clan.findUnique({
      where: { id: clanId },
      select: { admin_user_id: true },
    });
    if (!clan) {
      throw new NotFoundException('家族不存在');
    }
    if (clan.admin_user_id === userId) return;
    const member = await this.prisma.clanMember.findUnique({
      where: { clan_id_user_id: { clan_id: clanId, user_id: userId } },
    });
    if (!member) {
      throw new ForbiddenException('不是该家族成员');
    }
    if (member.role === 'VIEWER') {
      throw new ForbiddenException('观察员只能查看影像');
    }
  }

  private async assertClanQuota(clanId: bigint, incomingBytes: number) {
    const clan = await this.prisma.clan.findUnique({
      where: { id: clanId },
      select: { settings_json: true },
    });
    const quota = clanStorageQuotaBytes(clan?.settings_json);
    const used = await this.prisma.mediaArchive.aggregate({
      where: { clan_id: clanId },
      _sum: { file_size: true },
    });
    const usedBytes = Number(used._sum.file_size || 0);
    if (quotaExceeded(usedBytes, incomingBytes, quota)) {
      throw new BadRequestException(CLAN_QUOTA_EXCEEDED_MESSAGE);
    }
  }

  private async storeAndQueue(userId: string, file: Express.Multer.File, dto: UploadMediaDto) {
    this.assertUploadFile(file);
    const clanId = BigInt(dto.clan_id);
    await this.requireClanAccess(clanId, userId);
    await this.assertClanQuota(clanId, file.size);
    let albumId: bigint | null = null;
    let albumPrivacy: string | undefined;
    if (dto.album_id) {
      albumId = BigInt(dto.album_id);
      const album = await this.prisma.clanAlbum.findFirst({
        where: { id: albumId, clan_id: clanId },
        select: { id: true, default_privacy: true },
      });
      if (!album) {
        throw new NotFoundException('相册不存在');
      }
      albumPrivacy = album.default_privacy;
    }
    const requestedPrivacy = dto.privacy_level?.trim();
    if (requestedPrivacy && !PRIVACY_LEVELS.includes(requestedPrivacy)) {
      throw new BadRequestException('隐私级别无效');
    }
    const privacy = requestedPrivacy || albumPrivacy;
    const takenOn = parseTakenOn(dto.taken_on);
    const coords = parseCoordinatePair(dto.latitude, dto.longitude);
    const capture: MediaCaptureInput = {};
    let takenYear = dto.taken_year;
    if (takenOn instanceof Date) {
      capture.taken_on = takenOn;
      takenYear = takenOn.getUTCFullYear();
    }
    if (coords && typeof coords.latitude === 'number' && typeof coords.longitude === 'number') {
      capture.latitude = coords.latitude;
      capture.longitude = coords.longitude;
    }
    const hasCapture = Object.keys(capture).length > 0;
    const media = hasCapture
      ? await this.mediaService.uploadFile(
        file,
        clanId,
        userId,
        takenYear,
        dto.taken_location,
        dto.description,
        dto.category,
        albumId,
        capture,
      )
      : await this.mediaService.uploadFile(
        file,
        clanId,
        userId,
        takenYear,
        dto.taken_location,
        dto.description,
        dto.category,
        albumId,
      );
    if (albumId) {
      await this.prisma.clanAlbum.updateMany({
        where: { id: albumId, clan_id: clanId },
        data: { photo_count: { increment: 1 } },
      });
    }
    if (privacy) {
      await this.prisma.mediaArchive.updateMany({
        where: { id: media.id, clan_id: clanId },
        data: { privacy_level: privacy as never },
      });
    }
    await this.prisma.mediaReview.create({
      data: { media_id: media.id, status: ReviewStatus.PENDING },
    });
    return media;
  }

  @Get('clan/:clanId/covers')
  async listCovers(@Param('clanId') clanId: string, @Req() req?: any) {
    let id: bigint;
    try {
      id = BigInt(clanId);
    } catch {
      throw new BadRequestException('家族编号无效');
    }
    const rows = await this.prisma.mediaArchive.findMany({
      where: coverMediaWhere(id),
      orderBy: { created_at: 'desc' },
      take: 24,
      select: {
        id: true,
        file_url: true,
        display_url: true,
        thumb_url: true,
        description: true,
        taken_location: true,
        taken_year: true,
        category: true,
      },
    });
    const visible = this.privacy
      ? await this.privacy.filterMedia(id, req?.user?.userId, rows)
      : rows;
    return serializeBigInt(visible);
  }

  @Get('clan/:clanId')
  async listMedia(
    @Param('clanId') clanId: string,
    @Query() filters: QueryMediaDto,
    @Req() req?: any,
  ): Promise<MediaArchive[]> {
    const rows = await this.mediaService.listMedia(BigInt(clanId), filters);
    const visible = this.privacy
      ? await this.privacy.filterMedia(BigInt(clanId), req?.user?.userId, rows)
      : rows;
    return serializeBigInt(visible);
  }

  @Get(':id')
  async getMediaById(@Param('id') id: string, @Req() req?: any): Promise<MediaArchive | null> {
    const media = await this.mediaService.getMediaById(BigInt(id));
    if (!media || !this.privacy) return serializeBigInt(media);
    const visible = await this.privacy.filterMedia(media.clan_id, req?.user?.userId, [media]);
    if (visible.length === 0) throw new NotFoundException('影像不存在');
    return serializeBigInt(visible[0]);
  }

  @Delete(':id')
  async deleteMedia(@Request() req, @Param('id') id: string) {
    const userId = req.user.userId;
    const media = await this.prisma.mediaArchive.findUnique({
      where: { id: BigInt(id) },
      select: {
        id: true,
        clan_id: true,
        uploader_id: true,
        album_id: true,
        deleted_at: true,
      },
    });
    if (!media || media.deleted_at) {
      throw new NotFoundException('影像不存在');
    }

    const clan = await this.prisma.clan.findUnique({
      where: { id: media.clan_id },
      select: { admin_user_id: true },
    });
    if (!clan) {
      throw new NotFoundException('影像不存在');
    }

    let canDeleteAny = clan.admin_user_id === userId;
    if (!canDeleteAny) {
      const member = await this.prisma.clanMember.findUnique({
        where: { clan_id_user_id: { clan_id: media.clan_id, user_id: userId } },
      });
      if (!member) {
        throw new NotFoundException('影像不存在');
      }
      if (member.role === 'OWNER' || member.role === 'ADMIN') {
        canDeleteAny = true;
      } else if (member.role === 'VIEWER') {
        throw new ForbiddenException('观察员只能查看影像');
      } else if (media.uploader_id !== userId) {
        throw new ForbiddenException('只能删除自己上传的影像');
      }
    }

    const deletedAt = new Date();
    await this.prisma.mediaArchive.updateMany({
      where: { id: media.id, clan_id: media.clan_id, deleted_at: null },
      data: { deleted_at: deletedAt, deleted_by: userId },
    });
    if (media.album_id) {
      await this.prisma.clanAlbum.updateMany({
        where: { id: media.album_id, clan_id: media.clan_id, photo_count: { gt: 0 } },
        data: { photo_count: { decrement: 1 } },
      });
    }
    return { id: media.id.toString(), deleted_at: deletedAt };
  }

  /**
   * Get media by person ID (via MediaPersonLink)
   */
  @Get('person/:personId')
  async getMediaByPersonId(@Param('personId') personId: string, @Req() req?: any): Promise<MediaArchive[]> {
    const rows = await this.mediaService.getMediaByPersonId(BigInt(personId));
    if (!this.privacy || rows.length === 0) return serializeBigInt(rows);
    const visible = await this.privacy.filterMedia(rows[0].clan_id, req?.user?.userId, rows);
    return serializeBigInt(visible);
  }

  /**
   * Get avatar info for a person
   */
  @Get('person/:personId/avatar')
  async getPersonAvatar(@Param('personId') personId: string, @Req() req?: any) {
    const avatar = await this.mediaService.getPersonAvatar(BigInt(personId));
    if (!this.privacy) return serializeBigInt(avatar);
    const access = await this.privacy.personAccess(BigInt(personId), req?.user?.userId);
    if (access?.decision.restricted) {
      const hidden = !access.person.is_living
        ? !access.decision.rules.allow_visitor_deceased || access.generation > access.decision.rules.max_generations_visible
        : access.decision.rules.hide_living_photos || access.generation > access.decision.rules.max_generations_visible;
      if (hidden) return { has_photo: false };
    }
    return serializeBigInt(avatar);
  }

  @Post('link')
  async linkMediaToPerson(@Body() dto: LinkMediaDto): Promise<void> {
    return await this.mediaService.linkMediaToPerson(dto.media_id, dto.person_id);
  }

  @Delete('link')
  async unlinkMediaFromPerson(@Body() dto: LinkMediaDto): Promise<void> {
    return await this.mediaService.unlinkMediaFromPerson(dto.media_id, dto.person_id);
  }

  @Post('recommend')
  async recommendMedia(@Body() dto: RecommendMediaDto): Promise<MediaArchive[]> {
    return serializeBigInt(
      await this.mediaService.recommendMediaFromOtherClans(
        dto.currentClanId,
        dto.location,
        dto.takenYear
      ),
    );
  }
}