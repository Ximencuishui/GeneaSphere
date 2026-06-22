import { Injectable, Logger } from '@nestjs/common';
import { CosService } from '../../cos/cos.service';
import { ImageProcessorService } from '../../cos/image-processor.service';
import { v4 as uuidv4 } from 'uuid';

export interface ProcessResult {
  success: boolean;
  jobId?: string;
  status?: string;
  outputUrl?: string;
  creditsUsed?: number;
  message?: string;
}

@Injectable()
export class AIProcessorService {
  private readonly logger = new Logger(AIProcessorService.name);

  constructor(
    private readonly cosService: CosService,
    private readonly imageProcessor: ImageProcessorService,
  ) {}

  async processImage(
    toolType: string,
    imageUrl: string,
    options?: {
      maskUrl?: string;
      personIds?: string[];
      userId?: string;
      clanId?: string;
    },
  ): Promise<ProcessResult> {
    const userId = options?.userId || 'unknown';
    const clanId = options?.clanId || userId;

    const isCos = this.cosService.getDriverType() === 'cos' || process.env.COS_ENABLED === 'true';

    // 模拟AI处理过程
    await this.simulateProcessing();

    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    let outputUrl = imageUrl;

    if (isCos) {
      try {
        // 如果有原始输入图片，保存到冷 Bucket
        // 在实际项目中，imageUrl 是前端上传的临时 URL，这里以空Buffer模拟
        const uuid = uuidv4().replace(/-/g, '');
        const originalKey = `toolbox/raw/${userId}/${uuid}.jpg`;
        this.logger.log(`AI工具箱原始图保存: ${originalKey}`);

        // 模拟输出结果上传到热 Bucket
        const outputKey = `media/display/toolbox/${userId}/${uuid}.jpg`;
        outputUrl = this.cosService.getCdnUrl(outputKey);
        this.logger.log(`AI工具箱结果图URL: ${outputUrl}`);
      } catch (error: any) {
        this.logger.warn(`AI工具箱 COS 存储失败: ${error.message}，回退到原始 URL`);
      }
    }

    return {
      success: true,
      jobId,
      status: 'completed',
      outputUrl,
      message: '处理完成',
    };
  }

  async getJobStatus(jobId: string): Promise<ProcessResult> {
    // 模拟：假设所有任务都完成了
    return {
      success: true,
      jobId,
      status: 'completed',
      message: '处理完成',
    };
  }

  private async simulateProcessing(): Promise<void> {
    // 模拟处理时间 1-3秒
    const delay = 1000 + Math.random() * 2000;
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}
