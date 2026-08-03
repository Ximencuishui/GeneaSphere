import { IsNumber, IsOptional, IsString } from 'class-validator';

export class FindByPhotoDto {
  @IsOptional()
  @IsNumber()
  media_id?: number;

  @IsOptional()
  @IsNumber()
  taken_year?: number;

  @IsOptional()
  @IsString()
  taken_location?: string;
}
