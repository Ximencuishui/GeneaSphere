import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@geneasphere/db';
import { CosService } from '../../cos/cos.service';
import { ImageProcessorService } from '../../cos/image-processor.service';
import { v4 as uuidv4 } from 'uuid';

export interface GenerationResult {
  videoUrl: string;
  durationSeconds: number;
}

@Injectable()
export class VideoGeneratorService {
  private readonly logger = new Logger(VideoGeneratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly cosService: CosService,
    private readonly imageProcessor: ImageProcessorService,
  ) {}

  /**
   * 生成视频
   * 
   * 注意：这是一个模拟实现。在实际生产环境中，这里应该调用真实的AI视频生成服务
   * 如：Runway Gen-3、Pika、或自研的视频生成模型
   */
  async generateVideo(projectId: bigint): Promise<GenerationResult> {
    this.logger.log(`开始生成视频项目: ${projectId}`);

    // 获取项目信息
    const project = await this.prisma.videoProject.findUnique({
      where: { id: projectId },
      include: {
        materials: {
          include: {
            media: {
              select: { id: true, file_url: true, description: true, taken_year: true },
            },
          },
          orderBy: { sequence_order: 'asc' },
        },
        target_person: {
          select: { full_name: true },
        },
      },
    });

    if (!project) {
      throw new Error('项目不存在');
    }

    this.logger.log(`项目 ${projectId}: 目标人物 ${project.target_person.full_name}, 素材数量 ${project.materials.length}`);

    // 模拟视频生成过程
    // 实际生产中，这里应该：
    // 1. 调用AI模型处理图片序列
    // 2. 生成解说词
    // 3. 添加背景音乐
    // 4. 合成最终视频

    // 模拟处理时间（根据素材数量）
    const materialCount = project.materials.length;
    const processingTime = Math.min(Math.max(materialCount * 500, 5000), 30000); // 5-30秒

    await this.sleep(processingTime);

    // 生成模拟的视频URL
    // 实际生产中，这里应该是真实的视频文件URL
    const videoUrl = this.generateMockVideoUrl(projectId, project.style);
    
    // 计算视频时长（每张照片约3秒）
    const durationSeconds = Math.min(materialCount * 3, 300); // 最多5分钟

    this.logger.log(`项目 ${projectId} 生成完成: ${videoUrl}, 时长 ${durationSeconds}秒`);

    return {
      videoUrl,
      durationSeconds,
    };
  }

  /**
   * 生成视频 URL（COS 模式下返回 CDN 路径，否则返回模拟 URL）
   */
  private generateMockVideoUrl(projectId: bigint, style: string): string {
    const useCos = this.cosService.getDriverType() === 'cos' || process.env.COS_ENABLED === 'true';

    if (useCos) {
      // COS 模式：生成 CDN URL（实际生产中此处应有真实的视频文件上传）
      const uuid = uuidv4().replace(/-/g, '');
      const key = `video/mp4/${projectId}/${uuid}.mp4`;
      return this.cosService.getCdnUrl(key);
    }

    // 本地模式：使用示例视频作为占位
    const timestamp = Date.now();
    return `https://www.w3schools.com/html/mov_bbb.mp4?project=${projectId}&style=${style}&t=${timestamp}`;
  }

  /**
   * 睡眠函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 调用AI生成解说词
   * 实际生产中，这里应该调用LLM生成脚本
   */
  async generateNarrationScript(
    personName: string,
    materials: { description?: string | null; taken_year?: number | null }[],
  ): Promise<string> {
    // 模拟AI生成
    // 实际生产中，这里应该调用LLM（如DeepSeek）生成解说词
    
    const descriptions = materials
      .filter((m) => m.description)
      .map((m) => `${m.taken_year || '某年'}: ${m.description}`)
      .join('；');

    return `亲爱的家族成员们，今天让我们一起回顾${personName}的生命旅程。${descriptions || '时光流转，岁月如梭。让我们珍惜当下，铭记先祖。'}`;
  }
}
