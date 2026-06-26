import {
  Controller,
  Post,
  Get,
  Put,
  UseInterceptors,
  UploadedFile,
  Body,
  Param,
  Query,
  ParseIntPipe,
  BadRequestException,
  NotFoundException,
  UseGuards,
  Request,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { PdfImportService, PdfPersonRecord } from './pdf-import.service';
import { OcrBillingService } from './ocr-billing.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ClanResolverService } from '../common/clan-resolver.service';

@UseGuards(JwtAuthGuard)
@Controller('import/pdf')
export class PdfImportController {
  constructor(
    private readonly pdfImportService: PdfImportService,
    private readonly ocrBilling: OcrBillingService,
    private readonly clanResolver: ClanResolverService,
  ) {}

  /**
   * 查询当前用户 OCR 免费额度
   */
  @Get('quota')
  async getOcrQuota(@Request() req) {
    const userId = req.user.userId;
    return this.ocrBilling.getOcrQuota(userId);
  }

  /**
   * 上传PDF文件并创建导入任务
   */
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(), // 保持文件在内存中以便后续处理
      fileFilter: (req, file, cb) => {
        if (!file.originalname.match(/\.(pdf)$/)) {
          return cb(new BadRequestException('只允许上传 .pdf 文件'), false);
        }
        cb(null, true);
      },
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB
      },
    })
  )
  async uploadPdf(
    @UploadedFile() file: Express.Multer.File,
    @Body('clan_slug') clanSlug: string,
    @Body('user_id') userId: string,
    @Body('force_ocr') forceOcr?: string
  ) {
    if (!file) {
      throw new BadRequestException('请上传PDF文件');
    }

    const { id: clanId } = await this.clanResolver.resolveOrThrow(clanSlug);

    try {
      const taskId = await this.pdfImportService.createImportTask(
        userId,
        clanId,
        file.buffer,
        file.originalname
      );

      return {
        success: true,
        taskId,
        forceOcr: forceOcr === 'true',
        message: 'PDF上传成功，正在解析...',
      };
    } catch (error) {
      throw new BadRequestException(error.message || 'PDF上传失败');
    }
  }

  /**
   * 查询PDF解析任务状态
   */
  @Get('task/:taskId/status')
  async getTaskStatus(@Param('taskId') taskId: string) {
    const task = this.pdfImportService.getTaskStatus(taskId);

    if (!task) {
      throw new NotFoundException('任务不存在');
    }

    return {
      taskId: task.taskId,
      status: task.status,
      fileName: task.fileName,
      fileSize: task.fileSize,
      parseMode: task.parseMode,
      totalPages: task.totalPages,
      recordCount: task.extractedRecords.length,
      metadata: task.metadata,
      errorMessage: task.errorMessage,
      // ========== OCR 计费信息 ==========
      ocrProvider: task.ocrProvider,
      ocrEstimatedFee: task.ocrEstimatedFee,
      ocrPrecheck: task.ocrPrecheck,
      ocrFeeDetail: task.ocrFeeDetail,
      ocrCharsCount: task.ocrCharsCount,
    };
  }

  /**
   * 获取PDF解析预览数据
   */
  @Get('task/:taskId/preview')
  async getTaskPreview(@Param('taskId') taskId: string) {
    const records = this.pdfImportService.getTaskPreview(taskId);

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
    @Param('taskId') taskId: string,
    @Body('records') records: PdfPersonRecord[]
  ) {
    if (!records || !Array.isArray(records)) {
      throw new BadRequestException('请提供校正后的记录数据');
    }

    this.pdfImportService.updateCorrectedRecords(taskId, records);

    return {
      success: true,
      message: '校对数据已保存',
      recordCount: records.length,
    };
  }

  /**
   * 执行PDF导入
   */
  @Post('task/:taskId/execute')
  async executeImport(
    @Param('taskId') taskId: string,
    @Body('user_id') userId: string,
    @Body('clan_slug') clanSlug: string
  ) {
    const { id: clanId } = await this.clanResolver.resolveOrThrow(clanSlug);

    try {
      const result = await this.pdfImportService.executeImport(
        taskId,
        userId,
        clanId
      );

      const task = this.pdfImportService.getTaskStatus(taskId);
      return {
        success: true,
        message: `导入完成: 成功 ${result.successCount} 条, 失败 ${result.failureCount} 条`,
        ...result,
        ocrFeeDetail: task?.ocrFeeDetail,
        ocrEstimatedFee: task?.ocrEstimatedFee,
      };
    } catch (error) {
      throw new BadRequestException(error.message || '导入执行失败');
    }
  }
}
