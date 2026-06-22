import { IsNumber, IsString, IsOptional, IsIn, IsBoolean, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateLineageProjectDto {
  @ApiProperty({ description: '中心人物ID' })
  @IsNumber()
  center_person_id: number;

  @ApiPropertyOptional({ description: '追溯方向', default: 'paternal' })
  @IsString()
  @IsOptional()
  @IsIn(['paternal', 'maternal', 'both'])
  direction?: string = 'paternal';

  @ApiPropertyOptional({ description: '向上追溯代数（1-20）', default: 5 })
  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(20)
  up_generations?: number = 5;

  @ApiPropertyOptional({ description: '向下延展代数（0-10）', default: 3 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(10)
  down_generations?: number = 3;

  @ApiPropertyOptional({ description: '是否包含配偶', default: true })
  @IsBoolean()
  @IsOptional()
  include_spouse?: boolean = true;

  @ApiPropertyOptional({ description: '视频风格', default: 'nostalgic' })
  @IsString()
  @IsOptional()
  @IsIn(['nostalgic', 'bw复古', 'modern'])
  style?: string = 'nostalgic';

  @ApiPropertyOptional({ description: '是否使用付费优先通道', default: false })
  @IsOptional()
  @IsBoolean()
  use_priority?: boolean = false;
}
