import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  IsNumber,
  Min,
  Max,
  IsIn,
} from 'class-validator';

export class CreateMigrationEventDto {
  @ApiProperty({ description: '关联人物 ID（可选）', required: false })
  @IsOptional()
  person_id?: string;

  @ApiProperty({ description: '支系标签（可选）', required: false })
  @IsOptional()
  @IsString()
  branch?: string;

  @ApiProperty({ description: '迁出地名称' })
  @IsString()
  from_location: string;

  @ApiProperty({ description: '迁出地纬度', required: false })
  @IsOptional()
  @IsNumber()
  from_lat?: number;

  @ApiProperty({ description: '迁出地经度', required: false })
  @IsOptional()
  @IsNumber()
  from_lng?: number;

  @ApiProperty({ description: '迁入地名称' })
  @IsString()
  to_location: string;

  @ApiProperty({ description: '迁入地纬度', required: false })
  @IsOptional()
  @IsNumber()
  to_lat?: number;

  @ApiProperty({ description: '迁入地经度', required: false })
  @IsOptional()
  @IsNumber()
  to_lng?: number;

  @ApiProperty({ description: '迁徙年份（公元年，负数表示公元前）' })
  @IsInt()
  @Min(-3000)
  @Max(9999)
  event_year: number;

  @ApiProperty({
    description: '迁徙原因',
    enum: ['WAR', 'BUSINESS', 'OFFICIAL', 'RECLAMATION', 'FAMINE', 'OTHER'],
    required: false,
  })
  @IsOptional()
  @IsIn(['WAR', 'BUSINESS', 'OFFICIAL', 'RECLAMATION', 'FAMINE', 'OTHER'])
  reason?: string;

  @ApiProperty({ description: '详细描述', required: false })
  @IsOptional()
  @IsString()
  description?: string;
}
