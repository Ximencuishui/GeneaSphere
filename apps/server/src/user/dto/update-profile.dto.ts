import {
  IsOptional,
  IsString,
  MaxLength,
  IsEmail,
  IsIn,
  IsDateString,
} from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  nickname?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(100)
  email?: string;

  @IsOptional()
  @IsIn(['male', 'female'])
  gender?: 'male' | 'female';

  @IsOptional()
  @IsDateString()
  birth_date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatar_url?: string;
}