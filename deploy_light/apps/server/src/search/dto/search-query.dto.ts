import { IsString, IsOptional } from 'class-validator';

export class SearchQueryDto {
  @IsString()
  query: string;

  @IsOptional()
  @IsString()
  origin_place?: string;
}
