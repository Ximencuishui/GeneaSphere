import { Injectable } from '@nestjs/common';
import { PrismaClient, MediaArchive } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

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

  constructor() {
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

  async deleteMedia(id: bigint): Promise<void> {
    await prisma.mediaArchive.delete({ where: { id } });
  }

  async linkMediaToPerson(media_id: bigint, person_id: bigint): Promise<void> {
    await prisma.mediaPersonLink.create({
      data: { media_id, person_id },
    });
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
