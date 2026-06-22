import { IsOptional, IsInt, IsString } from 'class-validator';

export class QueryMediaDto {
  @IsOptional()
  @IsInt()
  taken_year?: number;

  @IsOptional()
  @IsString()
  taken_location?: string;
}