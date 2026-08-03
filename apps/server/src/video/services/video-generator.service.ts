import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@geneasphere/db';
import { CapabilityService } from '../../common/capability.service';

export interface GenerationResult {
  videoUrl: string;
  durationSeconds: number;
}

@Injectable()
export class VideoGeneratorService {
  private readonly logger = new Logger(VideoGeneratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly capabilities: CapabilityService,
  ) {}

  /**
   * 调用已配置的真实视频 Provider。
   *
   * 当前版本尚未安装真实 Provider 适配器，因此必须明确失败；禁止生成公共
   * 示例链接或一个并不存在的对象存储地址来伪装成功。
   */
  async generateVideo(projectId: bigint): Promise<GenerationResult> {
    this.capabilities.assertAvailable('video_generation');

    const project = await this.prisma.videoProject.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    if (!project) {
      throw new HttpException('视频项目不存在', HttpStatus.NOT_FOUND);
    }

    this.logger.error(`视频项目 ${projectId} 无可用的真实 Provider 适配器`);
    throw new HttpException(
      {
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        code: 'CAPABILITY_UNAVAILABLE',
        capability: 'video_generation',
        message: '真实视频生成 Provider 尚未接入',
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }

  async generateNarrationScript(): Promise<string> {
    this.capabilities.assertAvailable('video_generation');
    throw new HttpException(
      {
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        code: 'CAPABILITY_UNAVAILABLE',
        capability: 'video_generation',
        message: '真实视频解说 Provider 尚未接入',
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}
