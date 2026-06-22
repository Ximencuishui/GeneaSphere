import { IsArray, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class AllocateCreditsDto {
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  shared_credit_id: bigint;

  @IsString()
  @IsNotEmpty()
  user_id: string;

  @IsNumber()
  @Min(1)
  @Type(() => Number)
  credits: number;
}

export class BatchAllocateCreditsDto {
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  shared_credit_id: bigint;

  @IsArray()
  @IsNotEmpty()
  allocations: {
    user_id: string;
    credits: number;
  }[];
}
