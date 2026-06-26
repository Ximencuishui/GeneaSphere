import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class CreatePeerQrcodeDto {
  @ApiProperty({ description: '家族 slug（URL 段）' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9][a-z0-9-]{0,62}$/, {
    message: 'clan_slug 必须是 a-z / 0-9 / - 组成的短串',
  })
  clan_slug: string;

  @ApiProperty({ description: '被邀请人手机号（可选）', required: false })
  @IsOptional()
  @IsString()
  target_phone?: string;
}
