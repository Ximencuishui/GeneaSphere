import { IsString, IsInt, IsOptional, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class GetQuizDto {
  @IsString()
  location!: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  decade?: number;
}

export class SubmitAnswerDto {
  @IsInt()
  @Type(() => Number)
  quizId!: number;

  @IsString()
  answer!: string;
}

export class SubmitQuizAnswersDto {
  @IsString()
  location!: string;

  @IsInt()
  @Type(() => Number)
  decade!: number;

  answers!: { quizId: number; answer: string }[];
}

export class CreateQuizDto {
  @IsString()
  location!: string;

  @IsOptional()
  @IsString()
  region?: string;

  @IsInt()
  @Min(1900)
  @Max(2030)
  @Type(() => Number)
  decade!: number;

  @IsString()
  question!: string;

  @IsOptional()
  @IsString()
  tags?: string;
}

export class CreateAnswerDto {
  @IsInt()
  @Type(() => Number)
  quizId!: number;

  @IsString()
  content!: string;
}

export class MemoryWallQueryDto {
  @IsString()
  location!: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  decade?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  pageSize?: number = 20;
}
