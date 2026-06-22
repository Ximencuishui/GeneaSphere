import { Injectable } from '@nestjs/common';
import { PrismaClient, MediaArchive } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { AvatarService } from './avatar.service';

const prisma = new PrismaClient();

interface UploadResult {
  file_url: string;
  filename: string;
}

interface QueryFilters {
  taken_year?: number;
  taken_location?: string;
}

@Injectable()
export class MediaService {
  private storageRoot: string;
  private avatarService: AvatarService;

  constructor() {
    this.avatarService = new AvatarService();
    this.storageRoot = process.env.STORAGE_PATH || path.join(process.cwd(), 'storage', 'media');
    if (!fs.existsSync(this.storageRoot)) {
      fs.mkdirSync(this.storageRoot, { recursive: true });
    }
  }

  async uploadFile(
    file: Express.Multer.File,
    clan_id: bigint,
    uploader_id: string,
    taken_year?: number,
    taken_location?: string,
    description?: string
  ): Promise<MediaArchive> {
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
      },
    });
  }

  async uploadToOSS(
    file: Express.Multer.File,
    clan_id: bigint,
    uploader_id: string,
    taken_year?: number,
    taken_location?: string,
    description?: string
  ): Promise<MediaArchive> {
    const ossEnabled = process.env.OSS_ENABLED === 'true';
    let fileUrl: string;

    if (ossEnabled) {
      fileUrl = await this.uploadToAliyunOSS(file);
    } else {
      const filename = `${Date.now()}_${file.originalname}`;
      const filePath = path.join(this.storageRoot, filename);
      fs.writeFileSync(filePath, file.buffer);
      fileUrl = `/media/${filename}`;
    }

    return await prisma.mediaArchive.create({
      data: {
        clan_id,
        uploader_id,
        file_url: fileUrl,
        taken_year,
        taken_location,
        description,
      },
    });
  }

  private async uploadToAliyunOSS(file: Express.Multer.File): Promise<string> {
    const OSS = await import('ali-oss').then((m) => m.default);

    const client = new OSS({
      region: process.env.OSS_REGION || '',
      accessKeyId: process.env.OSS_ACCESS_KEY_ID || '',
      accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET || '',
      bucket: process.env.OSS_BUCKET || '',
    });

    const filename = `${Date.now()}_${file.originalname}`;
    await client.put(filename, file.buffer);

    return `https://${process.env.OSS_BUCKET}.${process.env.OSS_REGION}.aliyuncs.com/${filename}`;
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
