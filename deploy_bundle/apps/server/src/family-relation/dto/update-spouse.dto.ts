import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export type SpouseAction = 'add' | 'remove' | 'replace';

export class NewSpouseDto {
  @ApiProperty({ description: '配偶姓名（外部配偶仅记录姓名）' })
  @IsString()
  @MaxLength(100)
  full_name: string;

  @ApiProperty({ enum: ['male', 'female'] })
  @IsIn(['male', 'female'])
  gender: 'male' | 'female';

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  birth_date?: string;

  @ApiPropertyOptional({ description: '对方所在族 id（外部配偶留空）' })
  @IsOptional()
  @IsString()
  clan_id?: string;

  @ApiProperty({ description: 'true 表示对方非本族成员，仅记录姓名' })
  @IsBoolean()
  is_external: boolean;
}

export class UpdateSpouseDto {
  @ApiProperty({ description: '变更主体的 person_id' })
  @IsString()
  person_id: string;

  @ApiProperty({ enum: ['add', 'remove', 'replace'] })
  @IsIn(['add', 'remove', 'replace'])
  action: SpouseAction;

  @ApiPropertyOptional({ description: '现有配偶 person_id（remove 时可空）' })
  @IsOptional()
  @IsString()
  spouse_person_id?: string;

  @ApiPropertyOptional({ type: NewSpouseDto, description: '新增/更换的配偶信息' })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => NewSpouseDto)
  new_spouse?: NewSpouseDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  start_date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  change_reason?: string;
}