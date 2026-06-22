import { IsOptional, IsString, IsIn, IsNumber, MaxLength, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdatePhotoDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  location_name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Max(new Date().getFullYear())
  taken_year?: number;

  @IsOptional()
  @IsString()
  taken_date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  description?: string;

  @IsOptional()
  @IsString()
  @IsIn(['self', 'clan', 'lineage', 'public', 'same_location'])
  privacy?: string;
}
