import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateInviteQrcodeDto {
  @ApiProperty({ description: '家族 ID' })
  @Type(() => Number)
  @IsInt()
  clan_id: number;

  @ApiProperty({ description: '有效期天数（1-30）', default: 7, required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  expire_days?: number;
}
