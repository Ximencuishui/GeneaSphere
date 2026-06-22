import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Headers,
  HttpException,
  HttpStatus,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JobsService, JobType } from './jobs.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

// 线下服务器鉴权 Key（从环境变量读取）
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'geneasphere-internal-key-change-me';

@Controller('api/jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  /**
   * 内部鉴权：验证线下服务器的 API Key
   */
  private checkInternalAuth(apiKey: string) {
    if (!apiKey || apiKey !== INTERNAL_API_KEY) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }
  }

  // ==================== 线下服务器接口 ====================

  /**
   * 线下服务器轮询：拉取下一个待处理任务
   * GET /api/jobs/pending?type=ocr
   */
  @Get('pending')
  async fetchPending(
    @Headers('x-internal-key') apiKey: string,
    @Query('type') type?: string,
  ) {
    this.checkInternalAuth(apiKey);
    const job = await this.jobsService.fetchNextPending(type as JobType);
    if (!job) {
      return { hasJob: false };
    }
    return { hasJob: true, job };
  }

  /**
   * 线下服务器回调：任务完成
   * POST /api/jobs/callback
   * Body: { job_id, status: 'completed'|'failed', result, error_message }
   */
  @Post('callback')
  async callback(
    @Headers('x-internal-key') apiKey: string,
    @Request() req,
  ) {
    this.checkInternalAuth(apiKey);

    const { job_id, status, result, error_message } = req.body;

    if (!job_id || !status) {
      throw new HttpException('Missing job_id or status', HttpStatus.BAD_REQUEST);
    }

    if (status === 'completed') {
      await this.jobsService.completeJob(job_id, result || {});
      return { success: true };
    } else if (status === 'failed') {
      await this.jobsService.failJob(job_id, error_message || 'Unknown error');
      return { success: true };
    }

    throw new HttpException('Invalid status', HttpStatus.BAD_REQUEST);
  }

  // ==================== 用户端接口 ====================

  /**
   * 用户查询任务状态
   * GET /api/jobs/:id
   */
  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getJobStatus(@Param('id') id: string) {
    const job = await this.jobsService.getJobStatus(id);
    if (!job) {
      throw new HttpException('任务不存在', HttpStatus.NOT_FOUND);
    }
    return job;
  }

  /**
   * 用户查询自己的任务列表
   * GET /api/jobs
   */
  @UseGuards(JwtAuthGuard)
  @Get()
  async getUserJobs(@Request() req) {
    const userId = req.user.userId;
    return this.jobsService.getUserJobs(userId);
  }
}
