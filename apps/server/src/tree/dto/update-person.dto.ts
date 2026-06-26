import {
  IsString,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsDateString,
  IsNumber,
  ValidateIf,
} from 'class-validator';
import { Gender } from './create-person.dto';

/**
 * 更新人物 DTO
 * - 所有字段可选，前端只传需要改的字段
 * - birth_date / death_date 允许 null（清空）
 */
export class UpdatePersonDto {
  @IsOptional()
  @IsString()
  full_name?: string;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsDateString()
  birth_date?: Date | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsDateString()
  death_date?: Date | null;

  @IsOptional()
  @IsBoolean()
  is_living?: boolean;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  birth_place?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  death_place?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  migration_branch?: string | null;
}