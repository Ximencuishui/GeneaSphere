import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { createWorker, WorkerOptions } from 'tesseract.js';
import * as path from 'path';
import * as fs from 'fs';
import { TencentOcrService } from './tencent-ocr.service';

export type OcrProviderName = 'tencent' | 'tesseract';

export interface OcrProgress {
  status: string;
  progress: number;
  message: string;
}

export interface OcrResult {
  text: string;
  confidence: number;
  lines: Array<{
    text: string;
    confidence: number;
    bbox: { x0: number; y0: number; x1: number; y1: number };
  }>;
  pageIndex?: number;
}

/**
 * OCR 服务统一入口
 * - 根据环境变量自动选择 Provider：tencent > tesseract
 * - OCR_PROVIDER=tencent 强制使用腾讯云（未配置则抛错）
 * - OCR_PROVIDER=tesseract 强制使用本地
 * - OCR_PROVIDER=auto（默认）：腾讯云已配置则使用，否则 Tesseract
 */
@Injectable()
export class OcrService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OcrService.name);
  private provider: OcrProviderName = 'tesseract';
  private tesseractWorker: any = null;
  private tesseractReady = false;
  private readonly LANGUAGES = 'chi_sim+eng';

  private readonly TESSDATA_PATH: string = (() => {
    if (process.env.TESSDATA_PREFIX && fs.existsSync(process.env.TESSDATA_PREFIX)) {
      return process.env.TESSDATA_PREFIX;
    }
    const localPath = path.resolve(__dirname, '../../assets/tessdata');
    if (fs.existsSync(localPath)) {
      return localPath;
    }
    return path.resolve(process.cwd(), 'tessdata');
  })();

  constructor(private readonly tencentOcr: TencentOcrService) {}

  async onModuleInit() {
    // 不在这里立即执行 selectProvider，而是等待 TencentOcrService 完成初始化
    // NestJS 的 onModuleInit 执行顺序不保证，因此延迟 1 秒后重试
    await this.selectProviderWithRetry();
    if (this.provider === 'tesseract') {
      try {
        await this.initTesseract();
      } catch (error: any) {
        this.logger.error(`Tesseract 初始化失败：${error.message}`);
      }
    }
  }

  async onModuleDestroy() {
    await this.terminateTesseract();
  }

  /**
   * 决定使用哪个 OCR 引擎（带重试，解决 NestJS onModuleInit 执行顺序问题）
   * TencentOcrService.onModuleInit() 可能在此之后执行，因此等待并重试
   */
  private async selectProviderWithRetry(): Promise<void> {
    const setting = (process.env.OCR_PROVIDER || 'auto').toLowerCase();

    // 非 tencent 模式不需要等待腾讯云初始化
    if (setting === 'tesseract') {
      this.provider = 'tesseract';
      this.logger.log('OCR 引擎：Tesseract.js（强制配置）');
      return;
    }

    // tencent 或 auto 模式：等待 TencentOcrService 初始化完成（最多等 5 秒）
    const maxRetries = 10;
    const retryDelay = 500; // ms

    for (let i = 0; i < maxRetries; i++) {
      if (this.tencentOcr.isReady()) {
        this.provider = 'tencent';
        this.logger.log(`OCR 引擎：腾讯云（${setting === 'tencent' ? '强制配置' : '自动选择'}）`);
        return;
      }
      if (i < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }
    }

    // 超时：tencent 强制模式抛错，auto 模式降级
    if (setting === 'tencent') {
      throw new Error(
        'OCR_PROVIDER=tencent 但腾讯云密钥未配置或 SDK 加载失败（等待 5s 超时）',
      );
    }
    // auto 模式降级
    this.provider = 'tesseract';
    this.logger.warn(
      'OCR 引擎：Tesseract.js（腾讯云未配置，已自动降级）',
    );
  }

  /**
   * 当前 Provider 名称
   */
  getProviderName(): OcrProviderName {
    return this.provider;
  }

  /**
   * 初始化 Tesseract worker
   */
  private async initTesseract(): Promise<void> {
    if (this.tesseractReady) return;
    this.logger.log(`正在初始化 Tesseract.js，语言包：${this.LANGUAGES}`);
    const langFiles = this.LANGUAGES.split('+');
    for (const lang of langFiles) {
      const langFilePath = `${this.TESSDATA_PATH}/${lang}.traineddata`
        .replace(/^file:\/\/\//, '')
        .replace(/\//g, path.sep);
      if (fs.existsSync(langFilePath)) {
        const stats = fs.statSync(langFilePath);
        this.logger.log(
          `${lang}.traineddata: ${(stats.size / 1024 / 1024).toFixed(2)}MB`,
        );
      } else {
        this.logger.warn(`${lang}.traineddata 未找到：${langFilePath}`);
      }
    }
    this.tesseractWorker = await createWorker(this.LANGUAGES, 1, {
      langPath: this.TESSDATA_PATH,
      logger: (m: any) => {
        if (m.status === 'recognizing text') {
          this.logger.debug(
            `Tesseract 识别进度：${(m.progress * 100).toFixed(0)}%`,
          );
        }
      },
    } as WorkerOptions);
    this.tesseractReady = true;
    this.logger.log('Tesseract 初始化成功');
  }

  private async terminateTesseract() {
    if (this.tesseractWorker) {
      try {
        await this.tesseractWorker.terminate();
        this.tesseractReady = false;
        this.logger.log('Tesseract worker 已释放');
      } catch (error: any) {
        this.logger.error(`释放 Tesseract 失败：${error.message}`);
      }
    }
  }

  /**
   * 单张图片识别
   */
  async recognizeImage(
    imageBuffer: Buffer,
    onProgress?: (progress: OcrProgress) => void,
    pageIndex: number = 0,
  ): Promise<OcrResult> {
    if (this.provider === 'tencent') {
      const r = await this.tencentOcr.recognizeImage(
        imageBuffer,
        pageIndex,
        onProgress
          ? (p) => onProgress({ ...p, pageIndex } as any)
          : undefined,
      );
      return { ...r };
    }
    return this.recognizeTesseractImage(imageBuffer, onProgress, pageIndex);
  }

  /**
   * Tesseract.js 图片识别（保留原实现）
   */
  private async recognizeTesseractImage(
    imageBuffer: Buffer,
    onProgress?: (progress: OcrProgress) => void,
    pageIndex: number = 0,
  ): Promise<OcrResult> {
    if (!this.tesseractReady) {
      await this.initTesseract();
    }
    const result = await this.tesseractWorker.recognize(imageBuffer, {
      logger: (m: any) => {
        if (onProgress && m.status === 'recognizing text') {
          onProgress({
            status: m.status,
            progress: m.progress || 0,
            message: `Tesseract 识别第${pageIndex + 1}页 ${(m.progress * 100).toFixed(0)}%`,
          });
        }
      },
    });
    return {
      text: result.data.text,
      confidence: result.data.confidence,
      lines: result.data.lines.map((line: any) => ({
        text: line.text,
        confidence: line.confidence,
        bbox: line.bbox,
      })),
      pageIndex,
    };
  }

  /**
   * 批量识别 PDF 页面（逐页处理）
   */
  async recognizePdfPages(
    pages: Buffer[],
    onProgress?: (progress: OcrProgress) => void,
  ): Promise<OcrResult[]> {
    const total = pages.length;
    this.logger.log(
      `[${this.provider}] 开始批量识别 PDF，共 ${total} 页`,
    );
    const results: OcrResult[] = [];

    for (let i = 0; i < total; i++) {
      if (onProgress) {
        onProgress({
          status: 'recognizing',
          progress: i / total,
          message: `正在识别第${i + 1}/${total}页...`,
        });
      }
      try {
        const r = await this.recognizeImage(pages[i], onProgress, i);
        results.push(r);
      } catch (error: any) {
        this.logger.error(`第 ${i + 1} 页识别失败：${error.message}`);
        results.push({ text: '', confidence: 0, lines: [], pageIndex: i });
      }
    }

    if (onProgress) {
      onProgress({
        status: 'completed',
        progress: 1,
        message: `识别完成，共 ${total} 页`,
      });
    }
    return results;
  }

  async recognizeQuick(imageBuffer: Buffer): Promise<string> {
    const r = await this.recognizeImage(imageBuffer);
    return r.text;
  }

  isReady(): boolean {
    return this.provider === 'tencent'
      ? this.tencentOcr.isReady()
      : this.tesseractReady;
  }

  getStatus(): { ready: boolean; provider: OcrProviderName; languages: string } {
    return {
      ready: this.isReady(),
      provider: this.provider,
      languages: this.LANGUAGES,
    };
  }
}