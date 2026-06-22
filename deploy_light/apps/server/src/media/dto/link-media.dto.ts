import { IsInt } from 'class-validator';

export class LinkMediaDto {
  @IsInt()
  media_id: bigint;

  @IsInt()
  person_id: bigint;
}