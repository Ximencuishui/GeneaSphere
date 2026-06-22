import { IsString, IsIn } from 'class-validator';

export class RespondMatchDto {
  @IsString()
  @IsIn(['accept', 'decline', 'ignore'])
  action: 'accept' | 'decline' | 'ignore';
}
