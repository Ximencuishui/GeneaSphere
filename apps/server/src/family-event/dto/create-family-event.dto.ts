import { IsEnum, IsOptional, IsString, IsInt, IsDateString, MaxLength, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { FamilyEventType } from '@prisma/client';

export class CreateFamilyEventDto {
  @IsString()
  @MaxLength(100)
  event_name!: string;

  @IsEnum(FamilyEventType, { message: 'event_type 必须是有效的家族事件类型' })
  event_type!: FamilyEventType;

  @IsOptional()
  @IsDateString({}, { message: 'event_date 必须是 ISO 日期格式' })
  event_date?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(9999)
  event_year?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  media_ids?: number[];
}
