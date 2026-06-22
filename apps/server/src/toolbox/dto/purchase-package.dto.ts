import { IsEnum, IsNotEmpty, IsNumber, IsPositive, Min } from 'class-validator';
import { Type } from 'class-transformer';

export enum PackageType {
  SINGLE = 'single',
  TEN = 'ten',
  FIFTY = 'fifty',
  TWO_HUNDRED = 'two_hundred',
  THOUSAND = 'thousand',
}

export const PACKAGES_CONFIG = [
  { type: PackageType.SINGLE, size: 1, price: 2.9, label: '单次包', pricePerUnit: 2.9 },
  { type: PackageType.TEN, size: 10, price: 19.9, label: '10次包', pricePerUnit: 1.99 },
  { type: PackageType.FIFTY, size: 50, price: 79.9, label: '50次包', pricePerUnit: 1.60 },
  { type: PackageType.TWO_HUNDRED, size: 200, price: 249.9, label: '200次包', pricePerUnit: 1.25 },
  { type: PackageType.THOUSAND, size: 1000, price: 999.9, label: '1000次包', pricePerUnit: 1.00 },
];

export const PACKAGE_PRICES: Record<PackageType, number> = {
  [PackageType.SINGLE]: 2.9,
  [PackageType.TEN]: 19.9,
  [PackageType.FIFTY]: 79.9,
  [PackageType.TWO_HUNDRED]: 249.9,
  [PackageType.THOUSAND]: 999.9,
};

export const PACKAGE_VALIDITY_YEARS = 2; // 有效期2年

export class PurchasePackageDto {
  @IsEnum(PackageType)
  @IsNotEmpty()
  package_type: PackageType;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  amount: number; // 支付金额
}
