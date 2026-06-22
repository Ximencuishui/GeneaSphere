import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '@geneasphere/db';
import { VideoProjectStatus } from '@prisma/client';
import { VideoGeneratorService } from '../../video/services/video-generator.service';

@Injectable()
export class LineageQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LineageQueueService.name);
  private isProcessing = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly videoGeneratorService: VideoGeneratorService,
  ) {}

  onModuleInit() {
    // 每15秒检查一次队列
    this.timer = setInterval(() => this.processQueue(), 15000);
    this.logger.log('直系血缘视频队列处理器已启动');
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.logger.log('直系血缘视频队列处理器已停止');
    }
  }

  /**
   * 处理队列
   */
  private async processQueue() {
    if (this.isProcessing) return;

    this.isProcessing = true;

    try {
      // 检查是否有正在处理的任务
      const processingCount = await this.prisma.lineageVideoProject.count({
        where: { status: VideoProjectStatus.processing },
      });

      if (processingCount > 0) {
        this.logger.debug('已有直系血缘任务正在处理，跳过');
        return;
      }

      // 先查找VIP优先任务
      let nextTask = await this.prisma.lineageVideoProject.findFirst({
        where: { status: VideoProjectStatus.queued, priority: true },
        orderBy: { created_at: 'asc' },
      });

      // 再查找普通任务
      if (!nextTask) {
        nextTask = await this.prisma.lineageVideoProject.findFirst({
          where: { status: VideoProjectStatus.queued, priority: false },
          orderBy: { created_at: 'asc' },
        });
      }

      if (!nextTask) {
        this.logger.debug('直系血缘视频队列为空');
        return;
      }

      this.logger.log(`开始处理直系血缘项目: ${nextTask.id}`);

      // 更新状态为处理中
      await this.prisma.lineageVideoProject.update({
        where: { id: nextTask.id },
        data: { status: VideoProjectStatus.processing },
      });

      try {
        // 复用 VideoGeneratorService 生成视频
        // 传入负数projectId以区分（实际生产环境应有独立的生成逻辑）
        const result = await this.videoGeneratorService.generateVideo(nextTask.id);

        await this.prisma.lineageVideoProject.update({
          where: { id: nextTask.id },
          data: {
            status: VideoProjectStatus.completed,
            video_url: result.videoUrl,
            duration_seconds: result.durationSeconds,
            completed_at: new Date(),
          },
        });

        this.logger.log(`直系血缘项目 ${nextTask.id} 生成完成`);
      } catch (error: any) {
        this.logger.error(`直系血缘项目 ${nextTask.id} 生成失败: ${error.message}`);

        await this.prisma.lineageVideoProject.update({
          where: { id: nextTask.id },
          data: {
            status: VideoProjectStatus.failed,
            error_message: error.message || '生成失败',
            completed_at: new Date(),
          },
        });
      }

      // 更新队列位置
      await this.updateQueuePositions();
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * 更新队列位置
   */
  private async updateQueuePositions(): Promise<void> {
    const [vipTasks, normalTasks] = await Promise.all([
      this.prisma.lineageVideoProject.findMany({
        where: { status: VideoProjectStatus.queued, priority: true },
        orderBy: { created_at: 'asc' },
      }),
      this.prisma.lineageVideoProject.findMany({
        where: { status: VideoProjectStatus.queued, priority: false },
        orderBy: { created_at: 'asc' },
      }),
    ]);

    for (let i = 0; i < vipTasks.length; i++) {
      await this.prisma.lineageVideoProject.update({
        where: { id: vipTasks[i].id },
        data: { queue_position: i + 1 },
      });
    }

    for (let i = 0; i < normalTasks.length; i++) {
      await this.prisma.lineageVideoProject.update({
        where: { id: normalTasks[i].id },
        data: { queue_position: i + 1 },
      });
    }
  }
}
