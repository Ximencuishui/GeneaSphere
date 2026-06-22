import {
  IsInt,
  IsOptional,
  IsString,
  IsBoolean,
  IsArray,
  IsIn,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateFamilyBookDto {
  @ApiProperty({ description: '起始人物 ID' })
  @IsInt()
  start_person_id: number;

  @ApiPropertyOptional({ description: '向后延展代数（1-10）', default: 3 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  generations?: number = 3;

  @ApiPropertyOptional({ description: '是否包含每代人的配偶', default: true })
  @IsOptional()
  @IsBoolean()
  include_spouse?: boolean = true;

  @ApiPropertyOptional({
    description: '分类方式：family=按家庭 / branch=按房支 / generation=按世代',
    default: 'family',
  })
  @IsOptional()
  @IsIn(['family', 'branch', 'generation'])
  grouping?: 'family' | 'branch' | 'generation' = 'family';

  @ApiPropertyOptional({
    description: '展示信息字段：name/photo/birth/death/bio/occupation/residence',
    default: ['name', 'photo', 'birth', 'bio'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  selected_fields?: string[] = ['name', 'photo', 'birth', 'bio'];

  @ApiPropertyOptional({
    description: '封面风格：red/gold/green/ink/modern',
    default: 'red',
  })
  @IsOptional()
  @IsIn(['red', 'gold', 'green', 'ink', 'modern'])
  cover_template?: 'red' | 'gold' | 'green' | 'ink' | 'modern' = 'red';

  @ApiPropertyOptional({ description: '图册标题', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ description: '图册前言', maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  preface?: string;
}

export class UpdateFamilyBookDto {
  @ApiPropertyOptional({ description: '向后延展代数（1-10）' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  generations?: number;

  @ApiPropertyOptional({ description: '是否包含每代人的配偶' })
  @IsOptional()
  @IsBoolean()
  include_spouse?: boolean;

  @ApiPropertyOptional({ description: '分类方式' })
  @IsOptional()
  @IsIn(['family', 'branch', 'generation'])
  grouping?: 'family' | 'branch' | 'generation';

  @ApiPropertyOptional({ description: '展示信息字段', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  selected_fields?: string[];

  @ApiPropertyOptional({ description: '封面风格' })
  @IsOptional()
  @IsIn(['red', 'gold', 'green', 'ink', 'modern'])
  cover_template?: 'red' | 'gold' | 'green' | 'ink' | 'modern';

  @ApiPropertyOptional({ description: '图册标题', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ description: '图册前言', maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  preface?: string;
}

export class UpdateFamilyBookPageDto {
  @ApiPropertyOptional({ description: '页面标题', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ description: '页面副标题', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  subtitle?: string;

  @ApiPropertyOptional({ description: '页面正文', maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  body?: string;
}

export class PlaceFamilyBookOrderDto {
  @ApiProperty({ description: '印刷规格，如 A4精装' })
  @IsString()
  @MaxLength(100)
  specification: string;

  @ApiPropertyOptional({ description: '份数', default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  quantity?: number = 1;

  @ApiPropertyOptional({ description: '收货地址 JSON' })
  @IsOptional()
  shipping_address?: any;
}
