import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class QueryHistoryDto {
  @ApiPropertyOptional({ description: '变更主体 person_id' })
  @IsOptional()
  @IsString()
  person_id?: string;

  @ApiPropertyOptional({
    enum: ['marriage', 'spouse', 'child', 'custody'],
  })
  @IsOptional()
  @IsIn(['marriage', 'spouse', 'child', 'custody'])
  change_type?: 'marriage' | 'spouse' | 'child' | 'custody';

  @ApiPropertyOptional({ description: '开始时间 ISO 字符串' })
  @IsOptional()
  @IsString()
  start_date?: string;

  @ApiPropertyOptional({ description: '结束时间 ISO 字符串' })
  @IsOptional()
  @IsString()
  end_date?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;
}