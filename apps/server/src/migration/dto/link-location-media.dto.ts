import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class LinkLocationMediaDto {
  @ApiProperty({ description: '地点名称' })
  @IsString()
  location_name: string;

  @ApiProperty({ description: '图片 ID（MediaArchive.id）' })
  media_id: string;

  @ApiProperty({ description: '显示顺序', required: false, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  display_order?: number;
}
