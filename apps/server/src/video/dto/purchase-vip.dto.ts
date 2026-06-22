import { IsString, IsNumber, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PurchaseVipDto {
  @ApiProperty({ description: 'VIP订单类型', enum: ['single', 'monthly', 'yearly'] })
  @IsString()
  @IsIn(['single', 'monthly', 'yearly'])
  order_type: 'single' | 'monthly' | 'yearly';

  @ApiProperty({ description: '支付金额' })
  @IsNumber()
  amount: number;
}
