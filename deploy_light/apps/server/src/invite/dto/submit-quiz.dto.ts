import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsInt, IsString, ValidateNested, ArrayMinSize, ArrayMaxSize, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class QuizSingleAnswer {
  @ApiProperty({ description: '题目 ID' })
  @Type(() => Number)
  @IsInt()
  attempt_id: number;

  @ApiProperty({ description: '用户选择的答案（与 correct_answer 对应）' })
  @IsString()
  answer: string;
}

export class SubmitQuizDto {
  @ApiProperty({ description: '答题列表', type: [QuizSingleAnswer] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => QuizSingleAnswer)
  answers: QuizSingleAnswer[];

  @ApiProperty({ description: '本套题重抽次数（用于控制最多 3 次）', required: false })
  @IsOptional()
  @IsInt()
  retry_round?: number;
}
