import { IsArray, IsEnum, IsOptional, IsString, IsInt, IsDateString, Matches, MaxLength, Min, Max } from 'class-validator';
import { Transform, Type } from 'class-transformer';
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

  /** 诞辰/逝世去重用。必须是本族人物；不传则不写 person_id。 */
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null || value === '' ? undefined : String(value)))
  @IsString()
  @Matches(/^\d+$/, { message: 'person_id 必须是数字' })
  person_id?: string;

  /**
   * 元素可以是数字或数字字符串，去重和本族校验在 FamilyEventService。
   * 空数组允许。
   */
  @IsOptional()
  @IsArray({ message: 'media_ids 必须是数组' })
  media_ids?: Array<number | string>;
}
