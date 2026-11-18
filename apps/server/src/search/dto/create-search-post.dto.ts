import { IsString, IsArray, ArrayMinSize } from 'class-validator';

export class CreateSearchPostDto {
  @IsString()
  origin_place: string;

  @IsArray()
  @ArrayMinSize(1)
  xipai_keywords: string[];

  @IsString()
  contact_info: string;
}
