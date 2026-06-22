import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class WxCallbackDto {
  @ApiProperty({ description: '微信授权 code（Mock 时可传 mock）' })
  @IsString()
  code: string;

  @ApiProperty({ description: '模拟手机号（Mock 场景）', required: false })
  @IsOptional()
  @IsString()
  mock_phone?: string;

  @ApiProperty({ description: '模拟昵称（Mock 场景）', required: false })
  @IsOptional()
  @IsString()
  mock_nickname?: string;
}
