import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { EndorsementResult } from '@prisma/client';

export class RespondEndorsementDto {
  @ApiProperty({ enum: EndorsementResult, description: 'CONFIRMED 或 REJECTED' })
  @IsEnum(EndorsementResult)
  result: EndorsementResult;

  @ApiProperty({ description: '拒绝原因', required: false })
  @IsOptional()
  @IsString()
  reject_reason?: string;
}
