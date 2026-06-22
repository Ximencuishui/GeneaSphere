import { IsNumber, IsString, IsOptional, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProjectDto {
  @ApiProperty({ description: '目标人物ID' })
  @IsNumber()
  target_person_id: number;

  @ApiPropertyOptional({ description: '视频风格', default: 'nostalgic' })
  @IsString()
  @IsOptional()
  @IsIn(['nostalgic', 'bw复古', 'modern'])
  style?: string = 'nostalgic';

  @ApiPropertyOptional({ description: '是否使用付费优先通道', default: false })
  @IsOptional()
  use_priority?: boolean;
}
