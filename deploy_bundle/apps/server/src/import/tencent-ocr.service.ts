import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

export interface TencentOcrLine {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

export interface TencentOcrPageResult {
  text: string;
  confidence: number;
  lines: TencentOcrLine[];
  pageIndex: number;
}

export interface TencentOcrProgress {
  status: string;
  progress: number;
  message: string;
}

/**
 * 腾讯云 OCR 服务封装
 * - 子模块：ocr.v20181119
 * - 接口：GeneralBasicOCR（通用印刷体识别）
 * - 未配置密钥时 isConfigured() 返回 false，由 OcrService 决定 fallback
 */
@Injectable()
export class TencentOcrService implements OnModuleInit {
  private readonly logger = new Logger(TencentOcrService.name);
  private client: any = null;
  private secretId = '';
  private secretKey = '';
  private region = 'ap-guangzhou';

  onModuleInit() {
    this.secretId = process.env.TENCENT_OCR_SECRET_ID || '';
    this.secretKey = process.env.TENCENT_OCR_SECRET_KEY || '';
    this.region = process.env.TENCENT_OCR_REGION || 'ap-guangzhou';
    if (this.isConfigured()) {
      try {
        // 动态加载，避免未安装时影响整体启动
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const tencentcloud = require('tencentcloud-sdk-nodejs');
        const OcrClient = tencentcloud.ocr.v20181119.Client;
        this.client = new OcrClient({
          credential: { secretId: this.secretId, secretKey: this.secretKey },
          region: this.region,
          profile: { httpProfile: { endpoint: 'ocr.tencentcloudapi.com' } },
        });
        this.logger.log(`腾讯云 OCR 客户端初始化完成 region=${this.region}`);
      } catch (error: any) {
        this.logger.warn(
          `腾讯云 OCR SDK 加载失败，将降级为本地 OCR：${error.message}`,
        );
        this.client = null;
      }
    } else {
      this.logger.warn('未配置腾讯云 OCR 密钥（TENCENT_OCR_SECRET_ID/KEY）');
    }
  }

  /**
   * 是否完成密钥配置并成功初始化客户端
   */
  isConfigured(): boolean {
    return Boolean(this.secretId && this.secretKey);
  }

  /**
   * 是否就绪（已配置且 SDK 加载成功）
   */
  isReady(): boolean {
    return this.isConfigured() && this.client !== null;
  }

  /**
   * 单页图片识别（PNG/JPEG Buffer）
   */
  async recognizeImage(
    imageBuffer: Buffer,
    pageIndex: number = 0,
    onProgress?: (progress: TencentOcrProgress) => void,
  ): Promise<TencentOcrPageResult> {
    if (!this.isReady()) {
      throw new Error('腾讯云 OCR 客户端未就绪');
    }
    if (onProgress) {
      onProgress({
        status: 'recognizing',
        progress: 0.1,
        message: `腾讯云识别第${pageIndex + 1}页...`,
      });
    }

    const base64 = imageBuffer.toString('base64');
    const params = { ImageBase64: base64 };

    const res: any = await this.client.GeneralBasicOCR(params);
    if (res?.Response?.Error) {
      const err = res.Response.Error;
      throw new Error(`腾讯云OCR错误 [${err.Code}] ${err.Message}`);
    }
    const detections: any[] = res?.TextDetections || [];

    const lines: TencentOcrLine[] = detections.map((d: any) => ({
      text: d.DetectedText || '',
      confidence: typeof d.Confidence === 'number' ? d.Confidence : 0,
      bbox: {
        x0: d.Polygon?.[0]?.X || 0,
        y0: d.Polygon?.[0]?.Y || 0,
        x1: d.Polygon?.[2]?.X || 0,
        y1: d.Polygon?.[2]?.Y || 0,
      },
    }));
    const text = lines.map((l) => l.text).join('\n');
    const confidence =
      lines.length > 0
        ? lines.reduce((s, l) => s + l.confidence, 0) / lines.length
        : 0;

    if (onProgress) {
      onProgress({
        status: 'recognized',
        progress: 1,
        message: `第${pageIndex + 1}页识别完成`,
      });
    }

    return { text, confidence, lines, pageIndex };
  }

  /**
   * 批量识别 PDF 页面
   * @param pages 图片 Buffer 数组
   * @param onProgress 进度回调
   */
  async recognizePdfPages(
    pages: Buffer[],
    onProgress?: (progress: TencentOcrProgress) => void,
  ): Promise<TencentOcrPageResult[]> {
    const total = pages.length;
    this.logger.log(`腾讯云 OCR 开始批量识别，共 ${total} 页`);
    const results: TencentOcrPageResult[] = [];

    for (let i = 0; i < total; i++) {
      try {
        if (onProgress) {
          onProgress({
            status: 'recognizing',
            progress: i / total,
            message: `正在识别第${i + 1}/${total}页...`,
          });
        }
        const r = await this.recognizeImage(pages[i], i, onProgress);
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
}