import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';

export enum ToolType {
  RESTORE = 'restore',
  COLOR = 'color',
  EXPAND = 'expand',
  REMOVE = 'remove',
  COMPOSE = 'compose',
  ENHANCE = 'enhance',
  ANIMATE = 'animate',
}

export class ProcessImageDto {
  @IsEnum(ToolType)
  @IsNotEmpty()
  tool_type: ToolType;

  @IsString()
  @IsNotEmpty()
  @IsUrl({}, { message: 'image_url 必须是有效的 URL' })
  image_url: string;

  @IsOptional()
  @IsString()
  mask_url?: string; // 用于去物功能

  @IsOptional()
  @IsString()
  person_ids?: string; // JSON array of person IDs for compose feature
}
