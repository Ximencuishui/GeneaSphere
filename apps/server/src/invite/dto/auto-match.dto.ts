import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class AutoMatchDto {
  @ApiProperty({ description: '家族 ID' })
  @Type(() => Number)
  @IsInt()
  clan_id: number;

  @ApiProperty({ description: '姓名' })
  @IsString()
  full_name: string;

  @ApiProperty({ description: '父亲姓名', required: false })
  @IsOptional()
  @IsString()
  father_name?: string;

  @ApiProperty({ description: '出生年份', required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1500)
  @Max(new Date().getFullYear())
  birth_year?: number;
}
