import { IsNumber } from 'class-validator';

export class MoveSubTreeDto {
  @IsNumber()
  subtree_root_id: bigint;

  @IsNumber()
  new_parent_id: bigint;
}
