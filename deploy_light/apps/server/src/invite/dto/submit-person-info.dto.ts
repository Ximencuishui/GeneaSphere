import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, IsOptional, Max, Min } from 'class-validator';

export class SubmitPersonInfoDto {
  @ApiProperty({ description: '会话 ID' })
  @IsString()
  session_id: string;

  @ApiProperty({ description: '姓名' })
  @IsString()
  full_name: string;

  @ApiProperty({ description: '性别：male/female' })
  @IsString()
  gender: string;

  @ApiProperty({ description: '出生年份', required: false })
  @IsOptional()
  @IsInt()
  @Min(1500)
  @Max(new Date().getFullYear())
  birth_year?: number;

  @ApiProperty({ description: '父亲姓名', required: false })
  @IsOptional()
  @IsString()
  father_name?: string;

  @ApiProperty({ description: '母亲姓名', required: false })
  @IsOptional()
  @IsString()
  mother_name?: string;

  @ApiProperty({ description: '配偶姓名', required: false })
  @IsOptional()
  @IsString()
  spouse_name?: string;

  @ApiProperty({ description: '子女姓名列表', required: false, type: [String] })
  @IsOptional()
  @IsString({ each: true })
  children_names?: string[];
}
