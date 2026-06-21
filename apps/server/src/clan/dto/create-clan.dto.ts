import { IsString, IsOptional, IsObject } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO for creating a new clan
 */
export class CreateClanDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsObject()
  settings_json?: any;
}

/**
 * DTO for updating a clan
 */
export class UpdateClanDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsObject()
  settings_json?: any;
}
