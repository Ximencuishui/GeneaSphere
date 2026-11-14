import { Injectable, Logger, HttpException, NotFoundException, BadRequestException, ForbiddenException, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '@geneasphere/db';
import { PdfTextParserService, PdfParseResult, PdfParseProgress } from './pdf-text-parser.service';
import { OcrService } from './ocr.service';
import { CosService } from '../cos/cos.service';
import {
  OcrBillingService,
  OcrFeeDetail,
  OcrPrecheckResult,
  isInsufficientBalance,
} from './ocr-billing.service';
import { PedigreeService } from '../pedigree/pedigree.service';
import { GenealogyEditionService } from '../genealogy-edition/genealogy-edition.service';
import { extractPersonsFromText, PdfPersonRecord } from './pdf-person-parser';
import { PdfParseQueue } from './pdf-parse-queue';
import {
  PDF_PARSE_TIMEOUT_MESSAGE,
  PdfParseTimeoutError,
  runWithDeadline,
} from './pdf-parse-timeout';

export type { PdfPersonRecord } from './pdf-person-parser';

export type DuplicateStrategy = 'skip' | 'merge' | 'create';

export interface DuplicateNameHit {
  fullName: string;
  count: number;
  rowNumbers: number[];
}

export interface PdfImportResult {
  successCount: number;
  failureCount: number;
  skippedCount: number;
  mergedCount: number;
  errors: string[];
  needsDuplicateChoice?: boolean;
  duplicates?: DuplicateNameHit[];
  anchorPersonId?: string;
}

/** 落在 pdf_import_tasks.ocr_result 里的解析与计费快照 */
interface StoredOcrResult {
  records: PdfPersonRecord[];
  metadata: Record<string, any>;
  ocrProvider?: string;
  ocrEstimatedFee?: number;
  ocrPrecheck?: OcrPrecheckResult;
  ocrFeeDetail?: OcrFeeDetail;
  ocrCharsCount?: number;
  importResult?: PdfImportResult;
  progress?: PdfParseProgress;
}

export interface PdfImportTaskState {
  taskId: string;
  clanId: string;
  status: 'pending' | 'parsing' | 'preview' | 'correcting' | 'importing' | 'completed' | 'failed';
  fileName: string;
  fileSize: number;
  parseMode: 'text' | 'ocr';
  totalPages: number;
  records: PdfPersonRecord[];
  metadata: Record<string, any>;
  errorMessage?: string;
  ocrProvider?: string;
  ocrEstimatedFee?: number;
  ocrPrecheck?: OcrPrecheckResult;
  ocrFeeDetail?: OcrFeeDetail;
  ocrCharsCount?: number;
  importResult?: PdfImportResult;
  progress?: PdfParseProgress;
}

@Injectable()
export class PdfImportService implements OnModuleInit {
  private readonly logger = new Logger(PdfImportService.name);
  private readonly uploadRoot = path.resolve(process.cwd(), 'uploads', 'pdf-import');
  private readonly parseQueue = new PdfParseQueue();
  private static readonly STALE_STATUSES = ['pending', 'parsing', 'preview', 'correcting', 'importing', 'failed'];

  constructor(
    private readonly pdfTextParser: PdfTextParserService,
    private readonly prisma: PrismaService,
    private readonly ocrService: OcrService,
    private readonly ocrBilling: OcrBillingService,
    private readonly cosService: CosService,
    private readonly pedigreeService: PedigreeService,
    private readonly edition: GenealogyEditionService,
  ) {}

  async onModuleInit() {
    this.startup().catch((err) => {
      this.logger.error(`PDF 导入启动清理失败: ${(err as Error).message}`);
    });
  }

  private async startup(): Promise<void> {
    await this.cleanupStaleTasks().catch((err) => {
      this.logger.error(`清理过期 PDF 导入任务失败: ${(err as Error).message}`);
    });
    await this.resumeIncomplete();
  }

  /**
   * 创建 PDF 导入任务。扫描件先预检余额，不够就直接拒绝，不落任务、不进 OCR。
   * 通过的任务进入单并发队列，后上传的在前一份解析完之前保持 pending。
   */
  async createImportTask(
    userId: string,
    clanId: bigint,
    fileBuffer: Buffer,
    fileName: string,
  ): Promise<{ taskId: string; queued: boolean; queuePosition: number }> {
    const assessment = await this.pdfTextParser.assessPdf(fileBuffer);
    if (assessment.needsOcr) {
      await this.ocrBilling.assertAffordable(userId, assessment.totalPages);
    }

    const taskId = this.generateTaskId();
    const fileUrl = await this.persistOriginalFile(clanId, taskId, fileBuffer);
    let taskCreated = false;

    try {
    this.logger.log(`[PDF_Import] Task ${taskId} 开始接收 ${fileName}`);

    await this.prisma.pdfImportTask.create({
      data: {
        id: taskId,
        user_id: userId,
        clan_id: clanId,
        file_name: fileName,
        file_size: BigInt(fileBuffer.length),
        file_url: fileUrl,
        parse_mode: assessment.needsOcr ? 'ocr' : 'text',
        total_pages: assessment.totalPages,
        status: 'pending',
        ocr_result: { records: [], metadata: {} },
      },
    });
    taskCreated = true;

    try {
      await this.prisma.pdfImportLog.create({
        data: {
          task_id: taskId,
          user_id: userId,
          clan_id: clanId,
          file_name: fileName,
          file_size: BigInt(fileBuffer.length),
          file_path: fileUrl,
          parse_mode: assessment.needsOcr ? 'ocr' : 'text',
          total_pages: assessment.totalPages,
          status: 'pending',
        },
      });
    } catch (err) {
      this.logger.warn(`PdfImportLog 持久化失败（不影响解析）: ${(err as Error).message}`);
    }

    if (this.cosService.getDriverType() === 'cos' || process.env.COS_ENABLED === 'true') {
      this.uploadOriginalPdfToCos(taskId, fileBuffer, userId, clanId).catch((err) => {
        this.logger.warn(`原始 PDF 上传 COS 失败（非关键路径）: ${err.message}`);
      });
    }

    const busy = this.parseQueue.pendingCount > 0;
    if (busy) {
      await this.persistTask(taskId, { status: 'pending' }, {
        progress: {
          phase: 'reading',
          currentPage: 0,
          totalPages: assessment.totalPages,
          message: '排队等待解析',
        },
      });
    }
    const slot = this.enqueueStoredTask(taskId, userId, clanId);
    this.logger.log(
      `[PDF_Import] Task ${taskId} 已入队 position=${slot.queuePosition} queued=${slot.queued}`,
    );
    return { taskId, queued: slot.queued, queuePosition: slot.queuePosition };
    } catch (error) {
      if (!taskCreated) await this.removeStoredFile(fileUrl);
      throw error;
    }
  }

  async getTaskStatus(taskId: string): Promise<PdfImportTaskState | null> {
    const row = await this.prisma.pdfImportTask.findUnique({ where: { id: taskId } });
    if (!row) return null;
    return this.toState(row);
  }

  async getTaskPreview(taskId: string): Promise<PdfPersonRecord[] | undefined> {
    const task = await this.getTaskStatus(taskId);
    if (!task) return undefined;
    if (task.status !== 'preview' && task.status !== 'correcting') return undefined;
    return task.records;
  }

  async updateCorrectedRecords(taskId: string, correctedRecords: PdfPersonRecord[]): Promise<void> {
    const row = await this.prisma.pdfImportTask.findUnique({ where: { id: taskId } });
    if (!row) {
      throw new NotFoundException('任务不存在');
    }
    if (row.status !== 'preview' && row.status !== 'correcting') {
      throw new BadRequestException('任务状态不正确，无法校对');
    }

    await this.persistTask(taskId, { status: 'correcting' }, { records: correctedRecords });
    await this.updateLog(taskId, { status: 'correcting' });
    await this.persistCorrection(taskId, correctedRecords);
    this.logger.log(`任务 ${taskId} 已更新校对记录，共 ${correctedRecords.length} 条`);
  }

  async executeImport(
    taskId: string,
    clanId: bigint,
    correctedRecords?: PdfPersonRecord[],
    duplicateStrategy?: DuplicateStrategy,
  ): Promise<PdfImportResult> {
    const row = await this.prisma.pdfImportTask.findUnique({ where: { id: taskId } });
    if (!row) {
      throw new NotFoundException('任务不存在');
    }
    if (row.clan_id !== clanId) {
      throw new ForbiddenException('任务不属于该家族');
    }
    if (row.status !== 'correcting' && row.status !== 'preview') {
      throw new BadRequestException('任务状态不正确，请先完成解析和校对');
    }

    const source = correctedRecords ?? this.readPayload(row.ocr_result).records;
    const records = rebindRelations(source.map((item) => ({ ...item })));
    if (records.length === 0) {
      throw new BadRequestException('没有可导入的人员记录');
    }
    if (records.some((item) => !item.fullName?.trim())) {
      throw new BadRequestException('存在空姓名，请先在校对表中补全或删除');
    }

    await this.persistTask(taskId, { status: 'correcting' }, { records });
    await this.updateLog(taskId, { status: 'correcting' });
    await this.persistCorrection(taskId, records);

    const duplicates = await this.findDuplicateNames(clanId, records);
    if (duplicates.length > 0 && !duplicateStrategy) {
      return {
        successCount: 0,
        failureCount: 0,
        skippedCount: 0,
        mergedCount: 0,
        errors: [],
        needsDuplicateChoice: true,
        duplicates,
      };
    }

    await this.persistTask(taskId, { status: 'importing' });
    await this.updateLog(taskId, { status: 'importing' });

    try {
      const importResult = await this.writeRecords(clanId, records, duplicateStrategy ?? 'create');
      await this.persistTask(taskId, { status: 'completed' }, { records, importResult });
      await this.updateLog(taskId, {
        status: 'completed',
        total_records: records.length,
        success_records: importResult.successCount,
        failed_records: importResult.failureCount,
        completed_at: new Date(),
      });
      this.logger.log(
        `任务 ${taskId} 导入完成: 新增/合并 ${importResult.successCount} 条, 跳过 ${importResult.skippedCount} 条`,
      );
      return importResult;
    } catch (error) {
      const errorMessage = (error as Error).message || '导入执行失败';
      await this.persistTask(taskId, { status: 'correcting', error_message: errorMessage });
      await this.updateLog(taskId, { status: 'correcting', error_message: errorMessage });
      throw error;
    }
  }

  /**
   * 进程重启后，把仍停在 pending/parsing 且文件还在的任务重新解析。
   */
  private async resumeIncomplete(): Promise<void> {
    const rows = await this.prisma.pdfImportTask.findMany({
      where: { status: { in: ['pending', 'parsing'] } },
      orderBy: { created_at: 'asc' },
    });
    if (rows.length === 0) return;
    this.logger.log(`恢复 ${rows.length} 个未完成的 PDF 导入任务`);

    for (const row of rows) {
      try {
        if (!row.file_url) {
          await this.markFailed(row.id, '原始文件缺失，无法恢复解析');
          continue;
        }
        const abs = this.resolveStoredFile(row.file_url);
        if (!fs.existsSync(abs)) {
          await this.markFailed(row.id, '原始文件缺失，无法恢复解析');
          continue;
        }
        this.enqueueStoredTask(row.id, row.user_id, row.clan_id);
      } catch (err) {
        this.logger.error(`恢复任务 ${row.id} 失败: ${(err as Error).message}`);
        await this.markFailed(row.id, (err as Error).message || '恢复解析失败');
      }
    }
  }

  private enqueueStoredTask(
    taskId: string,
    userId: string,
    clanId: bigint,
  ): { queued: boolean; queuePosition: number } {
    return this.parseQueue.enqueue(async () => {
      const row = await this.prisma.pdfImportTask.findUnique({ where: { id: taskId } });
      if (!row?.file_url) {
        await this.markFailed(taskId, '原始文件缺失，无法解析');
        return;
      }
      if (row.status === 'failed' || row.status === 'completed') return;
      const abs = this.resolveStoredFile(row.file_url);
      if (!fs.existsSync(abs)) {
        await this.markFailed(taskId, '原始文件缺失，无法解析');
        return;
      }
      const buffer = await fs.promises.readFile(abs);
      await runWithDeadline(
        (isExpired) => this.parsePdfAsync(taskId, buffer, userId, clanId, isExpired),
        async () => {
          this.logger.error(`[PDF_Import] Task ${taskId} 解析失败: ${PDF_PARSE_TIMEOUT_MESSAGE}`);
          await this.ocrService.releaseEngine().catch((err) => {
            this.logger.warn(`[PDF_Import] Task ${taskId} 释放识别引擎失败: ${(err as Error).message}`);
          });
          await this.markFailed(taskId, PDF_PARSE_TIMEOUT_MESSAGE);
          await this.removeStoredFile(row.file_url);
        },
      );
    });
  }

  private async failForBalance(taskId: string, userId: string, error: HttpException): Promise<void> {
    const resp = error.getResponse() as { message?: string; error?: string; required?: number; current?: number };
    const errorMessage = resp?.message || '余额不足，已中止识别';
    await this.persistTask(
      taskId,
      { status: 'failed', error_message: errorMessage },
      {
        metadata: {
          ocrBillingError: {
            error: resp?.error || 'INSUFFICIENT_BALANCE',
            required: resp?.required,
            current: resp?.current,
          },
        },
      },
    );
    await this.updateLog(taskId, { status: 'failed', error_message: errorMessage });
    await this.ocrBilling.recordFailure(userId, taskId, errorMessage);
    this.logger.warn(`[PDF_Import] Task ${taskId} 解析失败: ${errorMessage}`);
  }

  /**
   * 删除 7 天前仍未完成或已经失败的任务，以及落在本地的临时 PDF。
   */
  async cleanupStaleTasks(days = 7): Promise<number> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const rows = await this.prisma.pdfImportTask.findMany({
      where: {
        status: { in: PdfImportService.STALE_STATUSES },
        created_at: { lt: cutoff },
      },
      select: { id: true, file_url: true },
    });
    for (const row of rows) {
      if (row.file_url) {
        try {
          await fs.promises.unlink(this.resolveStoredFile(row.file_url));
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code;
          if (code !== 'ENOENT') {
            this.logger.warn(`删除临时 PDF 失败 ${row.id}: ${(error as Error).message}`);
          }
        }
      }
      const log = await this.prisma.pdfImportLog.findUnique({
        where: { task_id: row.id },
        select: { id: true },
      });
      if (log) {
        await this.prisma.pdfParseTemp.deleteMany({ where: { import_log_id: log.id } });
        await this.prisma.pdfImportLog.delete({ where: { id: log.id } });
      }
      await this.prisma.pdfImportTask.delete({ where: { id: row.id } });
    }
    if (rows.length > 0) {
      this.logger.log(`已清理 ${rows.length} 个超过 ${days} 天的未完成或失败导入任务`);
    }
    return rows.length;
  }

  private async parsePdfAsync(
    taskId: string,
    fileBuffer: Buffer,
    userId: string,
    _clanId: bigint,
    isExpired: () => boolean = () => false,
  ): Promise<void> {
    const ensureAlive = () => {
      if (isExpired()) throw new PdfParseTimeoutError();
    };
    try {
      const provider = this.ocrService.getProviderName();
      this.logger.log(`[PDF_Import] Task ${taskId} 开始解析`);
      const existing = await this.getTaskStatus(taskId);
      await this.persistTask(taskId, { status: 'parsing' }, { ocrProvider: provider });
      await this.updateLog(taskId, { status: 'parsing' });
      await this.reportProgress(taskId, {
        phase: 'reading',
        currentPage: 0,
        totalPages: 0,
        message: '正在读取 PDF',
      });

      const pdfResult: PdfParseResult = await this.pdfTextParser.parsePdf(fileBuffer, {
        shouldAbort: isExpired,
        onProgress: (progress) => {
          ensureAlive();
          return this.reportProgress(taskId, progress);
        },
        beforeOcr: existing?.ocrFeeDetail
          ? undefined
          : async (pages) => {
              ensureAlive();
              const precheck = await this.ocrBilling.assertAffordable(userId, pages);
              this.logger.log(
                `OCR 预检通过 user=${userId} pages=${pages} estimated_fee=¥${precheck.estimated_fee.toFixed(2)}`,
              );
            },
      });
      ensureAlive();
      const parseMode: 'text' | 'ocr' = pdfResult.source === 'ocr' ? 'ocr' : 'text';

      this.logger.log(`[PDF_Import] Task ${taskId} 文本层读取完成 mode=${parseMode} pages=${pdfResult.totalPages}`);

      const payload: Partial<StoredOcrResult> = {
        ocrProvider: provider,
        metadata: pdfResult.metadata || {},
      };

      if (parseMode === 'ocr' && pdfResult.totalPages > 0) {
        if (existing?.ocrFeeDetail) {
          payload.ocrPrecheck = existing.ocrPrecheck;
          payload.ocrEstimatedFee = existing.ocrEstimatedFee;
          payload.ocrCharsCount = existing.ocrCharsCount;
          payload.ocrFeeDetail = existing.ocrFeeDetail;
          this.logger.log(`任务 ${taskId} 已扣费，恢复解析时跳过重复计费`);
        } else {
          const totalChars = OcrBillingService.countChineseChars(pdfResult.text);
          ensureAlive();
          payload.ocrCharsCount = totalChars;
          const precheck = await this.ocrBilling.precheckCost(userId, pdfResult.totalPages);
          payload.ocrPrecheck = precheck;
          payload.ocrEstimatedFee = precheck.estimated_fee;
          payload.ocrFeeDetail = await this.ocrBilling.chargeAfterOcr(userId, {
            taskId,
            pages: pdfResult.totalPages,
            totalChars,
          });
          this.logger.log(
            `[PDF_Import] Task ${taskId} 扣费成功 fee=¥${payload.ocrFeeDetail.fee_amount.toFixed(2)}`,
          );
          await this.persistTask(
            taskId,
            { status: 'parsing', parse_mode: parseMode, total_pages: pdfResult.totalPages },
            payload,
          );
        }
      }

      const cleanedText = this.pdfTextParser.cleanPdfText(pdfResult.text);
      await this.reportProgress(taskId, {
        phase: 'extracting',
        currentPage: pdfResult.totalPages,
        totalPages: pdfResult.totalPages,
        message: '正在提取人物',
      });
      const extractedRecords = this.extractPersonInfo(cleanedText, parseMode === 'ocr');
      ensureAlive();

      await this.persistTask(
        taskId,
        {
          status: 'preview',
          parse_mode: parseMode,
          total_pages: pdfResult.totalPages,
          error_message: null,
        },
        { ...payload, records: extractedRecords, progress: {
          phase: 'done',
          currentPage: pdfResult.totalPages,
          totalPages: pdfResult.totalPages,
          message: '解析完成',
        } },
      );
      await this.persistParseResult(taskId, parseMode, pdfResult.totalPages, extractedRecords);
      this.logger.log(`[PDF_Import] Task ${taskId} 解析完成 records=${extractedRecords.length}`);
    } catch (error) {
      if (this.isParseTimeout(error)) {
        this.logger.error(`[PDF_Import] Task ${taskId} 解析失败: ${PDF_PARSE_TIMEOUT_MESSAGE}`);
        await this.markFailed(taskId, PDF_PARSE_TIMEOUT_MESSAGE);
        return;
      }
      if (isInsufficientBalance(error)) {
        await this.failForBalance(taskId, userId, error);
        return;
      }
      const errorMessage = (error as Error).message || 'PDF 解析失败';
      this.logger.error(`[PDF_Import] Task ${taskId} 解析失败: ${errorMessage}`);
      await this.markFailed(taskId, errorMessage);
    }
  }

  private isParseTimeout(error: unknown): boolean {
    return error instanceof PdfParseTimeoutError;
  }

  private async persistParseResult(
    taskId: string,
    parseMode: string,
    totalPages: number,
    records: PdfPersonRecord[],
  ): Promise<void> {
    const log = await this.prisma.pdfImportLog.findUnique({ where: { task_id: taskId } });
    if (!log) return;

    try {
      await this.prisma.pdfImportLog.update({
        where: { id: log.id },
        data: {
          parse_mode: parseMode,
          total_pages: totalPages,
          total_records: records.length,
          status: 'preview',
        },
      });

      await this.prisma.pdfParseTemp.deleteMany({ where: { import_log_id: log.id } });
      if (records.length > 0) {
        await this.prisma.pdfParseTemp.createMany({
          data: records.map((r) => ({
            import_log_id: log.id,
            row_number: r.rowNumber,
            full_name: r.fullName,
            gender: r.gender || 'UNKNOWN',
            generation: r.generation ?? null,
            birth_date: r.birthDate ? new Date(r.birthDate) : null,
            death_date: r.deathDate ? new Date(r.deathDate) : null,
            is_living: r.isLiving ?? true,
            parent_name: r.parentName ?? null,
            spouse_name: r.spouseName ?? null,
            biography: r.biography ?? null,
            burial_place: r.burialPlace ?? null,
            notes: r.notes ?? null,
            confidence_score: r.confidenceScore ?? null,
            original_text: r.originalText ?? null,
            is_corrected: false,
          })),
        });
      }
    } catch (err) {
      this.logger.warn(`解析结果持久化失败: ${(err as Error).message}`);
    }
  }

  private async persistCorrection(taskId: string, records: PdfPersonRecord[]): Promise<void> {
    const log = await this.prisma.pdfImportLog.findUnique({ where: { task_id: taskId } });
    if (!log || records.length === 0) return;

    try {
      for (const r of records) {
        await this.prisma.pdfParseTemp.updateMany({
          where: { import_log_id: log.id, row_number: r.rowNumber },
          data: {
            full_name: r.fullName,
            gender: r.gender || 'UNKNOWN',
            generation: r.generation ?? null,
            birth_date: r.birthDate ? new Date(r.birthDate) : null,
            death_date: r.deathDate ? new Date(r.deathDate) : null,
            is_living: r.isLiving ?? true,
            parent_name: r.parentName ?? null,
            spouse_name: r.spouseName ?? null,
            biography: r.biography ?? null,
            burial_place: r.burialPlace ?? null,
            notes: r.notes ?? null,
            confidence_score: r.confidenceScore ?? null,
            is_corrected: true,
          },
        });
      }
    } catch (err) {
      this.logger.warn(`校对结果持久化失败: ${(err as Error).message}`);
    }
  }

  private async markFailed(taskId: string, errorMessage: string): Promise<void> {
    await this.persistTask(taskId, { status: 'failed', error_message: errorMessage }).catch((err) => {
      this.logger.warn(`任务失败状态回写失败: ${(err as Error).message}`);
    });
    await this.updateLog(taskId, { status: 'failed', error_message: errorMessage });
  }

  private async updateLog(taskId: string, data: Record<string, unknown>): Promise<void> {
    try {
      await this.prisma.pdfImportLog.update({
        where: { task_id: taskId },
        data: data as any,
      });
    } catch (err) {
      this.logger.warn(`PdfImportLog 状态回写失败: ${(err as Error).message}`);
    }
  }

  private async reportProgress(taskId: string, progress: PdfParseProgress): Promise<void> {
    await this.persistTask(
      taskId,
      {
        status: 'parsing',
        ...(progress.phase === 'ocr'
          ? { parse_mode: 'ocr', total_pages: progress.totalPages }
          : {}),
      },
      { progress },
    );
  }

  async renderPagePreview(taskId: string, pageNumber: number): Promise<{ png: Buffer; totalPages: number }> {
    const row = await this.prisma.pdfImportTask.findUnique({ where: { id: taskId } });
    if (!row?.file_url) throw new NotFoundException('原始 PDF 不存在');
    const abs = this.resolveStoredFile(row.file_url);
    if (!fs.existsSync(abs)) throw new NotFoundException('原始 PDF 不存在');
    const buffer = await fs.promises.readFile(abs);
    return this.pdfTextParser.renderPagePng(buffer, pageNumber);
  }

  private async persistTask(
    taskId: string,
    columns: {
      status?: string;
      parse_mode?: string;
      total_pages?: number;
      error_message?: string | null;
    },
    payloadPatch?: Partial<StoredOcrResult>,
  ): Promise<void> {
    const data: Record<string, unknown> = { ...columns };
    if (payloadPatch) {
      const row = await this.prisma.pdfImportTask.findUnique({
        where: { id: taskId },
        select: { ocr_result: true },
      });
      const current = this.readPayload(row?.ocr_result);
      const next: StoredOcrResult = {
        ...current,
        ...payloadPatch,
        records: payloadPatch.records ?? current.records,
        metadata: { ...(current.metadata || {}), ...(payloadPatch.metadata || {}) },
      };
      data.ocr_result = JSON.parse(JSON.stringify(next));
    }
    await this.prisma.pdfImportTask.update({
      where: { id: taskId },
      data: data as any,
    });
  }

  private readPayload(value: unknown): StoredOcrResult {
    const raw = (value && typeof value === 'object' ? value : {}) as Partial<StoredOcrResult>;
    return {
      records: Array.isArray(raw.records) ? raw.records : [],
      metadata: raw.metadata && typeof raw.metadata === 'object' ? raw.metadata : {},
      ocrProvider: raw.ocrProvider,
      ocrEstimatedFee: raw.ocrEstimatedFee,
      ocrPrecheck: raw.ocrPrecheck,
      ocrFeeDetail: raw.ocrFeeDetail,
      ocrCharsCount: raw.ocrCharsCount,
      importResult: raw.importResult,
      progress: raw.progress,
    };
  }

  private toState(row: {
    id: string;
    clan_id: bigint;
    status: string;
    file_name: string;
    file_size: bigint;
    parse_mode: string;
    total_pages: number;
    error_message: string | null;
    ocr_result: unknown;
  }): PdfImportTaskState {
    const payload = this.readPayload(row.ocr_result);
    return {
      taskId: row.id,
      clanId: row.clan_id.toString(),
      status: row.status as PdfImportTaskState['status'],
      fileName: row.file_name,
      fileSize: Number(row.file_size),
      parseMode: row.parse_mode === 'ocr' ? 'ocr' : 'text',
      totalPages: row.total_pages,
      records: payload.records,
      metadata: payload.metadata,
      errorMessage: row.error_message ?? undefined,
      ocrProvider: payload.ocrProvider,
      ocrEstimatedFee: payload.ocrEstimatedFee,
      ocrPrecheck: payload.ocrPrecheck,
      ocrFeeDetail: payload.ocrFeeDetail,
      ocrCharsCount: payload.ocrCharsCount,
      importResult: payload.importResult,
      progress: payload.progress,
    };
  }

  private extractPersonInfo(text: string, isOcrText: boolean = false): PdfPersonRecord[] {
    return extractPersonsFromText(text, isOcrText);
  }

  private async findDuplicateNames(clanId: bigint, records: PdfPersonRecord[]): Promise<DuplicateNameHit[]> {
    const names = [...new Set(records.map((item) => item.fullName.trim()).filter(Boolean))];
    if (names.length === 0) return [];
    const existing = await this.prisma.person.findMany({
      where: { clan_id: clanId, full_name: { in: names }, deleted_at: null },
      select: { full_name: true },
    });
    const counts = new Map<string, number>();
    for (const person of existing) {
      counts.set(person.full_name, (counts.get(person.full_name) ?? 0) + 1);
    }
    return [...counts.entries()].map(([fullName, count]) => ({
      fullName,
      count,
      rowNumbers: records.filter((item) => item.fullName.trim() === fullName).map((item) => item.rowNumber),
    }));
  }

  /**
   * 同一事务写入人物、夫妻关系和亲子关系。任一步失败则整批回滚。
   */
  private async writeRecords(
    clanId: bigint,
    records: PdfPersonRecord[],
    strategy: DuplicateStrategy,
  ): Promise<PdfImportResult> {
    await this.edition.assertWritable(clanId);
    return this.prisma.$transaction(async (tx) => {
      const names = [...new Set(records.map((item) => item.fullName.trim()))];
      const existingRows = await tx.person.findMany({
        where: { clan_id: clanId, full_name: { in: names }, deleted_at: null },
        select: { id: true, full_name: true },
        orderBy: { id: 'asc' },
      });
      const existingByName = new Map<string, bigint>();
      for (const person of existingRows) {
        if (!existingByName.has(person.full_name)) existingByName.set(person.full_name, person.id);
      }

      const idByLocal = new Map<string, bigint>();
      let created = 0;
      let merged = 0;
      let skipped = 0;

      for (const record of orderByParent(records)) {
        const name = record.fullName.trim();
        const existingId = existingByName.get(name);
        if (existingId && strategy === 'skip') {
          skipped += 1;
          continue;
        }
        if (existingId && strategy === 'merge') {
          idByLocal.set(record.localId, existingId);
          merged += 1;
          continue;
        }

        const person = await tx.person.create({
          data: {
            clan_id: clanId,
            full_name: name,
            gender: record.gender === 'F' ? 'female' : 'male',
            birth_date: toDate(record.birthDate),
            death_date: toDate(record.deathDate),
            is_living: record.isLiving ?? !record.deathDate,
          },
        });
        idByLocal.set(record.localId, person.id);
        await tx.personAncestry.createMany({
          data: [{ ancestor_id: person.id, descendant_id: person.id, depth: 0 }],
          skipDuplicates: true,
        });
        if (record.biography || record.burialPlace || record.notes) {
          await tx.personBio.create({
            data: {
              person_id: person.id,
              biography: record.biography || null,
              burial_place: record.burialPlace || null,
              source_note: record.notes || null,
            },
          });
        }
        created += 1;
      }

      const paired = new Set<string>();
      for (const record of records) {
        if (!record.spouseLocalId) continue;
        const left = idByLocal.get(record.localId);
        const right = idByLocal.get(record.spouseLocalId);
        if (!left || !right || left === right) continue;
        const key = [left.toString(), right.toString()].sort().join(':');
        if (paired.has(key)) continue;
        paired.add(key);
        await this.ensureCouple(tx, clanId, left, right);
      }

      for (const record of records) {
        const childId = idByLocal.get(record.localId);
        if (!childId) continue;
        const parentIds = [record.parentLocalId, record.motherLocalId]
          .map((localId) => (localId ? idByLocal.get(localId) : undefined))
          .filter((id): id is bigint => !!id && id !== childId);
        const uniqueParents = [...new Map(parentIds.map((id) => [id.toString(), id])).values()];
        if (uniqueParents.length === 0) continue;
        await this.pedigreeService.attachChildToParents(tx, {
          clan_id: clanId,
          child_id: childId,
          parent_ids: uniqueParents,
        });
      }

      return {
        successCount: created + merged,
        failureCount: 0,
        skippedCount: skipped,
        mergedCount: merged,
        errors: [],
        anchorPersonId: pickAnchor(records, idByLocal),
      };
    }, { maxWait: 15000, timeout: 120000 });
  }

  private async ensureCouple(
    tx: Parameters<PedigreeService['attachChildToParents']>[0],
    clanId: bigint,
    leftId: bigint,
    rightId: bigint,
  ): Promise<void> {
    const existing = await tx.familyUnit.findFirst({
      where: {
        OR: [
          { husband_id: leftId, wife_id: rightId },
          { husband_id: rightId, wife_id: leftId },
        ],
      },
      select: { id: true },
    });
    if (existing) return;

    const people = await tx.person.findMany({
      where: { id: { in: [leftId, rightId] } },
      select: { id: true, gender: true },
    });
    const male = people.find((person) => person.gender === 'male');
    const female = people.find((person) => person.gender === 'female');
    const husbandId = male?.id ?? leftId;
    const wifeId = female && female.id !== husbandId ? female.id : rightId === husbandId ? leftId : rightId;
    if (husbandId === wifeId) return;
    await tx.familyUnit.create({
      data: { clan_id: clanId, husband_id: husbandId, wife_id: wifeId },
    });
  }

  private generateTaskId(): string {
    return `pdf_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private async persistOriginalFile(clanId: bigint, taskId: string, fileBuffer: Buffer): Promise<string> {
    const dir = path.join(this.uploadRoot, clanId.toString());
    await fs.promises.mkdir(dir, { recursive: true });
    const abs = path.join(dir, `${taskId}.pdf`);
    await fs.promises.writeFile(abs, fileBuffer);
    return ['uploads', 'pdf-import', clanId.toString(), `${taskId}.pdf`].join('/');
  }

  private resolveStoredFile(fileUrl: string): string {
    const rel = fileUrl.replace(/\\/g, '/').replace(/^\/+/, '');
    if (!rel.startsWith('uploads/pdf-import/')) {
      throw new BadRequestException('非法文件路径');
    }
    const abs = path.resolve(process.cwd(), ...rel.split('/'));
    const relative = path.relative(this.uploadRoot, abs);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new BadRequestException('非法文件路径');
    }
    return abs;
  }

  private async removeStoredFile(fileUrl: string): Promise<void> {
    try {
      await fs.promises.unlink(this.resolveStoredFile(fileUrl));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        this.logger.warn(`[PDF_Import] 删除未完成上传的临时文件失败: ${(error as Error).message}`);
      }
    }
  }

  private async uploadOriginalPdfToCos(
    taskId: string,
    fileBuffer: Buffer,
    _userId: string,
    clanId: bigint,
  ): Promise<void> {
    const uuid = require('uuid').v4().replace(/-/g, '');
    const key = `scan/pdf/${clanId}/${uuid}.pdf`;
    await this.cosService.uploadFile(key, fileBuffer, {
      contentType: 'application/pdf',
      bucketType: 'cold',
    });
    this.logger.log(`原始 PDF 已上传至 COS 冷 Bucket: ${key} (task=${taskId})`);
  }
}

function rebindRelations(records: PdfPersonRecord[]): PdfPersonRecord[] {
  records.forEach((record, index) => {
    record.fullName = record.fullName?.trim() ?? '';
    if (!record.localId) record.localId = `p${record.rowNumber || index + 1}`;
    if (record.fullName.includes('氏')) record.gender = 'F';
  });
  const byId = new Map(records.map((record) => [record.localId, record]));
  const byName = new Map<string, PdfPersonRecord>();
  for (const record of records) {
    if (record.fullName && !byName.has(record.fullName)) byName.set(record.fullName, record);
  }

  const resolve = (
    record: PdfPersonRecord,
    name: string | undefined,
    localId: string | undefined,
  ): string | undefined => {
    const trimmed = name?.trim() ?? '';
    if (name !== undefined && !trimmed) return undefined;
    const linked = localId ? byId.get(localId) : undefined;
    if (linked && (!trimmed || linked.fullName === trimmed)) return linked.localId;
    const named = name?.trim() ? byName.get(name.trim()) : undefined;
    if (named && named.localId !== record.localId) return named.localId;
    return undefined;
  };

  for (const record of records) {
    record.parentLocalId = resolve(record, record.parentName, record.parentLocalId);
    record.parentName = record.parentLocalId ? byId.get(record.parentLocalId)?.fullName : record.parentName;
    record.motherLocalId = resolve(record, record.motherName, record.motherLocalId);
    record.motherName = record.motherLocalId ? byId.get(record.motherLocalId)?.fullName : record.motherName;
    record.spouseLocalId = resolve(record, record.spouseName, record.spouseLocalId);
    record.spouseName = record.spouseLocalId ? byId.get(record.spouseLocalId)?.fullName : record.spouseName;
  }
  return records;
}

function orderByParent(records: PdfPersonRecord[]): PdfPersonRecord[] {
  const byId = new Map(records.map((record) => [record.localId, record]));
  const ordered: PdfPersonRecord[] = [];
  const seen = new Set<string>();
  const visit = (record?: PdfPersonRecord) => {
    if (!record || seen.has(record.localId)) return;
    seen.add(record.localId);
    if (record.parentLocalId) visit(byId.get(record.parentLocalId));
    if (record.motherLocalId) visit(byId.get(record.motherLocalId));
    ordered.push(record);
  };
  records.forEach((record) => visit(record));
  return ordered;
}

function pickAnchor(records: PdfPersonRecord[], idByLocal: Map<string, bigint>): string | undefined {
  const ranked = records
    .filter((record) => !record.parentLocalId && !record.motherLocalId && idByLocal.has(record.localId))
    .sort((left, right) => {
      const generation = (left.generation ?? 999) - (right.generation ?? 999);
      if (generation !== 0) return generation;
      if ((left.gender === 'M') !== (right.gender === 'M')) return left.gender === 'M' ? -1 : 1;
      return left.rowNumber - right.rowNumber;
    });
  const id = ranked[0] ? idByLocal.get(ranked[0].localId) : undefined;
  return id?.toString();
}

function toDate(value?: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
