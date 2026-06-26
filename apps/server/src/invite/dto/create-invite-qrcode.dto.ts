import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateInviteQrcodeDto {
  @ApiProperty({ description: '家族 slug（URL 段，例：zhuxi-zupu）' })
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]{0,62}$/, {
    message: 'clan_slug 必须是 a-z / 0-9 / - 组成的短串',
  })
  clan_slug: string;

  @ApiProperty({ description: '有效期天数（1-30）', default: 7, required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  expire_days?: number;
}
