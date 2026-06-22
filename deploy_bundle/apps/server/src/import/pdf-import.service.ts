import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '@geneasphere/db';
import { PdfTextParserService, PdfParseResult } from './pdf-text-parser.service';
import { OcrService } from './ocr.service';
import { CosService } from '../cos/cos.service';
import { ImageProcessorService } from '../cos/image-processor.service';
import {
  OcrBillingService,
  OcrFeeDetail,
  OcrPrecheckResult,
} from './ocr-billing.service';

export interface PdfImportTask {
  taskId: string;
  status: 'pending' | 'parsing' | 'preview' | 'correcting' | 'importing' | 'completed' | 'failed';
  fileName: string;
  fileSize: number;
  parseMode: 'text' | 'ocr';
  totalPages: number;
  extractedRecords: PdfPersonRecord[];
  metadata: Record<string, any>;
  errorMessage?: string;
  // ========== OCR 计费相关字段 ==========
  ocrProvider?: string;
  ocrEstimatedFee?: number;
  ocrPrecheck?: OcrPrecheckResult;
  ocrFeeDetail?: OcrFeeDetail;
  ocrCharsCount?: number;
}

export interface PdfPersonRecord {
  rowNumber: number;
  fullName: string;
  gender?: 'M' | 'F' | 'UNKNOWN';
  generation?: number;
  birthDate?: string;
  deathDate?: string;
  isLiving?: boolean;
  parentName?: string;
  spouseName?: string;
  biography?: string;
  burialPlace?: string;
  notes?: string;
  confidenceScore: number;
  originalText?: string;
}

@Injectable()
export class PdfImportService {
  private readonly logger = new Logger(PdfImportService.name);
  private importTasks = new Map<string, PdfImportTask>();

  constructor(
    private readonly pdfTextParser: PdfTextParserService,
    private readonly prisma: PrismaService,
    private readonly ocrService: OcrService,
    private readonly ocrBilling: OcrBillingService,
    private readonly cosService: CosService,
    private readonly imageProcessor: ImageProcessorService,
  ) {}

  /**
   * 创建PDF导入任务
   * @param userId 用户ID
   * @param clanId 家族ID
   * @param fileBuffer PDF文件Buffer
   * @param fileName 文件名
   * @returns 任务ID
   */
  async createImportTask(
    userId: string,
    clanId: bigint,
    fileBuffer: Buffer,
    fileName: string
  ): Promise<string> {
    const taskId = this.generateTaskId();
    const fileSize = fileBuffer.length;

    this.logger.log(`创建PDF导入任务: ${taskId}, 文件: ${fileName}`);

    // 创建任务记录
    const task: PdfImportTask = {
      taskId,
      status: 'pending',
      fileName,
      fileSize,
      parseMode: 'text',
      totalPages: 0,
      extractedRecords: [],
      metadata: {},
    };

    this.importTasks.set(taskId, task);

    // COS 模式：异步上传原始 PDF 到冷 Bucket
    if (this.cosService.getDriverType() === 'cos' || process.env.COS_ENABLED === 'true') {
      this.uploadOriginalPdfToCos(taskId, fileBuffer, userId, clanId).catch((err) => {
        this.logger.warn(`原始 PDF 上传 COS 失败（非关键路径）: ${err.message}`);
      });
    }

    // 异步开始解析
    this.parsePdfAsync(taskId, fileBuffer, userId, clanId);

    return taskId;
  }

  /**
   * 获取任务状态
   * @param taskId 任务ID
   * @returns 任务信息
   */
  getTaskStatus(taskId: string): PdfImportTask | undefined {
    return this.importTasks.get(taskId);
  }

  /**
   * 获取任务预览数据
   * @param taskId 任务ID
   * @returns 提取的人员记录
   */
  getTaskPreview(taskId: string): PdfPersonRecord[] | undefined {
    const task = this.importTasks.get(taskId);
    return task?.status === 'preview' || task?.status === 'correcting'
      ? task.extractedRecords
      : undefined;
  }

  /**
   * 更新校对后的数据
   * @param taskId 任务ID
   * @param correctedRecords 校正后的记录
   */
  updateCorrectedRecords(taskId: string, correctedRecords: PdfPersonRecord[]): void {
    const task = this.importTasks.get(taskId);
    if (task) {
      task.extractedRecords = correctedRecords;
      task.status = 'correcting';
      this.logger.log(`任务 ${taskId} 已更新校对记录，共 ${correctedRecords.length} 条`);
    }
  }

  /**
   * 执行导入
   * @param taskId 任务ID
   * @param userId 用户ID
   * @param clanId 家族ID
   * @returns 导入结果
   */
  async executeImport(
    taskId: string,
    userId: string,
    clanId: bigint
  ): Promise<{ successCount: number; failureCount: number; errors: string[] }> {
    const task = this.importTasks.get(taskId);
    if (!task) {
      throw new Error('任务不存在');
    }

    if (task.status !== 'correcting' && task.status !== 'preview') {
      throw new Error('任务状态不正确，请先完成解析和校对');
    }

    task.status = 'importing';
    const errors: string[] = [];
    let successCount = 0;
    let failureCount = 0;

    try {
      // 批量导入人员数据
      for (const record of task.extractedRecords) {
        try {
          await this.importPersonRecord(record, clanId);
          successCount++;
        } catch (error) {
          failureCount++;
          errors.push(`第${record.rowNumber}行导入失败: ${error.message}`);
          this.logger.error(`导入记录失败 (行${record.rowNumber}): ${error.message}`);
        }
      }

      task.status = 'completed';
      this.logger.log(
        `任务 ${taskId} 导入完成: 成功 ${successCount} 条, 失败 ${failureCount} 条`
      );

      return { successCount, failureCount, errors };
    } catch (error) {
      task.status = 'failed';
      task.errorMessage = error.message;
      throw error;
    }
  }

  /**
   * 异步解析PDF
   */
  private async parsePdfAsync(
    taskId: string,
    fileBuffer: Buffer,
    userId: string,
    clanId: bigint
  ): Promise<void> {
    const task = this.importTasks.get(taskId);
    if (!task) return;

    try {
      task.status = 'parsing';
      task.ocrProvider = this.ocrService.getProviderName();

      // 解析PDF文本（如需 OCR，pdfTextParser 内部自动调用）
      const pdfResult: PdfParseResult = await this.pdfTextParser.parsePdf(fileBuffer);
      task.totalPages = pdfResult.totalPages;
      task.metadata = pdfResult.metadata;

      // 检测PDF类型
      const pdfType = await this.pdfTextParser.detectPdfType(fileBuffer);
      task.parseMode = pdfType === 'scan' ? 'ocr' : 'text';

      this.logger.log(`PDF类型: ${pdfType}, 页数: ${pdfResult.totalPages}`);

      // ========== OCR 计费集成（扫描件 PDF 才走）==========
      if (task.parseMode === 'ocr' && task.totalPages > 0) {
        const precheck = await this.ocrBilling.precheckCost(
          userId,
          task.totalPages,
        );
        task.ocrPrecheck = precheck;
        task.ocrEstimatedFee = precheck.estimated_fee;
        this.logger.log(
          `OCR 预检 user=${userId} pages=${task.totalPages} ` +
            `estimated_fee=¥${precheck.estimated_fee.toFixed(2)} ` +
            `sufficient=${precheck.sufficient}`,
        );

        // 统计本次识别的中文字数
        const totalChars = OcrBillingService.countChineseChars(pdfResult.text);
        task.ocrCharsCount = totalChars;

        // 精确扣费（事务：余额检查 + 扣费 + 写日志）
        try {
          const feeDetail = await this.ocrBilling.chargeAfterOcr(userId, {
            taskId,
            pages: task.totalPages,
            totalChars,
          });
          task.ocrFeeDetail = feeDetail;
        } catch (error) {
          if (error instanceof HttpException) {
            task.status = 'failed';
            const resp = error.getResponse() as any;
            task.errorMessage =
              resp?.message || 'OCR 计费失败，余额不足';
            task.metadata.ocrBillingError = {
              error: resp?.error || 'INSUFFICIENT_BALANCE',
              required: resp?.required,
              current: resp?.current,
            };
            await this.ocrBilling.recordFailure(
              userId,
              taskId,
              task.errorMessage,
            );
            this.logger.error(
              `任务 ${taskId} OCR 计费失败：${task.errorMessage}`,
            );
            return;
          }
          throw error;
        }
      }

      // 清理文本
      const cleanedText = this.pdfTextParser.cleanPdfText(pdfResult.text);

      // 提取人员信息（传入是否为OCR模式）
      const isOcrText = task.parseMode === 'ocr';
      const extractedRecords = this.extractPersonInfo(cleanedText, isOcrText);
      task.extractedRecords = extractedRecords;

      task.status = 'preview';
      this.logger.log(
        `任务 ${taskId} 解析完成, 提取 ${extractedRecords.length} 条人员记录`
      );
    } catch (error) {
      task.status = 'failed';
      task.errorMessage = error.message;
      this.logger.error(`任务 ${taskId} 解析失败: ${error.message}`);
    }
  }

  /**
   * 从PDF文本中提取人员信息（NLP规则引擎）
   * @param text PDF文本内容
   * @param isOcrText 是否为OCR识别文本
   * @returns 提取的人员记录
   */
  private extractPersonInfo(text: string, isOcrText: boolean = false): PdfPersonRecord[] {
    if (!text) return [];
    const records: PdfPersonRecord[] = [];
    const lines = text.split('\n').filter((line) => line.trim().length > 0);

    let rowNumber = 0;
    // OCR识别的文本降低基础置信度
    const baseConfidence = isOcrText ? 40 : 50;

    for (const line of lines) {
      const record = this.parseLine(line, ++rowNumber, baseConfidence);
      if (record) {
        records.push(record);
      }
    }

    return records;
  }

  /**
   * 解析单行文本，尝试提取人员信息
   * @param line 文本行
   * @param rowNumber 行号
   * @param baseConfidence 基础置信度
   * @returns 人员记录或null
   */
  private parseLine(line: string, rowNumber: number, baseConfidence: number = 50): PdfPersonRecord | null {
    const trimmedLine = line.trim();

    // 尝试匹配常见族谱格式
    // 格式1: "姓名，男/女，生卒年月"
    // 格式2: "第X世 姓名"
    // 格式3: "姓名，字XX，号XX"

    // 提取姓名（中文姓名，2-4个字符）
    const nameMatch = trimmedLine.match(/([\u4e00-\u9fa5]{2,4})/);
    if (!nameMatch) {
      return null; // 没有中文姓名，跳过
    }

    const fullName = nameMatch[1];
    let confidence = baseConfidence; // 使用传入的基础置信度

    // 提取性别
    let gender: 'M' | 'F' | 'UNKNOWN' = 'UNKNOWN';
    if (trimmedLine.includes('男') || trimmedLine.includes('公') || trimmedLine.includes('氏')) {
      gender = 'M';
      confidence += 15;
    } else if (trimmedLine.includes('女') || trimmedLine.includes('夫人') || trimmedLine.includes('孺人')) {
      gender = 'F';
      confidence += 15;
    }

    // 提取辈分
    let generation: number | undefined;
    const generationMatch = trimmedLine.match(/第([一二三四五六七八九十百千万\d]+)世/);
    if (generationMatch) {
      generation = this.parseGeneration(generationMatch[1]);
      confidence += 15;
    }

    // 提取日期（简化的日期匹配）
    const birthDate = this.extractDate(trimmedLine, ['生', '生于', '诞']);
    const deathDate = this.extractDate(trimmedLine, ['卒', '殁', '逝世', '终']);

    if (birthDate) confidence += 10;
    if (deathDate) confidence += 10;

    // 构建记录
    const record: PdfPersonRecord = {
      rowNumber,
      fullName,
      gender,
      generation,
      birthDate,
      deathDate,
      isLiving: !deathDate,
      confidenceScore: Math.min(confidence, 100),
      originalText: trimmedLine.substring(0, 200),
    };

    return record;
  }

  /**
   * 解析辈分数字
   * @param genStr 辈分字符串
   * @returns 数字
   */
  private parseGeneration(genStr: string): number {
    const chineseNumbers: Record<string, number> = {
      '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
      '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
      '百': 100, '千': 1000, '万': 10000
    };

    // 如果是阿拉伯数字
    if (/^\d+$/.test(genStr)) {
      return parseInt(genStr, 10);
    }

    // 如果是中文数字
    return chineseNumbers[genStr] || 0;
  }

  /**
   * 从文本中提取日期
   * @param text 文本
   * @param keywords 日期关键词
   * @returns 日期字符串或null
   */
  private extractDate(text: string, keywords: string[]): string | null {
    for (const keyword of keywords) {
      const index = text.indexOf(keyword);
      if (index === -1) continue;

      // 在关键词后查找日期
      const afterKeyword = text.substring(index + keyword.length);

      // 匹配公历日期格式：YYYY-MM-DD 或 YYYY年MM月DD日
      const dateMatch = afterKeyword.match(/(\d{4})[-年](\d{1,2})[-月](\d{1,2})[日]?/);
      if (dateMatch) {
        const year = parseInt(dateMatch[1], 10);
        const month = parseInt(dateMatch[2], 10).toString().padStart(2, '0');
        const day = parseInt(dateMatch[3], 10).toString().padStart(2, '0');
        return `${year}-${month}-${day}`;
      }

      // 匹配年份：YYYY年
      const yearMatch = afterKeyword.match(/(\d{4})年/);
      if (yearMatch) {
        return `${yearMatch[1]}-01-01`;
      }
    }

    return null;
  }

  /**
   * 导入单条人员记录到数据库
   * @param record 人员记录
   * @param clanId 家族ID
   */
  private async importPersonRecord(record: PdfPersonRecord, clanId: bigint): Promise<void> {
    await this.prisma.person.create({
      data: {
        clan_id: clanId,
        full_name: record.fullName,
        gender: record.gender === 'M' ? 'male' : record.gender === 'F' ? 'female' : 'male', // 默认为male
        birth_date: record.birthDate ? new Date(record.birthDate) : null,
        death_date: record.deathDate ? new Date(record.deathDate) : null,
        is_living: record.isLiving ?? true,
      },
    });
  }

  /**
   * 生成唯一任务ID
   * @returns 任务ID
   */
  private generateTaskId(): string {
    return `pdf_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * 上传原始 PDF 到 COS 冷 Bucket
   */
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
