import { IsOptional, IsString, IsInt, Min, Max, MaxLength, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateClanMigrationVideoDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1000)
  @Max(9999)
  start_year?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1000)
  @Max(9999)
  end_year?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  branch_filter?: string;

  @IsOptional()
  @IsIn(['nostalgic', 'modern', 'solemn'])
  style?: string;
}
