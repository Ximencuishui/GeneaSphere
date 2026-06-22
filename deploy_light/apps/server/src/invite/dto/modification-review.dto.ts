import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsInt } from 'class-validator';
import { ModificationStatus } from '@prisma/client';

export class ModificationReviewDto {
  @ApiProperty({ enum: ModificationStatus, description: 'APPROVED 或 REJECTED' })
  @IsEnum(ModificationStatus)
  status: ModificationStatus;

  @ApiProperty({ description: '拒绝原因（驳回时必填）', required: false })
  @IsOptional()
  @IsString()
  reject_reason?: string;
}
