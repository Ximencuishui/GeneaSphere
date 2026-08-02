import { IsOptional, IsInt, IsString } from 'class-validator';

export class UploadMediaDto {
  @IsInt()
  clan_id: number;

  @IsString()
  uploader_id: string;

  @IsOptional()
  @IsInt()
  taken_year?: number;

  @IsOptional()
  @IsString()
  taken_location?: string;

  @IsOptional()
  @IsString()
  description?: string;
}