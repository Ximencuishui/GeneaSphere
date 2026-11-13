import { BadRequestException, HttpException, Injectable, Logger } from '@nestjs/common';
import { PDFParse, TextResult } from 'pdf-parse';
import { OcrService } from './ocr.service';
import { toImportFileError } from './pdf-file-error';
import { PdfParseTimeoutError } from './pdf-parse-timeout';

export interface PdfParseProgress {
  phase: 'reading' | 'ocr' | 'extracting' | 'done';
  currentPage: number;
  totalPages: number;
  message: string;
}

export interface PdfParseHooks {
  onProgress?: (progress: PdfParseProgress) => void | Promise<void>;
  /** 决定走 OCR 之后、渲染页面和识别之前调用。余额不足时在这里中止。 */
  beforeOcr?: (totalPages: number) => void | Promise<void>;
  /** 解析超过时限后返回 true，调用方应停止继续渲染和识别。 */
  shouldAbort?: () => boolean;
}

export interface PdfAssessment {
  text: string;
  totalPages: number;
  needsOcr: boolean;
  metadata: PdfParseResult['metadata'];
}

export interface PdfParseResult {
  text: string;
  totalPages: number;
  source: 'text' | 'ocr';
  metadata: {
    title?: string;
    author?: string;
    creator?: string;
    producer?: string;
    creationDate?: string;
  };
}

@Injectable()
export class PdfTextParserService {
  private readonly logger = new Logger(PdfTextParserService.name);
  private readonly MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
  private readonly OCR_TEXT_THRESHOLD = 100; // 每页至少100字符才认为是文本型PDF
  private readonly MIN_TEXT_LENGTH = 200; // 少于这个字符数才考虑OCR（避免页码标记触发OCR）
  private readonly OCR_RATIO = 0.5; // 实际文本/预期文本的比率，低于此值触发OCR

  constructor(private readonly ocrService: OcrService) {}

  /**
   * 解析PDF文件，提取文本内容
   * @param fileBuffer PDF文件Buffer
   * @returns 解析结果，包含文本和元数据
   */
  /**
   * 只抽取文字层并判断要不要 OCR，不渲染页面、不调用识别引擎。
   */
  async assessPdf(fileBuffer: Buffer): Promise<PdfAssessment> {
    if (fileBuffer.length > this.MAX_FILE_SIZE) {
      throw new BadRequestException(
        `文件大小超过限制（最大50MB），当前大小：${(fileBuffer.length / 1024 / 1024).toFixed(2)}MB`,
      );
    }

    try {
      const pdfDoc = new PDFParse({ data: fileBuffer });
      const textResult: TextResult = await pdfDoc.getText();
      const extractedText = textResult.text || '';
      const totalPages = textResult.total || 0;
      const textLength = extractedText.trim().length;
      const cjkCount = (extractedText.match(/[\u4e00-\u9fff]/g) ?? []).length;
      const expectedMinLength = totalPages * this.OCR_TEXT_THRESHOLD;
      // 正文里已经有汉字时直接用提取结果。短页族谱不够 200 字，不能因此改走 OCR。
      const needsOcr =
        totalPages > 0 &&
        cjkCount < 8 &&
        (textLength < this.MIN_TEXT_LENGTH || textLength < expectedMinLength * this.OCR_RATIO);
      this.logger.log(
        `PDF 预检 页数=${totalPages} 文本=${extractedText.length}字 需要OCR=${needsOcr}`,
      );
      return {
        text: extractedText,
        totalPages,
        needsOcr,
        metadata: needsOcr ? {} : await this.extractMetadata(pdfDoc),
      };
    } catch (error) {
      if (error instanceof PdfParseTimeoutError || error instanceof BadRequestException || error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`PDF解析失败: ${error.message}`, error.stack);
      throw toImportFileError(error);
    }
  }

  async parsePdf(fileBuffer: Buffer, hooks?: PdfParseHooks): Promise<PdfParseResult> {
    const assessment = await this.assessPdf(fileBuffer);
    if (!assessment.needsOcr) {
      return {
        text: assessment.text,
        totalPages: assessment.totalPages,
        source: 'text',
        metadata: assessment.metadata,
      };
    }

    if (hooks?.shouldAbort?.()) throw new PdfParseTimeoutError();
    await hooks?.beforeOcr?.(assessment.totalPages);
    if (hooks?.shouldAbort?.()) throw new PdfParseTimeoutError();
    const recognized = await this.parsePdfWithOcr(fileBuffer, assessment.totalPages, hooks);
    return { ...recognized, source: 'ocr' };
  }

  /**
   * 使用OCR识别PDF（处理扫描版PDF）
   * @param fileBuffer PDF文件Buffer
   * @param totalPages 总页数
   * @returns OCR识别结果
   */
  private async parsePdfWithOcr(
    fileBuffer: Buffer,
    totalPages: number,
    hooks?: PdfParseHooks,
  ): Promise<PdfParseResult> {
    try {
      this.logger.log(`开始OCR识别PDF，共${totalPages}页...`);

      // 将PDF每页转为图片
      const pageImages = await this.convertPdfToImages(fileBuffer, totalPages, hooks);
      await hooks?.onProgress?.({
        phase: 'ocr',
        currentPage: 0,
        totalPages: pageImages.length,
        message: `准备识别，共 ${pageImages.length} 页`,
      });

      let fullText = '';
      let totalConfidence = 0;

      for (let i = 0; i < pageImages.length; i++) {
        if (hooks?.shouldAbort?.()) throw new PdfParseTimeoutError();
        const pageNo = i + 1;
        await hooks?.onProgress?.({
          phase: 'ocr',
          currentPage: pageNo,
          totalPages: pageImages.length,
          message: `正在识别第 ${pageNo}/${pageImages.length} 页`,
        });
        this.logger.log(`OCR识别第${pageNo}/${pageImages.length}页...`);
        const ocrResult = await this.ocrService.recognizeImage(pageImages[i]);
        fullText += `@@PAGE:${pageNo}@@\n${ocrResult.text}\n`;
        totalConfidence += ocrResult.confidence;
        
        this.logger.debug(
          `第${i + 1}页识别完成: ${ocrResult.text.length}字符, 置信度${ocrResult.confidence.toFixed(1)}%`
        );
      }
      
      const avgConfidence = totalConfidence / pageImages.length;
      this.logger.log(
        `OCR识别完成: 总文本${fullText.length}字符, 平均置信度${avgConfidence.toFixed(1)}%`
      );
      
      // 返回结果
      return {
        text: fullText,
        totalPages,
        source: 'ocr',
        metadata: {
          title: 'OCR识别结果',
          creator: 'Tesseract.js OCR',
          producer: `平均置信度: ${avgConfidence.toFixed(1)}%`,
        },
      };
    } catch (error) {
      if (error instanceof PdfParseTimeoutError || error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(`OCR识别失败: ${error.message}`, error.stack);
      throw toImportFileError(error);
    }
  }

  /**
   * 将PDF转换为图片数组
   * 使用pdfjs-dist + canvas（纯JavaScript实现）
   * @param fileBuffer PDF文件Buffer
   * @param totalPages 总页数
   * @returns 图片Buffer数组
   */
  private async convertPdfToImages(
    fileBuffer: Buffer,
    totalPages: number,
    hooks?: PdfParseHooks,
  ): Promise<Buffer[]> {
    try {
      // 动态导入pdfjs-dist（ESM模块需要动态导入）
      const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
      
      // 配置worker（使用file:// URL加载worker文件）
      const path = await import('path');
      const workerPath = path.resolve(
        __dirname,
        '../../../node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs'
      );
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'file:///' + workerPath.replace(/\\/g, '/');
      
      // 加载PDF文档
      const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(fileBuffer),
        useSystemFonts: true,
      });
      const pdf = await loadingTask.promise;
      
      const actualPages = pdf.numPages;
      this.logger.log(`PDF加载成功: ${actualPages}页`);
      
      // 动态导入canvas（使用@napi-rs/canvas代替canvas）
      const canvasModule = await import('@napi-rs/canvas');
      const { createCanvas } = canvasModule;
      
      // 设置全局Image和DOMMatrix供pdfjs-dist的render引擎使用
      globalThis.Image = canvasModule.Image as any;
      globalThis.DOMMatrix = canvasModule.DOMMatrix as any;
      
      const images: Buffer[] = [];
      
      // 逐页渲染
      for (let pageNum = 1; pageNum <= actualPages; pageNum++) {
        if (hooks?.shouldAbort?.()) throw new PdfParseTimeoutError();
        try {
          const page = await pdf.getPage(pageNum);
          
          // 3倍分辨率提高OCR识别率
          const scale = 3.0;
          const viewport = page.getViewport({ scale });
          
          // 创建canvas
          const canvas = createCanvas(viewport.width, viewport.height);
          const context = canvas.getContext('2d');
          
          // 白色背景（PDF可能有透明背景）
          context.fillStyle = '#FFFFFF';
          context.fillRect(0, 0, viewport.width, viewport.height);
          
          // 渲染PDF页面到canvas
          const renderContext: any = {
            canvasContext: context,
            viewport,
            background: '#FFFFFF',
          };
          
          await page.render(renderContext).promise;
          
          // 转为PNG Buffer
          const imageBuffer = canvas.toBuffer('image/png');
          images.push(imageBuffer);
          
          this.logger.debug(
            `第${pageNum}页转图片完成: ${(imageBuffer.length / 1024).toFixed(0)}KB`
          );
        } catch (pageError) {
          this.logger.warn(`第${pageNum}页转图片失败: ${pageError.message}`);
          // 继续处理下一页
        }
      }
      
      if (images.length === 0) {
        throw new Error('未能转换任何PDF页面为图片');
      }
      
      this.logger.log(`PDF转图片完成: ${images.length}/${actualPages}页`);
      return images;
    } catch (error) {
      if (error instanceof PdfParseTimeoutError || error instanceof BadRequestException) throw error;
      this.logger.error(`PDF转图片失败: ${error.message}`);
      throw toImportFileError(error);
    }
  }

  /**
   * 检测PDF类型（文本型/扫描型）
   * @param fileBuffer PDF文件Buffer
   * @returns PDF类型
   */
  async detectPdfType(fileBuffer: Buffer): Promise<'text' | 'scan' | 'mixed'> {
    try {
      const pdfDoc = new PDFParse({ data: fileBuffer });
      const textResult: TextResult = await pdfDoc.getText();

      // 简单启发式检测：如果提取的文本很少，可能是扫描版
      const textLength = textResult.text?.trim().length || 0;
      const expectedMinLength = textResult.total * 50; // 假设每页至少50个字符

      if (textLength === 0) {
        return 'scan';
      } else if (textLength < expectedMinLength * 0.3) {
        return 'mixed'; // 部分扫描
      } else {
        return 'text';
      }
    } catch (error) {
      this.logger.error(`PDF类型检测失败: ${error.message}`);
      return 'scan'; // 默认为扫描版，需要OCR
    }
  }

  /**
   * 提取PDF元数据
   * @param pdfDoc PDFParse实例
   * @returns 标准化元数据
   */
  private async extractMetadata(pdfDoc: PDFParse): Promise<PdfParseResult['metadata']> {
    try {
      const infoResult = await pdfDoc.getInfo();
      const metadata: PdfParseResult['metadata'] = {};

      if (infoResult.info) {
        if (infoResult.info.Title) metadata.title = infoResult.info.Title;
        if (infoResult.info.Author) metadata.author = infoResult.info.Author;
        if (infoResult.info.Creator) metadata.creator = infoResult.info.Creator;
        if (infoResult.info.Producer) metadata.producer = infoResult.info.Producer;
        if (infoResult.info.CreationDate) metadata.creationDate = infoResult.info.CreationDate;
      }

      return metadata;
    } catch (error) {
      this.logger.warn(`提取PDF元数据失败: ${error.message}`);
      return {};
    }
  }

  /**
   * 将PDF文本按页分割
   * @param text PDF完整文本
   * @param totalPages 总页数
   * @returns 按页分割的文本数组
   */
  splitTextByPages(text: string, totalPages: number): string[] {
    if (!text) return [];
    // pdf-parse不会自动提供每页的文本，这里使用简单策略
    // 尝试通过分页符（\f）分割
    const pages = text.split(/\f/);

    // 如果分割结果不对，尝试平均分配
    if (pages.length !== totalPages && pages.length > 1) {
      this.logger.warn(
        `PDF分页异常：期望${totalPages}页，实际分割出${pages.length}部分`
      );
    }

    return pages.map((page) => page.trim()).filter((page) => page.length > 0);
  }

  /**
   * 清理PDF文本（移除多余空白、特殊字符等）
   * @param text 原始文本
   * @returns 清理后的文本
   */
  cleanPdfText(text: string): string {
    if (!text) return '';
    return text
      .replace(/\r\n/g, '\n') // 统一换行符
      .replace(/[ \t]+/g, ' ') // 合并多个空格/制表符
      .replace(/\n{3,}/g, '\n\n') // 合并多个空行
      .trim();
  }

  /** 把指定页渲成预览图。校对页只在扫描件上使用。 */
  async renderPagePng(fileBuffer: Buffer, pageNumber: number): Promise<{ png: Buffer; totalPages: number }> {
    if (pageNumber < 1) throw new BadRequestException('页码不正确');
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const path = await import('path');
    const workerPath = path.resolve(__dirname, '../../../node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs');
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'file:///' + workerPath.replace(/\\/g, '/');
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(fileBuffer), useSystemFonts: true }).promise;
    if (pageNumber > pdf.numPages) throw new BadRequestException('页码超出文档范围');
    const canvasModule = await import('@napi-rs/canvas');
    globalThis.Image = canvasModule.Image as any;
    globalThis.DOMMatrix = canvasModule.DOMMatrix as any;
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.2 });
    const canvas = canvasModule.createCanvas(viewport.width, viewport.height);
    const context = canvas.getContext('2d');
    context.fillStyle = '#FFFFFF';
    context.fillRect(0, 0, viewport.width, viewport.height);
    await page.render({ canvasContext: context, viewport, background: '#FFFFFF' } as any).promise;
    return { png: canvas.toBuffer('image/png'), totalPages: pdf.numPages };
  }
}
