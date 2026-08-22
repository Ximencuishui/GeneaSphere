import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RejectCrowdsourceSubmissionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}
