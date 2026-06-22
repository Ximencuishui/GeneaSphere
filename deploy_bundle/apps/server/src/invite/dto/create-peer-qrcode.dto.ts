import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class CreatePeerQrcodeDto {
  @ApiProperty({ description: '家族 ID' })
  @IsString()
  @IsNotEmpty()
  clan_id: string;

  @ApiProperty({ description: '被邀请人手机号（可选）', required: false })
  @IsOptional()
  @IsString()
  target_phone?: string;
}
