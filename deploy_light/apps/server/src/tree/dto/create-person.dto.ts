import { IsString, IsEnum, IsOptional, IsBoolean, IsDateString, IsNumber } from 'class-validator';

export enum Gender {
  male = 'male',
  female = 'female',
}

export class CreatePersonDto {
  @IsNumber()
  clan_id: bigint;

  @IsString()
  full_name: string;

  @IsEnum(Gender)
  gender: Gender;

  @IsOptional()
  @IsDateString()
  birth_date?: Date;

  @IsOptional()
  @IsDateString()
  death_date?: Date;

  @IsOptional()
  @IsBoolean()
  is_living?: boolean;

  @IsOptional()
  @IsNumber()
  parent_id?: bigint;
}
