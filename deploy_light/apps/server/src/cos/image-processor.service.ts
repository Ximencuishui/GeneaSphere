import { Injectable, Logger } from '@nestjs/common';
import { CosService } from './cos.service';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';

export interface ProcessedImages {
  originalKey: string;    // 冷 Bucket key
  displayUrl: string;     // 热 Bucket CDN URL
  thumbUrl: string;       // 热 Bucket CDN URL
  originalExt: string;
}

@Injectable()
export class ImageProcessorService {
  private readonly logger = new Logger(ImageProcessorService.name);

  constructor(private readonly cosService: CosService) {}

  /**
   * 处理上传的图片，生成三档：
   * 1. 原始图 -> 冷 Bucket /media/original/{clan_id}/{uuid}.{ext}
   * 2. 展示图 (1920px JPEG 80%) -> 热 Bucket /media/display/{clan_id}/{uuid}.jpg
   * 3. 缩略图 (300px WebP) -> 热 Bucket /media/thumb/{clan_id}/{uuid}.webp
   */
  async processImage(
    buffer: Buffer,
    clanId: string | bigint,
    uploaderId: string,
  ): Promise<ProcessedImages> {
    const uuid = uuidv4().replace(/-/g, '');
    const clanIdStr = clanId.toString();
    const ext = await this.detectOriginalExt(buffer);

    // 1. 上传原始图到冷 Bucket
    const originalKey = `media/original/${clanIdStr}/${uuid}.${ext}`;
    await this.cosService.uploadFile(originalKey, buffer, {
      contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
      bucketType: 'cold',
    });

    // 2. 生成并上传展示图 (1920px JPEG 80%)
    const displayBuffer = await sharp(buffer)
      .resize(1920, undefined, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    const displayKey = `media/display/${clanIdStr}/${uuid}.jpg`;
    const displayResult = await this.cosService.uploadFile(displayKey, displayBuffer, {
      contentType: 'image/jpeg',
      bucketType: 'hot',
    });

    // 3. 生成并上传缩略图 (300px WebP)
    const thumbBuffer = await sharp(buffer)
      .resize(300, undefined, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 75 })
      .toBuffer();
    const thumbKey = `media/thumb/${clanIdStr}/${uuid}.webp`;
    const thumbResult = await this.cosService.uploadFile(thumbKey, thumbBuffer, {
      contentType: 'image/webp',
      bucketType: 'hot',
    });

    this.logger.log(`图片处理完成: original=${originalKey}, display=OK, thumb=OK`);

    return {
      originalKey,
      displayUrl: displayResult.url,
      thumbUrl: thumbResult.url,
      originalExt: ext,
    };
  }

  /**
   * 简化处理：仅生成缩略图（用于头像上传等场景）
   */
  async processImageSimple(
    buffer: Buffer,
    category: string,
    subPath: string,
    ext: string,
  ): Promise<{ url: string; key: string }> {
    const uuid = uuidv4().replace(/-/g, '');
    const key = `${category}/${subPath}/${uuid}.${ext}`;

    const result = await this.cosService.uploadFile(key, buffer, {
      contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
      bucketType: 'hot',
    });

    return { url: result.url, key };
  }

  /**
   * 上传任意文件到COS（非图片，如PDF、视频）
   */
  async uploadFile(
    buffer: Buffer,
    category: string,
    subPath: string,
    ext: string,
    bucketType: 'hot' | 'cold' = 'hot',
  ): Promise<{ url: string; key: string }> {
    const uuid = uuidv4().replace(/-/g, '');
    const key = `${category}/${subPath}/${uuid}.${ext}`;

    const contentType = this.getContentType(ext);

    const result = await this.cosService.uploadFile(key, buffer, {
      contentType,
      bucketType,
    });

    return { url: result.url, key };
  }

  private async detectOriginalExt(buffer: Buffer): Promise<string> {
    try {
      const metadata = await sharp(buffer).metadata();
      const format = metadata.format || 'jpeg';
      return format === 'jpeg' ? 'jpg' : format;
    } catch {
      return 'jpg';
    }
  }

  private getContentType(ext: string): string {
    const map: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      gif: 'image/gif',
      mp4: 'video/mp4',
      pdf: 'application/pdf',
    };
    return map[ext] || 'application/octet-stream';
  }
}
