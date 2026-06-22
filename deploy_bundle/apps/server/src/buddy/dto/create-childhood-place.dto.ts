import { IsOptional, IsString, IsNumber, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateChildhoodPlaceDto {
  @IsString()
  location_name: string;

  @IsOptional()
  @IsNumber()
  lat?: number;

  @IsOptional()
  @IsNumber()
  lng?: number;

  @IsNumber()
  start_age: number;

  @IsNumber()
  end_age: number;

  @IsOptional()
  @IsString()
  period_description?: string;
}
