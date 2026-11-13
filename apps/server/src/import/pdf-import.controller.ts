import {
  Controller,
  Post,
  Get,
  Put,
  UseInterceptors,
  UploadedFile,
  Body,
  Param,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
  HttpException,
  UseGuards,
  Request,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { PdfImportService, PdfImportTaskState, PdfPersonRecord } from './pdf-import.service';
import { OcrBillingService } from './ocr-billing.service';
import { assertPdfUpload } from './pdf-upload';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminService } from '../admin/admin.service';

@UseGuards(JwtAuthGuard)
@Controller('api/import/pdf')
export class PdfImportController {
  constructor(
    private readonly pdfImportService: PdfImportService,
    private readonly ocrBilling: OcrBillingService,
    private readonly adminService: AdminService,
  ) {}

  private actor(req: { user?: { userId?: string } }): string {
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('登录已失效');
    }
    return userId;
  }

  private present(task: PdfImportTaskState) {
    return {
      taskId: task.taskId,
      status: task.status,
      fileName: task.fileName,
      fileSize: task.fileSize,
      parseMode: task.parseMode,
      totalPages: task.totalPages,
      recordCount: task.records.length,
      metadata: task.metadata,
      errorMessage: task.errorMessage,
      ocrProvider: task.ocrProvider,
      ocrEstimatedFee: task.ocrEstimatedFee,
      ocrPrecheck: task.ocrPrecheck,
      ocrFeeDetail: task.ocrFeeDetail,
      ocrCharsCount: task.ocrCharsCount,
      importResult: task.importResult,
      progress: task.progress ?? null,
    };
  }

  /**
   * 查询当前用户 OCR 免费额度
   */
  @Get('quota')
  async getOcrQuota(@Request() req) {
    return this.ocrBilling.getOcrQuota(this.actor(req));
  }

  /**
   * 上传 PDF 并创建导入任务。用户身份只取自登录态。
   */
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      // 请求体在进入控制器前若断开，内存缓冲随请求释放，磁盘上不会留下半份 PDF。
      fileFilter: (req, file, cb) => {
        if (!file.originalname.match(/\.(pdf)$/i)) {
          return cb(new BadRequestException('只允许上传 .pdf 文件'), false);
        }
        cb(null, true);
      },
      limits: {
        fileSize: 50 * 1024 * 1024,
      },
    }),
  )
  async uploadPdf(
    @Request() req,
    @UploadedFile() file: Express.Multer.File,
    @Body('clan_slug') clanSlug: string,
  ) {
    if (!file) {
      throw new BadRequestException('请上传PDF文件');
    }
    assertPdfUpload(file);

    const userId = this.actor(req);
    const clanId = await this.adminService.requireAdminBySlug(clanSlug, userId);

    try {
      const created = await this.pdfImportService.createImportTask(
        userId,
        clanId,
        file.buffer,
        file.originalname,
      );

      return {
        success: true,
        taskId: created.taskId,
        queued: created.queued,
        queuePosition: created.queuePosition,
        message: created.queued
          ? `已排队，前面还有 ${created.queuePosition - 1} 个解析任务`
          : 'PDF上传成功，正在解析...',
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new BadRequestException((error as Error).message || 'PDF上传失败');
    }
  }

  /**
   * 查询 PDF 解析任务状态（仅该家族管理员）
   */
  @Get('task/:taskId/status')
  async getTaskStatus(@Request() req, @Param('taskId') taskId: string) {
    const task = await this.requireOwnedTask(req, taskId);
    return this.present(task);
  }

  /** OCR 扫描件的页进度。文本 PDF 的 phase 会停在 reading / extracting / done。 */
  @Get('task/:taskId/progress')
  async getProgress(@Request() req, @Param('taskId') taskId: string) {
    const task = await this.requireOwnedTask(req, taskId);
    return {
      taskId: task.taskId,
      status: task.status,
      parseMode: task.parseMode,
      progress: task.progress ?? {
        phase: task.status === 'preview' || task.status === 'correcting' || task.status === 'completed' ? 'done' : 'reading',
        currentPage: 0,
        totalPages: task.totalPages,
        message: '',
      },
    };
  }

  /** 扫描件校对时按页取预览图。 */
  @Get('task/:taskId/page/:page')
  async getPageImage(@Request() req, @Param('taskId') taskId: string, @Param('page') page: string) {
    await this.requireOwnedTask(req, taskId);
    const pageNumber = Number(page);
    if (!Number.isInteger(pageNumber) || pageNumber < 1) {
      throw new BadRequestException('页码不正确');
    }
    const rendered = await this.pdfImportService.renderPagePreview(taskId, pageNumber);
    return {
      page: pageNumber,
      totalPages: rendered.totalPages,
      contentType: 'image/png',
      dataUrl: `data:image/png;base64,${rendered.png.toString('base64')}`,
    };
  }

  /**
   * 获取 PDF 解析预览数据
   */
  @Get('task/:taskId/preview')
  async getTaskPreview(@Request() req, @Param('taskId') taskId: string) {
    await this.requireOwnedTask(req, taskId);
    const records = await this.pdfImportService.getTaskPreview(taskId);

    if (!records) {
      throw new NotFoundException('任务不存在或尚未完成解析');
    }

    return {
      taskId,
      totalRecords: records.length,
      records,
    };
  }

  /**
   * 提交校对后的数据
   */
  @Put('task/:taskId/correct')
  async submitCorrection(
    @Request() req,
    @Param('taskId') taskId: string,
    @Body('records') records: PdfPersonRecord[],
  ) {
    if (!records || !Array.isArray(records)) {
      throw new BadRequestException('请提供校正后的记录数据');
    }

    await this.requireOwnedTask(req, taskId);
    await this.pdfImportService.updateCorrectedRecords(taskId, records);

    return {
      success: true,
      message: '校对数据已保存',
      recordCount: records.length,
    };
  }

  /**
   * 执行 PDF 导入。家族以 clan_slug 为准，并确认任务属于该家族。
   */
  @Post('task/:taskId/execute')
  async executeImport(
    @Request() req,
    @Param('taskId') taskId: string,
    @Body('clan_slug') clanSlug: string,
    @Body('records') records?: PdfPersonRecord[],
    @Body('duplicate_strategy') duplicateStrategy?: 'skip' | 'merge' | 'create',
  ) {
    const userId = this.actor(req);
    const clanId = await this.adminService.requireAdminBySlug(clanSlug, userId);
    const task = await this.pdfImportService.getTaskStatus(taskId);
    if (!task) {
      throw new NotFoundException('任务不存在');
    }
    if (task.clanId !== clanId.toString()) {
      throw new NotFoundException('任务不存在');
    }
    if (records && !Array.isArray(records)) {
      throw new BadRequestException('校对数据格式不正确');
    }

    const result = await this.pdfImportService.executeImport(
      taskId,
      clanId,
      records,
      duplicateStrategy,
    );
    if (result.needsDuplicateChoice) {
      return {
        success: false,
        needsDuplicateChoice: true,
        duplicates: result.duplicates ?? [],
        message: '发现与现有族员重名，请选择跳过、合并或新增',
      };
    }

    const latest = await this.pdfImportService.getTaskStatus(taskId);
    return {
      success: true,
      message: `导入完成: 成功 ${result.successCount} 条, 跳过 ${result.skippedCount} 条`,
      ...result,
      ocrFeeDetail: latest?.ocrFeeDetail,
      ocrEstimatedFee: latest?.ocrEstimatedFee,
    };
  }

  private async requireOwnedTask(req: { user?: { userId?: string } }, taskId: string) {
    const userId = this.actor(req);
    const task = await this.pdfImportService.getTaskStatus(taskId);
    if (!task) {
      throw new NotFoundException('任务不存在');
    }
    await this.adminService.requireAdmin(BigInt(task.clanId), userId);
    return task;
  }
}
