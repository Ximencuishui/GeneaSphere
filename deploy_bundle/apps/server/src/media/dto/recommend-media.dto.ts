import { IsInt, IsString, IsOptional } from 'class-validator';

export class RecommendMediaDto {
  @IsInt()
  currentClanId: bigint;

  @IsString()
  location: string;

  @IsOptional()
  @IsInt()
  takenYear?: number;
}