import { ArrayMinSize, IsArray, IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class FinalizeGenealogyDto {
  @IsString()
  @MaxLength(200)
  version_name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsDateString()
  finalized_at?: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  editors!: string[];
}
