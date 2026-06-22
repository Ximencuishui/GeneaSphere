import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@geneasphere/db';

export type JobType = 'ocr' | 'video' | 'puppeteer' | 'image_process';
export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface CreateJobParams {
  type: JobType;
  userId: string;
  clanId?: number;
  payload: Record<string, any>;
}

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 创建一个重任务（OCR / 视频 / Puppeteer 等）
   * 线下服务器通过 /api/jobs/pending 轮询拉取
   */
  async createJob(params: CreateJobParams) {
    const job = await this.prisma.heavyJob.create({
      data: {
        type: params.type,
        status: 'pending',
        userId: params.userId,
        clanId: params.clanId ? BigInt(params.clanId) : null,
        payload: params.payload,
      },
    });

    this.logger.log(`任务创建: ${job.id} (${params.type})`);
    return job;
  }

  /**
   * 线下服务器调用：获取下一个待处理任务
   * 返回 null 表示没有待处理任务
   */
  async fetchNextPending(type?: JobType) {
    const where: any = { status: 'pending' };
    if (type) where.type = type;

    const job = await this.prisma.heavyJob.findFirst({
      where,
      orderBy: { createdAt: 'asc' },
    });

    if (!job) return null;

    // 标记为处理中
    await this.prisma.heavyJob.update({
      where: { id: job.id },
      data: {
        status: 'processing',
        startedAt: new Date(),
      },
    });

    return {
      id: job.id.toString(),
      type: job.type,
      userId: job.userId,
      clanId: job.clanId?.toString(),
      payload: job.payload as Record<string, any>,
    };
  }

  /**
   * 线下服务器调用：回调任务结果
   */
  async completeJob(jobId: string, result: Record<string, any>) {
    const job = await this.prisma.heavyJob.update({
      where: { id: BigInt(jobId) },
      data: {
        status: 'completed',
        result: result,
        completedAt: new Date(),
      },
    });

    this.logger.log(`任务完成: ${jobId} (${job.type})`);
    return job;
  }

  /**
   * 线下服务器调用：回调任务失败
   */
  async failJob(jobId: string, errorMessage: string) {
    const job = await this.prisma.heavyJob.update({
      where: { id: BigInt(jobId) },
      data: {
        status: 'failed',
        errorMessage,
        completedAt: new Date(),
      },
    });

    this.logger.error(`任务失败: ${jobId} - ${errorMessage}`);
    return job;
  }

  /**
   * 用户查询任务状态
   */
  async getJobStatus(jobId: string) {
    const job = await this.prisma.heavyJob.findUnique({
      where: { id: BigInt(jobId) },
    });

    if (!job) return null;

    return {
      id: job.id.toString(),
      type: job.type,
      status: job.status,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      errorMessage: job.errorMessage,
      result: job.result,
    };
  }

  /**
   * 查询用户的所有任务
   */
  async getUserJobs(userId: string) {
    const jobs = await this.prisma.heavyJob.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return jobs.map((j) => ({
      id: j.id.toString(),
      type: j.type,
      status: j.status,
      createdAt: j.createdAt,
      completedAt: j.completedAt,
      errorMessage: j.errorMessage,
    }));
  }
}
