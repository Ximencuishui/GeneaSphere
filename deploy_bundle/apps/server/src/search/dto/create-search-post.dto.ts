import { IsString, IsArray, ArrayMinSize, IsOptional } from 'class-validator';

export class CreateSearchPostDto {
  @IsString()
  origin_place: string;

  @IsArray()
  @ArrayMinSize(1)
  xipai_keywords: string[];

  @IsString()
  contact_info: string;

  @IsOptional()
  @IsString()
  created_by?: string;
}
