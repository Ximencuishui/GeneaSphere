import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateCustodyDto {
  @ApiProperty({ description: '子女 person_id' })
  @IsString()
  child_id: string;

  @ApiProperty({ enum: ['living_with', 'not_living_with', 'joint'] })
  @IsIn(['living_with', 'not_living_with', 'joint'])
  custody_status: 'living_with' | 'not_living_with' | 'joint';

  @ApiPropertyOptional({ description: '是否亲生（仅本人+管理员可见）' })
  @IsOptional()
  @IsBoolean()
  is_biological?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  change_reason?: string;
}