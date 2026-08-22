import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateGenealogyDraftDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  version?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  generation_start?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  generation_end?: number;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsString()
  cover_image_url?: string;
}
