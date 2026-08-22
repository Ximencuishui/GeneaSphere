import { IsString, IsOptional, IsDateString, MaxLength, IsIn } from 'class-validator';

/**
 * 更新众包通知文案（PUT /api/genealogy/:slug/crowdsource/notices/:id）
 * 字段均为可选，仅传需要修改的字段。
 */
export class UpdateCrowdsourceNoticeDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  content?: string;

  @IsOptional()
  @IsDateString()
  start_at?: string;

  @IsOptional()
  @IsDateString()
  end_at?: string;

  @IsOptional()
  @IsIn(['draft', 'sent', 'closed'])
  status?: 'draft' | 'sent' | 'closed';
}