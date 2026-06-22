import { Injectable } from '@nestjs/common';
import { PrismaService } from '@geneasphere/db';
import { VideoProjectStatus } from '@prisma/client';

export interface QueueItem {
  projectId: bigint;
  priority: boolean;
  createdAt: Date;
}

@Injectable()
export class VideoQueueService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 获取下一个待处理任务
   * VIP用户优先
   */
  async getNextTask(): Promise<QueueItem | null> {
    // 先查找VIP优先任务
    const vipTask = await this.prisma.videoProject.findFirst({
      where: {
        status: VideoProjectStatus.queued,
        priority: true,
      },
      orderBy: { created_at: 'asc' },
    });

    if (vipTask) {
      return {
        projectId: vipTask.id,
        priority: true,
        createdAt: vipTask.created_at,
      };
    }

    // 查找普通任务
    const normalTask = await this.prisma.videoProject.findFirst({
      where: {
        status: VideoProjectStatus.queued,
        priority: false,
      },
      orderBy: { created_at: 'asc' },
    });

    if (normalTask) {
      return {
        projectId: normalTask.id,
        priority: false,
        createdAt: normalTask.created_at,
      };
    }

    return null;
  }

  /**
   * 更新队列中所有任务的排队位置
   */
  async updateQueuePositions(): Promise<void> {
    // 更新VIP任务位置
    const vipTasks = await this.prisma.videoProject.findMany({
      where: {
        status: VideoProjectStatus.queued,
        priority: true,
      },
      orderBy: { created_at: 'asc' },
    });

    for (let i = 0; i < vipTasks.length; i++) {
      await this.prisma.videoProject.update({
        where: { id: vipTasks[i].id },
        data: { queue_position: i + 1 },
      });
    }

    // 更新普通任务位置
    const normalTasks = await this.prisma.videoProject.findMany({
      where: {
        status: VideoProjectStatus.queued,
        priority: false,
      },
      orderBy: { created_at: 'asc' },
    });

    for (let i = 0; i < normalTasks.length; i++) {
      await this.prisma.videoProject.update({
        where: { id: normalTasks[i].id },
        data: { queue_position: i + 1 },
      });
    }
  }

  /**
   * 获取队列统计信息
   */
  async getQueueStats(): Promise<{
    vipCount: number;
    normalCount: number;
    totalCount: number;
  }> {
    const [vipCount, normalCount] = await Promise.all([
      this.prisma.videoProject.count({
        where: {
          status: VideoProjectStatus.queued,
          priority: true,
        },
      }),
      this.prisma.videoProject.count({
        where: {
          status: VideoProjectStatus.queued,
          priority: false,
        },
      }),
    ]);

    return {
      vipCount,
      normalCount,
      totalCount: vipCount + normalCount,
    };
  }
}
