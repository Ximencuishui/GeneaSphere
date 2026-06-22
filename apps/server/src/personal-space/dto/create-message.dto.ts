import { IsString, IsOptional, IsIn, MaxLength } from 'class-validator';

export class CreateMessageDto {
  @IsString()
  @MaxLength(200)
  content: string;

  @IsOptional()
  @IsString()
  @IsIn(['self', 'clan', 'lineage', 'public', 'same_location'])
  privacy?: string;
}
