import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Matches, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class AutoMatchDto {
  @ApiProperty({ description: '家族 slug（URL 段，例：zhuxi-zupu）' })
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]{0,62}$/, {
    message: 'clan_slug 必须是 a-z / 0-9 / - 组成的短串',
  })
  clan_slug: string;

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
