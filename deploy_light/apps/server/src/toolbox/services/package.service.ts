import { Injectable } from '@nestjs/common';
import { PrismaService } from '@geneasphere/db';
import { PACKAGES_CONFIG, PACKAGE_VALIDITY_YEARS, PackageType } from '../dto/purchase-package.dto';

@Injectable()
export class PackageService {
  constructor(private prisma: PrismaService) {}

  getAvailablePackages() {
    return PACKAGES_CONFIG.map(pkg => ({
      type: pkg.type,
      size: pkg.size,
      price: pkg.price,
      label: pkg.label,
      pricePerUnit: pkg.pricePerUnit,
      validityYears: PACKAGE_VALIDITY_YEARS,
    }));
  }

  getPackageConfig(type: string) {
    return PACKAGES_CONFIG.find(pkg => pkg.type === type);
  }

  async purchasePackage(userId: string, packageType: PackageType, paidAmount: number) {
    const prisma = this.prisma as any;
    const config = this.getPackageConfig(packageType);
    if (!config) {
      throw new Error('无效的次数包类型');
    }

    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + PACKAGE_VALIDITY_YEARS);

    const purchaseLog = await prisma.creditPurchaseLog.create({
      data: {
        user_id: userId,
        package_size: config.size,
        package_type: packageType,
        amount: paidAmount,
        expires_at: expiresAt,
      },
    });

    await prisma.userCredit.upsert({
      where: { user_id: userId },
      update: { paid_balance: { increment: config.size } },
      create: {
        user_id: userId,
        free_remaining: 10,
        paid_balance: config.size,
      },
    });

    return {
      success: true,
      purchaseId: purchaseLog.id,
      packageSize: config.size,
      expiresAt,
      message: `成功购买${config.label}，有效期至${expiresAt.toLocaleDateString()}`,
    };
  }

  async getPurchaseHistory(userId: string) {
    const prisma = this.prisma as any;
    return prisma.creditPurchaseLog.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
    });
  }

  async purchaseFamilyPackage(clanId: bigint, userId: string, packageType: PackageType, paidAmount: number) {
    const prisma = this.prisma as any;
    const config = this.getPackageConfig(packageType);
    if (!config) {
      throw new Error('无效的次数包类型');
    }

    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + PACKAGE_VALIDITY_YEARS);

    const sharedPackage = await prisma.familySharedCredit.create({
      data: {
        clan_id: clanId,
        package_size: config.size,
        used_credits: 0,
        remaining_credits: config.size,
        expires_at: expiresAt,
        created_by: userId,
        amount: paidAmount,
      },
    });

    return {
      success: true,
      packageId: sharedPackage.id,
      packageSize: config.size,
      expiresAt,
      message: `成功购买${config.label}家族共享包`,
    };
  }

  async getFamilyPackages(clanId: bigint) {
    const prisma = this.prisma as any;
    const packages = await prisma.familySharedCredit.findMany({
      where: { clan_id: clanId },
      orderBy: { purchased_at: 'desc' },
    });

    return packages.map(pkg => ({
      id: pkg.id,
      packageSize: pkg.package_size,
      usedCredits: pkg.used_credits,
      remainingCredits: pkg.remaining_credits,
      purchasedAt: pkg.purchased_at,
      expiresAt: pkg.expires_at,
      isActive: pkg.expires_at > new Date() && pkg.remaining_credits > 0,
    }));
  }

  async allocateCredits(sharedCreditId: bigint, userId: string, credits: number) {
    const prisma = this.prisma as any;

    // 验证分配数量为正数
    if (credits <= 0) {
      throw new Error('分配的次数必须大于0');
    }

    const sharedCredit = await prisma.familySharedCredit.findUnique({
      where: { id: sharedCreditId },
    });

    if (!sharedCredit) {
      throw new Error('共享包不存在');
    }

    if (sharedCredit.expires_at <= new Date()) {
      throw new Error('共享包已过期');
    }

    // 检查剩余额度是否足够（包括新分配后是否超限）
    if (sharedCredit.remaining_credits < credits) {
      throw new Error(`共享包剩余次数不足，当前剩余 ${sharedCredit.remaining_credits} 次`);
    }

    const existingAllocation = await prisma.familyCreditAllocation.findUnique({
      where: {
        shared_credit_id_user_id: {
          shared_credit_id: sharedCreditId,
          user_id: userId,
        },
      },
    });

    if (existingAllocation) {
      const newAllocated = existingAllocation.allocated_credits + credits;
      const actualIncrease = Math.min(credits, sharedCredit.remaining_credits);

      await prisma.$transaction([
        prisma.familyCreditAllocation.update({
          where: { id: existingAllocation.id },
          data: { allocated_credits: newAllocated },
        }),
        prisma.familySharedCredit.update({
          where: { id: sharedCreditId },
          data: {
            used_credits: { increment: actualIncrease },
            remaining_credits: { decrement: actualIncrease },
          },
        }),
      ]);
    } else {
      await prisma.$transaction([
        prisma.familyCreditAllocation.create({
          data: {
            shared_credit_id: sharedCreditId,
            user_id: userId,
            allocated_credits: credits,
            used_credits: 0,
          },
        }),
        prisma.familySharedCredit.update({
          where: { id: sharedCreditId },
          data: {
            used_credits: { increment: credits },
            remaining_credits: { decrement: credits },
          },
        }),
      ]);
    }

    return {
      success: true,
      message: `成功分配${credits}次给成员`,
    };
  }

  async getMemberAllocations(sharedCreditId: bigint) {
    const prisma = this.prisma as any;
    const allocations = await prisma.familyCreditAllocation.findMany({
      where: { shared_credit_id: sharedCreditId },
      include: { shared_credit: true },
    });

    return allocations.map(alloc => ({
      userId: alloc.user_id,
      allocatedCredits: alloc.allocated_credits,
      usedCredits: alloc.used_credits,
      remainingCredits: alloc.allocated_credits - alloc.used_credits,
      createdAt: alloc.created_at,
    }));
  }

  async getUserSharedAllocations(userId: string) {
    const prisma = this.prisma as any;
    const allocations = await prisma.familyCreditAllocation.findMany({
      where: { user_id: userId },
      include: { shared_credit: true },
    });

    const now = new Date();
    return allocations
      .filter(alloc => alloc.shared_credit.expires_at > now)
      .map(alloc => ({
        packageId: alloc.shared_credit_id,
        clanId: alloc.shared_credit.clan_id,
        allocatedCredits: alloc.allocated_credits,
        usedCredits: alloc.used_credits,
        remainingCredits: alloc.allocated_credits - alloc.used_credits,
        expiresAt: alloc.shared_credit.expires_at,
      }));
  }
}
