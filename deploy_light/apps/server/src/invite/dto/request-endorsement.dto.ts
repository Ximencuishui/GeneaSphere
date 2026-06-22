import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class RequestEndorsementDto {
  @ApiProperty({ description: '被背书人手机号或姓名' })
  @IsString()
  @IsNotEmpty()
  endorser_key: string;
}
