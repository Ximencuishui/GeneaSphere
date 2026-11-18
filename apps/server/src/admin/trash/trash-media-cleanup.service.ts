import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '@geneasphere/db';
import { CosService } from '../../cos/cos.service';
import { unlink } from 'fs/promises';
import * as path from 'path';

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

type ExpiredMediaFile = {
  id: bigint;
  file_url: string;
  display_url: string | null;
  thumb_url: string | null;
  original_key: string | null;
};

/**
 * 每日物理清理回收站里软删除超过 30 天的影像。
 * 软删除时已经扣过相册 photo_count，这里不再 decrement。
 */
@Injectable()
export class TrashMediaCleanupService {
  private readonly logger = new Logger(TrashMediaCleanupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cosService: CosService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async cleanupExpiredTrashMedia(): Promise<void> {
    try {
      const removed = await this.purgeExpired(new Date());
      this.logger.log(`已物理清理回收站超过 30 天的影像 ${removed} 条`);
    } catch (error) {
      this.logger.warn(`清理回收站过期影像失败: ${(error as Error).message}`);
    }
  }

  async purgeExpired(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - RETENTION_MS);
    const rows = await this.prisma.mediaArchive.findMany({
      where: {
        deleted_at: { not: null, lt: cutoff },
      },
      select: {
        id: true,
        file_url: true,
        display_url: true,
        thumb_url: true,
        original_key: true,
      },
    });

    let removed = 0;
    for (const row of rows) {
      try {
        await Promise.all([
          this.prisma.mediaPersonLink.deleteMany({ where: { media_id: row.id } }),
          this.prisma.mediaReview.deleteMany({ where: { media_id: row.id } }),
        ]);
        await this.prisma.mediaArchive.delete({ where: { id: row.id } });
        await this.removeStoredFiles(row);
        removed += 1;
      } catch (error) {
        this.logger.warn(`清理过期影像 ${row.id} 失败: ${(error as Error).message}`);
      }
    }
    return removed;
  }

  private async removeStoredFiles(media: ExpiredMediaFile): Promise<void> {
    const localPaths = new Set<string>();
    for (const url of [media.file_url, media.display_url, media.thumb_url]) {
      const abs = url ? this.resolveLocalMediaPath(url) : null;
      if (abs) localPaths.add(abs);
    }
    for (const abs of localPaths) {
      try {
        await unlink(abs);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== 'ENOENT') {
          this.logger.warn(`删除本地影像失败 ${abs}: ${(error as Error).message}`);
        }
      }
    }

    if (media.original_key) {
      try {
        await this.cosService.deleteFile(media.original_key, 'cold');
      } catch (error) {
        this.logger.warn(`删除 COS 原图失败 ${media.original_key}: ${(error as Error).message}`);
      }
    }

    const hotKeys = new Set<string>();
    for (const url of [media.file_url, media.display_url, media.thumb_url]) {
      const key = this.cosKeyFromRemoteUrl(url);
      if (key) hotKeys.add(key);
    }
    for (const key of hotKeys) {
      try {
        await this.cosService.deleteFile(key, 'hot');
      } catch (error) {
        this.logger.warn(`删除 COS 对象失败 ${key}: ${(error as Error).message}`);
      }
    }
  }

  /** file_url 以 /media/ 开头时，文件落在 STORAGE_PATH。 */
  private resolveLocalMediaPath(fileUrl: string): string | null {
    if (!fileUrl.startsWith('/media/')) return null;
    const rel = fileUrl.slice('/media/'.length);
    if (!rel || rel.includes('..') || rel.includes('\\') || path.isAbsolute(rel)) return null;
    const storageRoot = path.resolve(
      process.env.STORAGE_PATH || path.join(process.cwd(), 'storage', 'media'),
    );
    const abs = path.resolve(storageRoot, ...rel.split('/'));
    const relative = path.relative(storageRoot, abs);
    if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
    return abs;
  }

  /**
   * 复用 CosService.deleteFile。解析不出对象 key 的远程地址不删除，避免另造一套 SDK。
   */
  private cosKeyFromRemoteUrl(url?: string | null): string | null {
    if (!url || url.startsWith('/')) return null;
    if (url.startsWith('http://') || url.startsWith('https://')) {
      try {
        const key = new URL(url).pathname.replace(/^\/+/, '');
        return key || null;
      } catch {
        return null;
      }
    }
    if (url.startsWith('media/')) return url;
    return null;
  }
}
