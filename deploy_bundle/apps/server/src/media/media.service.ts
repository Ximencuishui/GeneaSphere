import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient, MediaArchive } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { AvatarService } from './avatar.service';
import { CosService } from '../cos/cos.service';
import { ImageProcessorService } from '../cos/image-processor.service';

const prisma = new PrismaClient();

interface QueryFilters {
  taken_year?: number;
  taken_location?: string;
}

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private storageRoot: string;
  private avatarService: AvatarService;

  constructor(
    private readonly cosService: CosService,
    private readonly imageProcessor: ImageProcessorService,
    avatarService: AvatarService,
  ) {
    this.avatarService = avatarService;
    this.storageRoot = process.env.STORAGE_PATH || path.join(process.cwd(), 'storage', 'media');
    if (!fs.existsSync(this.storageRoot)) {
      fs.mkdirSync(this.storageRoot, { recursive: true });
    }
  }

  /**
   * 上传媒体文件
   * 根据 STORAGE_DRIVER/COS_ENABLED 自动选择存储后端
   */
  async uploadFile(
    file: Express.Multer.File,
    clan_id: bigint,
    uploader_id: string,
    taken_year?: number,
    taken_location?: string,
    description?: string
  ): Promise<MediaArchive> {
    // 检查是否是图片且 COS 已启用 -> 三档处理
    const isImage = file.mimetype.startsWith('image/');
    const useCos = this.cosService.getDriverType() === 'cos' || process.env.COS_ENABLED === 'true';

    if (isImage && useCos) {
      return this.uploadImageToCos(file, clan_id, uploader_id, taken_year, taken_location, description);
    }

    // 非图片或本地模式：本地存储
    const filename = `${Date.now()}_${file.originalname}`;
    const filePath = path.join(this.storageRoot, filename);
    fs.writeFileSync(filePath, file.buffer);
    const fileUrl = `/media/${filename}`;

    return await prisma.mediaArchive.create({
      data: {
        clan_id,
        uploader_id,
        file_url: fileUrl,
        taken_year,
        taken_location,
        description,
        file_size: file.size,
      },
    });
  }

  /**
   * COS 图片三档上传
   */
  private async uploadImageToCos(
    file: Express.Multer.File,
    clan_id: bigint,
    uploader_id: string,
    taken_year?: number,
    taken_location?: string,
    description?: string
  ): Promise<MediaArchive> {
    const result = await this.imageProcessor.processImage(
      file.buffer,
      clan_id,
      uploader_id,
    );

    const fileUrl = result.displayUrl;

    return await prisma.mediaArchive.create({
      data: {
        clan_id,
        uploader_id,
        file_url: fileUrl,
        display_url: result.displayUrl,
        thumb_url: result.thumbUrl,
        original_key: result.originalKey,
        taken_year,
        taken_location,
        description,
        file_size: file.size,
        media_type: 'image',
      },
    });
  }

  /**
   * 上传到对象存储（保留原有接口签名，内部使用 COS）
   */
  async uploadToOSS(
    file: Express.Multer.File,
    clan_id: bigint,
    uploader_id: string,
    taken_year?: number,
    taken_location?: string,
    description?: string
  ): Promise<MediaArchive> {
    return this.uploadFile(file, clan_id, uploader_id, taken_year, taken_location, description);
  }

  async listMedia(clan_id: bigint, filters?: QueryFilters): Promise<MediaArchive[]> {
    const where: any = { clan_id };

    if (filters?.taken_year !== undefined) {
      where.taken_year = filters.taken_year;
    }

    if (filters?.taken_location) {
      where.taken_location = {
        contains: filters.taken_location,
      };
    }

    return await prisma.mediaArchive.findMany({
      where,
      orderBy: { created_at: 'desc' },
    });
  }

  async getMediaById(id: bigint): Promise<MediaArchive | null> {
    return await prisma.mediaArchive.findUnique({
      where: { id },
      include: { person_links: { include: { person: true } } },
    });
  }

  async getMediaByPersonId(personId: bigint): Promise<MediaArchive[]> {
    const links = await prisma.mediaPersonLink.findMany({
      where: { person_id: personId },
      include: { media: true },
    });
    return links.map((l) => l.media);
  }

  async deleteMedia(id: bigint): Promise<void> {
    await prisma.mediaArchive.delete({ where: { id } });
  }

  /**
   * Generate avatar thumbnail for a person from their linked media
   */
  async generatePersonAvatar(personId: bigint, mediaId: bigint): Promise<string | null> {
    const media = await prisma.mediaArchive.findUnique({
      where: { id: mediaId },
    });

    if (!media) return null;

    const fileUrl = media.file_url;
    // Resolve the physical file path from the URL
    const filename = fileUrl.startsWith('/media/') ? fileUrl.replace('/media/', '') : fileUrl;
    const filePath = path.join(this.storageRoot, filename);

    if (!fs.existsSync(filePath)) return null;

    const thumbnailUrl = await this.avatarService.generatePersonAvatar(filePath, personId);
    if (!thumbnailUrl) return null;

    // Update person record with thumbnail URL
    const { basename, ext } = this.parseFilename(filename);
    const thumbnail80Url = `/media/thumbnails/${basename}_80w${ext}`;

    await (prisma.person.update as any)({
      where: { id: personId },
      data: {
        avatar_url: fileUrl,
        thumbnail_url: thumbnail80Url,
      },
    });

    return thumbnail80Url;
  }

  /**
   * Get avatar info for a person
   */
  async getPersonAvatar(personId: bigint): Promise<{ avatar_url?: string; thumbnail_url?: string; has_photo: boolean }> {
    const person = await (prisma.person.findUnique as any)({
      where: { id: personId },
      select: { avatar_url: true, thumbnail_url: true },
    });

    if (person?.avatar_url || person?.thumbnail_url) {
      return {
        avatar_url: person.avatar_url || undefined,
        thumbnail_url: person.thumbnail_url || undefined,
        has_photo: true,
      };
    }

    return { has_photo: false };
  }

  private parseFilename(filename: string): { basename: string; ext: string } {
    const extIndex = filename.lastIndexOf('.');
    const basename = extIndex > -1 ? filename.substring(0, extIndex) : filename;
    const ext = extIndex > -1 ? filename.substring(extIndex) : '.jpg';
    return { basename, ext };
}

  /**
   * Override linkMediaToPerson to also generate avatar thumbnail
   */
  async linkMediaToPerson(media_id: bigint, person_id: bigint): Promise<void> {
    await prisma.mediaPersonLink.create({
      data: { media_id, person_id },
    });

    // Generate avatar thumbnail in the background
    this.generatePersonAvatar(person_id, media_id).catch((err) =>
      console.error('Failed to generate avatar:', err),
    );
  }

  async unlinkMediaFromPerson(media_id: bigint, person_id: bigint): Promise<void> {
    await prisma.mediaPersonLink.delete({
      where: { media_id_person_id: { media_id, person_id } },
    });
  }

  async recommendMediaFromOtherClans(currentClanId: bigint, location: string, takenYear?: number): Promise<MediaArchive[]> {
    const yearFilter: any = {};

    if (takenYear !== undefined) {
      yearFilter.taken_year = {
        gte: takenYear - 2,
        lte: takenYear + 2,
      };
    }

    const mediaRecords = await prisma.mediaArchive.findMany({
      where: {
        clan_id: { not: currentClanId },
        taken_location: {
          contains: location,
          mode: 'insensitive',
        },
        ...yearFilter,
      },
      orderBy: { created_at: 'desc' },
      include: { clan: { select: { name: true } } },
    });

    return mediaRecords;
  }
}
