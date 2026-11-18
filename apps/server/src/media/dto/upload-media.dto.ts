import { IsOptional, IsInt, IsString, IsNumber, Min, Max } from 'class-validator';

export class UploadMediaDto {
  @IsInt()
  clan_id: number;

  @IsOptional()
  @IsString()
  uploader_id?: string;

  @IsOptional()
  @IsInt()
  taken_year?: number;

  @IsOptional()
  @IsString()
  taken_location?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsInt()
  album_id?: number;

  @IsOptional()
  @IsString()
  privacy_level?: string;

  @IsOptional()
  @IsString()
  taken_on?: string;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;
}