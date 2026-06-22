import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export type MarriageStatus = 'married' | 'not_in_marriage' | 'widowed' | 'remarried';

export class UpdateMarriageDto {
  @ApiProperty({ description: '变更主体的 person_id' })
  @IsString()
  person_id: string;

  @ApiProperty({ enum: ['married', 'not_in_marriage', 'widowed', 'remarried'] })
  @IsIn(['married', 'not_in_marriage', 'widowed', 'remarried'])
  current_status: MarriageStatus;

  @ApiPropertyOptional({ description: '是否保留前任配偶记录（仅 admin/self 可见）', default: true })
  @IsOptional()
  @IsBoolean()
  keep_previous_spouse?: boolean;

  @ApiPropertyOptional({ description: '变更原因（≤200字）' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  change_reason?: string;
}