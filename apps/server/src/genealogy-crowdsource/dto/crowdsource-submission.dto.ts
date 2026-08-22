import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsPhoneNumber,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * H5 族员提交族谱信息修改申请
 * POST /api/genealogy/:slug/crowdsource/submissions
 *
 * H5 端完成短信登录后调用：
 *   - phone 用于后台关联到 User / PersonUserLink（族员身份）
 *   - token 用于校验通知文案有效性
 *   - 其余字段为族员希望修改或新增的族谱信息
 */
export class CrowdsourceSubmissionDto {
  @ApiProperty({ description: '通知文案 token（来自 H5 链接）' })
  @IsString()
  token!: string;

  @ApiProperty({ description: '已通过短信校验的手机号' })
  @IsString()
  @IsPhoneNumber('CN')
  phone!: string;

  @ApiProperty({ description: '姓名' })
  @IsString()
  @MaxLength(100)
  full_name!: string;

  @ApiProperty({ description: '性别：male/female' })
  @IsString()
  @IsIn(['male', 'female'])
  gender!: 'male' | 'female';

  @ApiProperty({ description: '出生年份', required: false })
  @IsOptional()
  @IsInt()
  @Min(1500)
  @Max(new Date().getFullYear())
  birth_year?: number;

  @ApiProperty({ description: '字辈', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  xipai?: string;

  @ApiProperty({ description: '联系电话', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  contact_phone?: string;

  @ApiProperty({ description: '生平简介', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bio?: string;
}