import { IsOptional, IsString, IsInt, Min, Max, MaxLength, IsIn, IsArray } from 'class-validator';
import { Type } from 'class-transformer';
import { FamilyEventType } from '@prisma/client';

export class CreateClanEventVideoDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1000)
  @Max(9999)
  start_year?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1000)
  @Max(9999)
  end_year?: number;

  @IsOptional()
  @IsArray()
  event_type_filter?: FamilyEventType[];

  @IsOptional()
  @IsIn(['nostalgic', 'modern', 'solemn'])
  style?: string;
}
