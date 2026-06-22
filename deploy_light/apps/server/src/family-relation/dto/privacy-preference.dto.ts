import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdatePrivacyPreferenceDto {
  @ApiPropertyOptional({ description: '历史婚姻记录是否对全族可见' })
  @IsOptional()
  @IsBoolean()
  share_marriage_history?: boolean;

  @ApiPropertyOptional({ description: '子女抚养细节是否对全族可见' })
  @IsOptional()
  @IsBoolean()
  share_custody_details?: boolean;

  @ApiPropertyOptional({ description: '是否显示子女亲生状态（仅本人+管理员可见）' })
  @IsOptional()
  @IsBoolean()
  show_biological_status?: boolean;

  @ApiPropertyOptional({ description: '是否启用家庭关系变更通知' })
  @IsOptional()
  @IsBoolean()
  enable_change_notifications?: boolean;
}