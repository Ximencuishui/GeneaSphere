import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { CapabilityService } from '../../common/capability.service';

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
  constructor(private readonly capabilities: CapabilityService) {}

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
    this.capabilities.assertAvailable('ai_tools');

    throw new HttpException(
      {
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        code: 'CAPABILITY_UNAVAILABLE',
        capability: 'ai_tools',
        message: `真实 AI 工具 Provider 尚未接入，无法执行 ${toolType}`,
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }

  async getJobStatus(jobId: string): Promise<ProcessResult> {
    this.capabilities.assertAvailable('ai_tools');
    throw new HttpException(
      {
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        code: 'CAPABILITY_UNAVAILABLE',
        capability: 'ai_tools',
        jobId,
        message: '真实 AI 工具 Provider 尚未接入',
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}
