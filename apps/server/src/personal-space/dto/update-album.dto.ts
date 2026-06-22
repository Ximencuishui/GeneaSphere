import { IsOptional, IsString, MaxLength, IsIn } from 'class-validator';

export class UpdateAlbumDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  description?: string;

  @IsOptional()
  @IsString()
  @IsIn(['self', 'clan', 'lineage', 'public', 'same_location'])
  default_privacy?: string;

  @IsOptional()
  @IsString()
  cover_photo_id?: string;
}
