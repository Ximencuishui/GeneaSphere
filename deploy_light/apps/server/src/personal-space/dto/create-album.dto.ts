import { IsString, IsOptional, IsIn, MaxLength } from 'class-validator';

export class CreateAlbumDto {
  @IsString()
  @MaxLength(20)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  description?: string;

  @IsOptional()
  @IsString()
  @IsIn(['self', 'clan', 'lineage', 'public', 'same_location'])
  default_privacy?: string;
}
