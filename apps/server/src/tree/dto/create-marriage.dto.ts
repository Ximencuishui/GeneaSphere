import {
  IsString,
  IsOptional,
  IsDateString,
  IsBoolean,
  IsNumber,
  IsEnum,
  ValidateIf,
} from 'class-validator';

/**
 * 婚姻结束原因枚举
 * - divorce : 离异
 * - widowed : 丧偶
 * - null    : 未结束（初婚进行中）
 */
export type MarriageEndReasonType = 'divorce' | 'widowed' | null;

export class CreateMarriageDto {
  @IsNumber()
  clan_id: bigint;

  @IsNumber()
  husband_id: bigint;

  @IsNumber()
  wife_id: bigint;

  @IsOptional()
  @IsDateString()
  marriage_date?: Date;

  @IsOptional()
  @IsDateString()
  end_date?: Date;

  @IsOptional()
  @IsEnum({ divorce: 'divorce', widowed: 'widowed' })
  end_reason?: 'divorce' | 'widowed' | null;

  @IsOptional()
  @IsBoolean()
  is_current?: boolean;

  @IsOptional()
  @IsString()
  note?: string;
}