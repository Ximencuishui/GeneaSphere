import { IsOptional, IsString, IsNumber } from 'class-validator';

export class ClaimPhotoDto {
  @IsNumber()
  media_id: number;

  @IsOptional()
  @IsString()
  position_description?: string;
}
