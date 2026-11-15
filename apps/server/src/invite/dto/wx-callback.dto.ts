import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class WxCallbackDto {
  @ApiProperty({ description: '微信授权 code' })
  @IsString()
  code: string;
}
