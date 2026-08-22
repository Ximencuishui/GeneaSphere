import { IsString, IsOptional, IsDateString, MaxLength, IsIn } from 'class-validator';

/**
 * 创建众包通知文案
 * POST /api/genealogy/:slug/crowdsource/notices
 */
export class CreateCrowdsourceNoticeDto {
  @IsString()
  @MaxLength(200)
  title: string;

  @IsString()
  @MaxLength(5000)
  content: string;

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