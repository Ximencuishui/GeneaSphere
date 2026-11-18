import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ClanExportService } from './clan-export.service';

@Injectable()
export class ClanExportCleanupService {
  private readonly logger = new Logger(ClanExportCleanupService.name);

  constructor(private readonly exports: ClanExportService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupExpiredExports(): Promise<void> {
    try {
      const removed = await this.exports.purgeExpired(new Date());
      this.logger.log(`已删除超过 7 天的家族导出 ${removed} 个`);
    } catch (error) {
      this.logger.warn(`清理过期导出失败: ${(error as Error).message}`);
    }
  }
}
