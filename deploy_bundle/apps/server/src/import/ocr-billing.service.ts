import {
  Injectable,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { PrismaService } from '@geneasphere/db';

/**
 * 计费配置（从环境变量读取，支持运行时调整）
 */
function envInt(name: string, def: number): number {
  const v = process.env[name];
  if (!v) return def;
  const n = parseInt(v, 10);
  return isNaN(n) ? def : n;
}
function envFloat(name: string, def: number): number {
  const v = process.env[name];
  if (!v) return def;
  const n = parseFloat(v);
  return isNaN(n) ? def : n;
}

export interface OcrQuota {
  free_pages_total: number;
  free_pages_used: number;
  free_pages_remaining: number;
  free_chars_total: number;
  free_chars_used: number;
  free_chars_remaining: number;
  paid_balance: number;
  price_per_page: number;
  price_per_100_chars: number;
  ocr_reset_date: string;
  provider: string;
}

export interface OcrPrecheckResult {
  estimated_fee: number;
  estimated_chargeable_pages: number;
  estimated_free_pages_used: number;
  current_paid_balance: number;
  sufficient: boolean;
  message?: string;
}

export interface OcrChargeParams {
  taskId: string;
  pages: number;
  totalChars: number;
}

export interface OcrFeeDetail {
  pages_total: number;
  chars_total: number;
  free_pages_used: number;
  free_chars_used: number;
  charged_pages: number;
  charged_chars: number;
  fee_amount: number;
  fee_source: 'free' | 'paid' | 'mixed';
  paid_balance_after?: number;
}

export interface OcrUsageLogItem {
  id: string;
  task_id: string | null;
  pages_total: number;
  chars_total: number;
  free_pages_used: number;
  free_chars_used: number;
  charged_pages: number;
  charged_chars: number;
  fee_amount: number;
  fee_source: string;
  status: string;
  created_at: Date;
}

/**
 * OCR 计费服务（v1.0 限免与计费策略）
 * - 月度免费额度：10 页 / 1000 字（先达到者为准）
 * - 计费单价：¥0.50/页，¥0.05/百字（不足 1 页按 1 页计，不足 100 字按 100 字计）
 * - 月度重置：懒加载（首次读取时检测跨自然月）
 * - 扣费失败：抛 402，状态 INSUFFICIENT_BALANCE
 */
@Injectable()
export class OcrBillingService {
  private readonly logger = new Logger(OcrBillingService.name);

  readonly FREE_PAGES: number;
  readonly FREE_CHARS: number;
  readonly PRICE_PER_PAGE: number;
  readonly PRICE_PER_100_CHARS: number;

  constructor(private readonly prisma: PrismaService) {
    this.FREE_PAGES = envInt('OCR_FREE_PAGES', 10);
    this.FREE_CHARS = envInt('OCR_FREE_CHARS', 1000);
    this.PRICE_PER_PAGE = envFloat('OCR_PRICE_PER_PAGE', 0.5);
    this.PRICE_PER_100_CHARS = envFloat('OCR_PRICE_PER_100_CHARS', 0.05);
  }

  /**
   * 获取或创建用户 credit 记录（懒加载重置后返回最新）
   */
  private async getOrCreateCredit(userId: string) {
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
          ocr_pages_used: 0,
          ocr_chars_used: 0,
          ocr_reset_date: this.todayDate(),
        },
      });
    }
    return credit;
  }

  /**
   * 懒加载月度重置（跨自然月时重置 ocr_pages_used/chars_used）
   */
  private async ensureMonthlyReset(userId: string) {
    const prisma = this.prisma as any;
    const credit = await this.getOrCreateCredit(userId);
    const resetDate = new Date(credit.ocr_reset_date);
    const now = new Date();
    const sameMonth =
      resetDate.getFullYear() === now.getFullYear() &&
      resetDate.getMonth() === now.getMonth();
    if (sameMonth) return credit;

    this.logger.log(
      `用户 ${userId} 跨月重置 OCR 免费额度：${resetDate.toISOString()} -> ${this.todayDate()}`,
    );
    return prisma.userCredit.update({
      where: { user_id: userId },
      data: {
        ocr_pages_used: 0,
        ocr_chars_used: 0,
        ocr_reset_date: this.todayDate(),
      },
    });
  }

  /**
   * 查询 OCR 额度（含懒加载重置）
   */
  async getOcrQuota(userId: string): Promise<OcrQuota> {
    const credit = await this.ensureMonthlyReset(userId);
    const resetDateStr = new Date(credit.ocr_reset_date)
      .toISOString()
      .substring(0, 10);
    return {
      free_pages_total: this.FREE_PAGES,
      free_pages_used: credit.ocr_pages_used,
      free_pages_remaining: Math.max(
        0,
        this.FREE_PAGES - credit.ocr_pages_used,
      ),
      free_chars_total: this.FREE_CHARS,
      free_chars_used: credit.ocr_chars_used,
      free_chars_remaining: Math.max(
        0,
        this.FREE_CHARS - credit.ocr_chars_used,
      ),
      paid_balance: credit.paid_balance,
      price_per_page: this.PRICE_PER_PAGE,
      price_per_100_chars: this.PRICE_PER_100_CHARS,
      ocr_reset_date: resetDateStr,
      provider: process.env.OCR_PROVIDER || 'auto',
    };
  }

  /**
   * OCR 前预检（仅按页数估算，OCR 之前无法预知字数）
   */
  async precheckCost(
    userId: string,
    pages: number,
  ): Promise<OcrPrecheckResult> {
    const credit = await this.ensureMonthlyReset(userId);
    const freePagesLeft = Math.max(0, this.FREE_PAGES - credit.ocr_pages_used);
    const freePagesUsed = Math.min(pages, freePagesLeft);
    const chargeablePages = Math.max(0, pages - freePagesLeft);
    const estimatedFee = this.roundMoney(chargeablePages * this.PRICE_PER_PAGE);
    return {
      estimated_fee: estimatedFee,
      estimated_chargeable_pages: chargeablePages,
      estimated_free_pages_used: freePagesUsed,
      current_paid_balance: credit.paid_balance,
      sufficient: credit.paid_balance >= estimatedFee,
      message:
        estimatedFee === 0
          ? '本次全部走免费额度'
          : `预计扣费 ¥${estimatedFee.toFixed(2)}`,
    };
  }

  /**
   * OCR 完成后调用：结算费用 + 更新额度 + 记录日志
   * 必须保证 totalChars 已统计完整（中文字符数）
   */
  async chargeAfterOcr(
    userId: string,
    params: OcrChargeParams,
  ): Promise<OcrFeeDetail> {
    const prisma = this.prisma as any;
    const { taskId, pages, totalChars } = params;

    // 再次懒加载重置（确保跨任务时也能正确重置）
    const credit = await this.ensureMonthlyReset(userId);

    // 算法（与需求文档 4.2 一致）
    const freePagesLeft = Math.max(0, this.FREE_PAGES - credit.ocr_pages_used);
    const actualFreePagesUsed = Math.min(pages, freePagesLeft);
    const chargedPages = Math.max(0, pages - actualFreePagesUsed);

    const freeCharsLeft = Math.max(0, this.FREE_CHARS - credit.ocr_chars_used);
    const actualFreeCharsUsed = Math.min(totalChars, freeCharsLeft);
    const chargedChars = Math.max(0, totalChars - actualFreeCharsUsed);

    // 不足 100 字按 100 字计
    const chargedHundredChars = Math.ceil(chargedChars / 100);
    const pageFee = this.roundMoney(chargedPages * this.PRICE_PER_PAGE);
    const charFee = this.roundMoney(
      chargedHundredChars * this.PRICE_PER_100_CHARS,
    );
    const fee = this.roundMoney(pageFee + charFee);

    if (fee > credit.paid_balance) {
      throw new HttpException(
        {
          success: false,
          error: 'INSUFFICIENT_BALANCE',
          message: `OCR 余额不足：本次需 ¥${fee.toFixed(2)}，当前余额 ¥${credit.paid_balance.toFixed(2)}`,
          required: fee,
          current: credit.paid_balance,
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    const feeSource: 'free' | 'paid' | 'mixed' =
      fee === 0 ? 'free' : chargedPages + chargedChars > 0 ? 'mixed' : 'paid';
    // 修正语义：实际只需区分"是否扣了费"
    const finalFeeSource: 'free' | 'paid' | 'mixed' =
      fee === 0
        ? 'free'
        : (actualFreePagesUsed > 0 || actualFreeCharsUsed > 0) && fee > 0
          ? 'mixed'
          : 'paid';

    // 事务：扣余额 + 更新额度 + 写日志
    const [updatedCredit, log] = await prisma.$transaction([
      prisma.userCredit.update({
        where: { user_id: userId },
        data: {
          paid_balance: { decrement: fee },
          ocr_pages_used: { increment: actualFreePagesUsed },
          ocr_chars_used: { increment: actualFreeCharsUsed },
        },
      }),
      prisma.ocrUsageLog.create({
        data: {
          user_id: userId,
          task_id: taskId || null,
          pages_total: pages,
          chars_total: totalChars,
          free_pages_used: actualFreePagesUsed,
          free_chars_used: actualFreeCharsUsed,
          charged_pages: chargedPages,
          charged_chars: chargedChars,
          fee_amount: fee,
          fee_source: finalFeeSource,
          status: 'completed',
        },
      }),
    ]);

    this.logger.log(
      `OCR 计费完成 user=${userId} pages=${pages} chars=${totalChars} ` +
        `free_p=${actualFreePagesUsed} free_c=${actualFreeCharsUsed} ` +
        `charged_p=${chargedPages} charged_c=${chargedChars} fee=¥${fee.toFixed(2)}`,
    );

    return {
      pages_total: pages,
      chars_total: totalChars,
      free_pages_used: actualFreePagesUsed,
      free_chars_used: actualFreeCharsUsed,
      charged_pages: chargedPages,
      charged_chars: chargedChars,
      fee_amount: fee,
      fee_source: finalFeeSource,
      paid_balance_after: updatedCredit.paid_balance,
    };
  }

  /**
   * OCR 失败时记录（不扣费、不消耗免费额度）
   */
  async recordFailure(
    userId: string,
    taskId: string,
    reason: string,
  ): Promise<void> {
    const prisma = this.prisma as any;
    await prisma.ocrUsageLog.create({
      data: {
        user_id: userId,
        task_id: taskId,
        pages_total: 0,
        chars_total: 0,
        free_pages_used: 0,
        free_chars_used: 0,
        charged_pages: 0,
        charged_chars: 0,
        fee_amount: 0,
        fee_source: 'free',
        status: 'failed',
      },
    });
    this.logger.warn(`OCR 失败记录 user=${userId} task=${taskId}: ${reason}`);
  }

  /**
   * 查询用户 OCR 使用记录
   */
  async listUsage(
    userId: string,
    page = 1,
    pageSize = 20,
  ): Promise<{ data: OcrUsageLogItem[]; total: number }> {
    const prisma = this.prisma as any;
    const skip = (page - 1) * pageSize;
    const [logs, total] = await Promise.all([
      prisma.ocrUsageLog.findMany({
        where: { user_id: userId },
        orderBy: { created_at: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.ocrUsageLog.count({ where: { user_id: userId } }),
    ]);
    return {
      data: logs.map((l: any) => ({
        id: l.id.toString(),
        task_id: l.task_id,
        pages_total: l.pages_total,
        chars_total: l.chars_total,
        free_pages_used: l.free_pages_used,
        free_chars_used: l.free_chars_used,
        charged_pages: l.charged_pages,
        charged_chars: l.charged_chars,
        fee_amount: Number(l.fee_amount),
        fee_source: l.fee_source,
        status: l.status,
        created_at: l.created_at,
      })),
      total,
    };
  }

  /**
   * 计算中文/全角字符数（粗略：中文字符范围 + 半角全角符号）
   */
  static countChineseChars(text: string): number {
    if (!text) return 0;
    // 匹配所有中文字符（含中文标点）
    const matches = text.match(/[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]/g);
    return matches ? matches.length : 0;
  }

  private roundMoney(n: number): number {
    return Math.round(n * 100) / 100;
  }

  private todayDate(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }
}