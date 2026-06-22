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

export class AddChildPersonDto {
  @ApiProperty()
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

  @ApiProperty({ description: '父亲信息暂未录入' })
  @IsBoolean()
  father_info_missing: boolean;

  @ApiProperty({ description: '母亲信息暂未录入' })
  @IsBoolean()
  mother_info_missing: boolean;
}

export class AddChildDto {
  @ApiProperty({ description: '父/母的 person_id（变更主体）' })
  @IsString()
  parent_person_id: string;

  @ApiProperty({ type: AddChildPersonDto })
  @IsObject()
  @ValidateNested()
  @Type(() => AddChildPersonDto)
  child: AddChildPersonDto;

  @ApiProperty({ enum: ['living_with', 'not_living_with', 'joint'] })
  @IsIn(['living_with', 'not_living_with', 'joint'])
  custody: 'living_with' | 'not_living_with' | 'joint';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  change_reason?: string;
}