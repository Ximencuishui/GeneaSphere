import { IsNumber } from 'class-validator';

/**
 * 血缘预检 DTO
 * - 检查两人是否有共同祖先（不创建任何数据）
 * - 由前端在「创建婚姻」提交前调用做软校验
 */
export class CheckKinshipDto {
  @IsNumber()
  person_a_id: bigint;

  @IsNumber()
  person_b_id: bigint;
}