import { IsEnum, IsOptional, IsString, IsInt, Min, Max, MaxLength, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { GenealogyDocumentStyle } from '@prisma/client';

/**
 * 族谱生成参数 DTO
 */
export class CreateGenealogyDocumentDto {
  @IsString()
  @MaxLength(200)
  version_name!: string;

  @IsEnum(GenealogyDocumentStyle, { message: 'style 必须是有效的排版风格' })
  style!: GenealogyDocumentStyle;

  @IsOptional()
  @IsIn(['su', 'ou', 'shixi_table'], { message: 'layout 必须是 su（苏式）、ou（欧式）或 shixi_table（世系表）' })
  @IsString()
  layout?: 'su' | 'ou' | 'shixi_table';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  branch?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  generation_start?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  generation_end?: number;

  @IsOptional()
  cover_image_url?: string;

  @IsOptional()
  include_options?: {
    basic_info?: boolean;
    spouse_info?: boolean;
    children_list?: boolean;
    bio_text?: boolean;
    photo?: boolean;
    migration?: boolean;
  };
}
