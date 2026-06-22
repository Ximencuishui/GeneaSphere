import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { createWorker, WorkerOptions } from 'tesseract.js';

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
}

@Injectable()
export class OcrService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OcrService.name);
  private worker: any = null;
  private isInitialized = false;
  private readonly LANGUAGES = 'chi_sim+eng'; // 简体中文 + 英文

  /**
   * 模块初始化时创建OCR Worker
   */
  async onModuleInit() {
    try {
      await this.initialize();
    } catch (error) {
      this.logger.error(`OCR Worker初始化失败: ${error.message}`);
      // 不抛出异常，允许延迟初始化
    }
  }

  /**
   * 模块销毁时释放Worker资源
   */
  async onModuleDestroy() {
    await this.terminate();
  }

  /**
   * 初始化OCR Worker
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      this.logger.log('正在初始化Tesseract.js OCR引擎...');
      this.logger.log(`加载语言包: ${this.LANGUAGES}`);

      this.worker = await createWorker(this.LANGUAGES, 1, {
        logger: (m: any) => {
          if (m.status === 'loading tesseract core') {
            this.logger.debug('加载Tesseract核心...');
          } else if (m.status === 'initializing api') {
            this.logger.debug('初始化API...');
          } else if (m.status === 'loading language traineddata') {
            this.logger.debug('加载语言训练数据...');
          } else if (m.status === 'recognizing text') {
            this.logger.debug(
              `OCR识别进度: ${(m.progress * 100).toFixed(0)}%`
            );
          }
        },
      } as WorkerOptions);

      this.isInitialized = true;
      this.logger.log('OCR Worker初始化成功');
    } catch (error) {
      this.logger.error(`OCR Worker初始化失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 释放OCR Worker资源
   */
  async terminate(): Promise<void> {
    if (this.worker) {
      try {
        await this.worker.terminate();
        this.worker = null;
        this.isInitialized = false;
        this.logger.log('OCR Worker已释放');
      } catch (error) {
        this.logger.error(`释放OCR Worker失败: ${error.message}`);
      }
    }
  }

  /**
   * 识别单张图片
   * @param imageBuffer 图片Buffer（PNG/JPEG格式）
   * @param onProgress 进度回调（可选）
   * @returns 识别结果
   */
  async recognizeImage(
    imageBuffer: Buffer,
    onProgress?: (progress: OcrProgress) => void
  ): Promise<OcrResult> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      this.logger.debug('开始识别图片...');

      const result = await this.worker.recognize(imageBuffer, {
        logger: (m: any) => {
          if (onProgress) {
            onProgress({
              status: m.status,
              progress: m.progress || 0,
              message: m.status,
            });
          }
        },
      });

      const ocrResult: OcrResult = {
        text: result.data.text,
        confidence: result.data.confidence,
        lines: result.data.lines.map((line: any) => ({
          text: line.text,
          confidence: line.confidence,
          bbox: line.bbox,
        })),
      };

      this.logger.debug(
        `图片识别完成，置信度: ${ocrResult.confidence.toFixed(2)}%, ` +
        `文本长度: ${ocrResult.text.length}字符`
      );

      return ocrResult;
    } catch (error) {
      this.logger.error(`图片识别失败: ${error.message}`, error.stack);
      throw new Error(`OCR识别失败: ${error.message}`);
    }
  }

  /**
   * 批量识别PDF页面（逐页处理，控制内存）
   * @param pages 页面图片Buffer数组
   * @param onProgress 进度回调（可选）
   * @returns 每页识别结果
   */
  async recognizePdfPages(
    pages: Buffer[],
    onProgress?: (progress: OcrProgress) => void
  ): Promise<OcrResult[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    this.logger.log(`开始批量识别PDF页面，共${pages.length}页...`);

    const results: OcrResult[] = [];
    const totalPages = pages.length;

    // 逐页处理，避免内存溢出
    for (let i = 0; i < totalPages; i++) {
      try {
        if (onProgress) {
          onProgress({
            status: 'recognizing',
            progress: i / totalPages,
            message: `正在识别第${i + 1}/${totalPages}页...`,
          });
        }

        this.logger.debug(`识别第${i + 1}/${totalPages}页...`);
        const result = await this.recognizeImage(pages[i]);
        results.push(result);

        this.logger.debug(
          `第${i + 1}页识别完成: ${result.text.length}字符`
        );
      } catch (error) {
        this.logger.error(`第${i + 1}页识别失败: ${error.message}`);
        // 继续处理下一页，不中断整个流程
        results.push({
          text: '',
          confidence: 0,
          lines: [],
        });
      }
    }

    if (onProgress) {
      onProgress({
        status: 'completed',
        progress: 1,
        message: `识别完成，共${totalPages}页`,
      });
    }

    this.logger.log(`PDF页面批量识别完成，共${totalPages}页`);

    return results;
  }

  /**
   * 快速识别（简化版本，无详细进度）
   * @param imageBuffer 图片Buffer
   * @returns 识别文本
   */
  async recognizeQuick(imageBuffer: Buffer): Promise<string> {
    const result = await this.recognizeImage(imageBuffer);
    return result.text;
  }

  /**
   * 检查Worker是否可用
   */
  isReady(): boolean {
    return this.isInitialized && this.worker !== null;
  }

  /**
   * 获取Worker状态信息
   */
  getStatus(): { ready: boolean; languages: string } {
    return {
      ready: this.isInitialized,
      languages: this.LANGUAGES,
    };
  }
}
