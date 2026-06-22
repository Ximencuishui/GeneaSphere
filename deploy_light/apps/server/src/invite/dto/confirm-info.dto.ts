import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class ConfirmInfoDto {
  @ApiProperty({ description: '会话 ID' })
  @IsString()
  session_id: string;

  @ApiProperty({ description: '家族中已有的人物 ID（已有数据场景）', required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  person_id?: number;

  @ApiProperty({ description: '全量待确认信息（修改时可一起回传）', required: false })
  @IsOptional()
  confirmed_payload?: {
    full_name?: string;
    gender?: string;
    birth_year?: number;
    father_name?: string;
    mother_name?: string;
    spouse_name?: string;
    children_names?: string[];
  };
}
