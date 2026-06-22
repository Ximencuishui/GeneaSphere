import { Injectable } from '@nestjs/common';
import { PrismaService } from '@geneasphere/db';

export interface UserCredits {
  free_remaining: number;
  paid_balance: number;
  shared_balance: number;
  total: number;
}

export interface ToolCost {
  cost: number;
  estimatedCost: number;
}

@Injectable()
export class CreditService {
  constructor(private prisma: PrismaService) {}

  getToolCost(toolType: string): ToolCost {
    const baseCosts: Record<string, number> = {
      restore: 1,
      color: 1,
      expand: 1,
      remove: 1,
      compose: 1,
      enhance: 1,
      animate: 3,
    };

    const estimatedCosts: Record<string, number> = {
      restore: 0.12,
      color: 0.05,
      expand: 0.08,
      remove: 0.10,
      compose: 0.22,
      enhance: 0.04,
      animate: 0.45,
    };

    return {
      cost: baseCosts[toolType] || 1,
      estimatedCost: estimatedCosts[toolType] || 0.1,
    };
  }

  async getUserCredits(userId: string): Promise<UserCredits> {
    const prisma = this.prisma as any;
    let credit = await prisma.userCredit.findUnique({
      where: { user_id: userId },
    });

    if (!credit) {
      credit = await prisma.userCredit.create({
        data: {
          user_id: userId,
          free_remaining: 10,
          paid_balance: 0,
        },
      });
    }

    const allocations = await prisma.familyCreditAllocation.findMany({
      where: { user_id: userId },
      include: { shared_credit: true },
    });

    const now = new Date();
    let sharedBalance = 0;
    for (const alloc of allocations) {
      if (alloc.shared_credit.expires_at > now) {
        sharedBalance += alloc.allocated_credits - alloc.used_credits;
      }
    }

    return {
      free_remaining: credit.free_remaining,
      paid_balance: credit.paid_balance,
      shared_balance: sharedBalance,
      total: credit.free_remaining + credit.paid_balance + sharedBalance,
    };
  }

  async checkAndDeductCredits(userId: string, toolType: string): Promise<{
    success: boolean;
    source: 'paid' | 'free' | 'shared';
    remainingCredits: number;
    error?: string;
  }> {
    const prisma = this.prisma as any;
    const { cost } = this.getToolCost(toolType);
    const credits = await this.getUserCredits(userId);

    if (credits.paid_balance >= cost) {
      await prisma.userCredit.update({
        where: { user_id: userId },
        data: { paid_balance: { decrement: cost } },
      });
      return {
        success: true,
        source: 'paid',
        remainingCredits: credits.total - cost,
      };
    }

    const totalWithoutPaid = credits.free_remaining + credits.shared_balance;
    if (totalWithoutPaid >= cost) {
      if (credits.free_remaining >= cost) {
        await prisma.userCredit.update({
          where: { user_id: userId },
          data: { free_remaining: { decrement: cost } },
        });
        return {
          success: true,
          source: 'free',
          remainingCredits: totalWithoutPaid - cost,
        };
      }

      const remainingAfterFree = cost - credits.free_remaining;
      await prisma.userCredit.update({
        where: { user_id: userId },
        data: { free_remaining: 0 },
      });

      await this.deductSharedCredits(userId, remainingAfterFree);

      return {
        success: true,
        source: 'shared',
        remainingCredits: totalWithoutPaid - cost,
      };
    }

    return {
      success: false,
      source: 'free',
      remainingCredits: credits.total,
      error: '余额不足，请购买次数包',
    };
  }

  private async deductSharedCredits(userId: string, amount: number): Promise<void> {
    const prisma = this.prisma as any;
    const allocations = await prisma.familyCreditAllocation.findMany({
      where: { user_id: userId },
      include: { shared_credit: true },
      orderBy: { shared_credit: { expires_at: 'asc' } },
    });

    let remaining = amount;
    for (const alloc of allocations) {
      if (remaining <= 0) break;
      if (alloc.shared_credit.expires_at <= new Date()) continue;

      const available = alloc.allocated_credits - alloc.used_credits;
      if (available <= 0) continue;

      const deduct = Math.min(available, remaining);
      await prisma.$transaction([
        prisma.familyCreditAllocation.update({
          where: { id: alloc.id },
          data: { used_credits: { increment: deduct } },
        }),
        prisma.familySharedCredit.update({
          where: { id: alloc.shared_credit_id },
          data: { used_credits: { increment: deduct } },
        }),
      ]);
      remaining -= deduct;
    }
  }

  async addPaidCredits(userId: string, amount: number): Promise<void> {
    const prisma = this.prisma as any;
    await prisma.userCredit.upsert({
      where: { user_id: userId },
      update: { paid_balance: { increment: amount } },
      create: {
        user_id: userId,
        free_remaining: 10,
        paid_balance: amount,
      },
    });
  }

  async resetMonthlyFreeCredits(): Promise<number> {
    const prisma = this.prisma as any;
    const result = await prisma.userCredit.updateMany({
      data: { free_remaining: 10 },
    });
    return result.count;
  }

  async getUsageHistory(userId: string, limit = 20, offset = 0) {
    const prisma = this.prisma as any;
    const logs = await prisma.toolUsageLog.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      take: limit,
      skip: offset,
    });

    const total = await prisma.toolUsageLog.count({
      where: { user_id: userId },
    });

    return { logs, total };
  }

  async createUsageLog(
    userId: string,
    toolType: string,
    creditsUsed: number,
    estimatedCost: number,
    status: string,
    inputUrl?: string,
    mediaId?: bigint,
  ) {
    const prisma = this.prisma as any;
    return prisma.toolUsageLog.create({
      data: {
        user_id: userId,
        tool_type: toolType,
        credits_used: creditsUsed,
        estimated_cost: estimatedCost,
        status,
        input_url: inputUrl,
        media_id: mediaId,
      },
    });
  }

  async updateUsageLogStatus(logId: bigint, status: string, outputUrl?: string) {
    const prisma = this.prisma as any;
    return prisma.toolUsageLog.update({
      where: { id: logId },
      data: {
        status,
        output_url: outputUrl,
        completed_at: status === 'completed' || status === 'failed' ? new Date() : undefined,
      },
    });
  }
}
