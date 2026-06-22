import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { VideoQueueService } from './video-queue.service';
import { VideoGeneratorService } from '../services/video-generator.service';
import { PrismaService } from '@geneasphere/db';
import { VideoProjectStatus } from '@prisma/client';

@Injectable()
export class VideoProcessorService implements OnModuleInit {
  private readonly logger = new Logger(VideoProcessorService.name);
  private isProcessing = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly videoQueueService: VideoQueueService,
    private readonly videoGeneratorService: VideoGeneratorService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    // 每10秒检查一次队列
    this.timer = setInterval(() => this.processQueue(), 10000);
    this.logger.log('视频队列处理器已启动');
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.logger.log('视频队列处理器已停止');
    }
  }

  /**
   * 处理队列
   */
  private async processQueue() {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      // 检查是否有正在处理的任务
      const processingCount = await this.prisma.videoProject.count({
        where: { status: VideoProjectStatus.processing },
      });

      if (processingCount > 0) {
        this.logger.debug('已有任务正在处理，跳过');
        return;
      }

      // 获取下一个任务
      const nextTask = await this.videoQueueService.getNextTask();

      if (!nextTask) {
        this.logger.debug('队列为空');
        return;
      }

      this.logger.log(`开始处理项目: ${nextTask.projectId}`);

      // 更新状态为处理中
      await this.prisma.videoProject.update({
        where: { id: nextTask.projectId },
        data: { status: VideoProjectStatus.processing },
      });

      // 调用视频生成服务
      try {
        const result = await this.videoGeneratorService.generateVideo(nextTask.projectId);

        // 更新为完成状态
        await this.prisma.videoProject.update({
          where: { id: nextTask.projectId },
          data: {
            status: VideoProjectStatus.completed,
            video_url: result.videoUrl,
            duration_seconds: result.durationSeconds,
            completed_at: new Date(),
          },
        });

        this.logger.log(`项目 ${nextTask.projectId} 生成完成`);
      } catch (error: any) {
        this.logger.error(`项目 ${nextTask.projectId} 生成失败: ${error.message}`);

        // 更新为失败状态
        await this.prisma.videoProject.update({
          where: { id: nextTask.projectId },
          data: {
            status: VideoProjectStatus.failed,
            error_message: error.message || '生成失败',
            completed_at: new Date(),
          },
        });
      }

      // 更新队列位置
      await this.videoQueueService.updateQueuePositions();
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * 手动触发队列处理（用于测试）
   */
  async triggerProcessing(): Promise<void> {
    this.isProcessing = false;
    await this.processQueue();
  }
}
