import {
  IsString,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsInt,
  IsIn,
  IsArray,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Gender } from './create-person.dto';

function OptionalText(): PropertyDecorator {
  return (target, propertyKey) => {
    IsOptional()(target, propertyKey as string);
    ValidateIf((_, value) => value !== null)(target, propertyKey as string);
    IsString()(target, propertyKey as string);
  };
}

export class PersonBioDto {
  @OptionalText() courtesy_name?: string | null;
  @OptionalText() native_place?: string | null;
  @OptionalText() burial_place?: string | null;
  @OptionalText() achievements?: string | null;
  @OptionalText() anecdotes?: string | null;
  @OptionalText() biography?: string | null;
  @OptionalText() marital_notes?: string | null;
  @OptionalText() adoption_note?: string | null;
  @OptionalText() taboo_name?: string | null;
  @OptionalText() art_name?: string | null;
  @OptionalText() posthumous_name?: string | null;
  @OptionalText() infant_name?: string | null;
  @OptionalText() alias_name?: string | null;
  @OptionalText() former_name?: string | null;
  @OptionalText() nickname?: string | null;
  @OptionalText() ethnicity?: string | null;
  @OptionalText() education?: string | null;
  @OptionalText() occupation?: string | null;
  @OptionalText() job_title?: string | null;
  @OptionalText() alma_mater?: string | null;
  @OptionalText() employer?: string | null;
  @OptionalText() lunar_birth?: string | null;
  @OptionalText() lunar_death?: string | null;
  @OptionalText() religion?: string | null;
  @OptionalText() blood_type?: string | null;
  @OptionalText() epitaph?: string | null;
  @OptionalText() source_note?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsBoolean()
  premature?: boolean | null;
}

export class PersonEventInputDto {
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  event_year?: number | null;

  @IsString()
  content: string;

  @IsOptional()
  @IsInt()
  sort_order?: number;
}

export class ChildTypeInputDto {
  @IsString()
  child_id: string;

  @IsIn(['BIOLOGICAL', 'ADOPTED', 'STEP', 'FOSTER', 'ADOPTED_OUT'])
  child_type: string;
}

export class UnionInputDto {
  @IsString()
  family_id: string;

  @IsIn(['normal', 'concubine', 'uxorilocal'])
  union_type: string;
}

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
  @ValidateIf((_, value) => value !== null && value !== '')
  @IsString()
  birth_date?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @IsString()
  death_date?: string | null;

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

  @IsOptional()
  @ValidateNested()
  @Type(() => PersonBioDto)
  bio?: PersonBioDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PersonEventInputDto)
  events?: PersonEventInputDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChildTypeInputDto)
  child_types?: ChildTypeInputDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UnionInputDto)
  unions?: UnionInputDto[];
}
