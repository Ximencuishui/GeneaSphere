import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PdfImportService } from './pdf-import.service';

@Injectable()
export class PdfImportCleanupService {
  private readonly logger = new Logger(PdfImportCleanupService.name);

  constructor(private readonly pdfImportService: PdfImportService) {}

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async cleanupStaleImports(): Promise<void> {
    try {
      const removed = await this.pdfImportService.cleanupStaleTasks();
      this.logger.log(`定时清理未完成或失败的 PDF 导入任务 ${removed} 个`);
    } catch (error) {
      this.logger.warn(`定时清理 PDF 导入任务失败: ${(error as Error).message}`);
    }
  }
}
