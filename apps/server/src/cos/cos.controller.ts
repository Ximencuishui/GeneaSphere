import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Request,
  UseGuards,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CosService } from './cos.service';
import { GetPresignedUrlDto, GenerateFileKeyDto, StsCredentialsResponse } from './dto/sts-credentials.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('COS 存储')
@Controller('api/cos')
export class CosController {
  constructor(private readonly cosService: CosService) {}

  /**
   * 获取 STS 临时密钥（前端直传用）
   */
  @Post('sts-credentials')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取 STS 临时密钥，用于前端直传 COS' })
  async getStsCredentials(@Request() req): Promise<StsCredentialsResponse> {
    if (this.cosService.getDriverType() === 'local') {
      // 本地模式：返回提示信息
      throw new BadRequestException('当前为本地存储模式，不支持 STS 直传');
    }

    try {
      const tencentcloud = require('tencentcloud-sdk-nodejs');
      const StsClient = tencentcloud.sts.v20180813.Client;

      const secretId = process.env.COS_STS_SECRET_ID || process.env.TENCENT_CLOUD_SECRET_ID;
      const secretKey = process.env.COS_STS_SECRET_KEY || process.env.TENCENT_CLOUD_SECRET_KEY;
      const bucket = process.env.COS_HOT_BUCKET || 'xungenlu-hot';
      const appId = process.env.TENCENT_CLOUD_APPID || '';

      const client = new StsClient({
        credential: { secretId, secretKey },
        region: process.env.TENCENT_CLOUD_REGION || 'ap-guangzhou',
      });

      // 限制上传路径前缀，防止覆盖他人文件
      const userId = req.user.userId;
      const pathPrefix = `media/original/${userId}/`;
      const fullBucket = appId ? `${bucket}-${appId}` : bucket;

      const params = {
        Name: 'geneasphere-upload',
        Policy: JSON.stringify({
          version: '2.0',
          statement: [
            {
              effect: 'allow',
              action: [
                'name/cos:PutObject',
                'name/cos:PostObject',
              ],
              resource: [
                `qcs::cos:${process.env.TENCENT_CLOUD_REGION || 'ap-guangzhou'}:uid/${appId || '*'}:${fullBucket}/${pathPrefix}*`,
                `qcs::cos:${process.env.TENCENT_CLOUD_REGION || 'ap-guangzhou'}:uid/${appId || '*'}:${fullBucket}/toolbox/raw/${userId}/*`,
              ],
            },
          ],
        }),
        DurationSeconds: parseInt(process.env.COS_STS_DURATION_SECONDS || '1800', 10),
      };

      const result: any = await client.AssumeRole(params);

      return {
        credentials: {
          tmpSecretId: result.Credentials.TmpSecretId,
          tmpSecretKey: result.Credentials.TmpSecretKey,
          sessionToken: result.Credentials.SessionToken,
          startTime: result.ExpiredTime - 1800,
          expiredTime: result.ExpiredTime,
        },
        bucket: fullBucket,
        region: process.env.TENCENT_CLOUD_REGION || 'ap-guangzhou',
        pathPrefix,
      };
    } catch (error: any) {
      throw new InternalServerErrorException(
        `获取 STS 凭证失败: ${error.message}`,
      );
    }
  }

  /**
   * 获取预签名 URL（冷 Bucket 查看原图等）
   */
  @Get('presigned-url')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取冷 Bucket 文件预签名 URL（有效期 5 分钟）' })
  async getPresignedUrl(
    @Request() req,
    @Query() dto: GetPresignedUrlDto,
  ): Promise<{ url: string; expires_in: number }> {
    if (!dto.key) {
      throw new BadRequestException('请提供文件 key');
    }
    const expiresIn = dto.expiresIn || 300;
    const bucketType = dto.bucketType || 'cold';

    try {
      const url = await this.cosService.getPresignedUrl(dto.key, bucketType, expiresIn);
      return { url, expires_in: expiresIn };
    } catch (error: any) {
      throw new InternalServerErrorException(
        `生成预签名 URL 失败: ${error.message}`,
      );
    }
  }

  /**
   * 生成合规的文件存储路径
   */
  @Post('generate-key')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '生成合规的文件存储路径' })
  async generateFileKey(
    @Request() req,
    @Body() dto: GenerateFileKeyDto,
  ): Promise<{ key: string; url: string }> {
    if (!dto.category || !dto.clanId || !dto.ext) {
      throw new BadRequestException('请提供 category, clanId, ext');
    }
    const key = this.cosService.generateFileKey(
      dto.category,
      dto.clanId,
      dto.ext.replace(/^\./, ''),
      dto.userId || req.user.userId,
    );
    const url = this.cosService.getCdnUrl(key);
    return { key, url };
  }
}
