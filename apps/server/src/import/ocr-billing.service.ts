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

export function isInsufficientBalance(error: unknown): error is HttpException {
  return error instanceof HttpException && error.getStatus() === HttpStatus.PAYMENT_REQUIRED;
}

interface LockedCredit {
  paid_balance: number;
  ocr_pages_used: number;
  ocr_chars_used: number;
  ocr_reset_date: Date;
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
    const existing = await prisma.userCredit.findUnique({
      where: { user_id: userId },
    });
    if (existing) return existing;
    try {
      return await prisma.userCredit.create({
        data: {
          user_id: userId,
          free_remaining: 10,
          paid_balance: 0,
          ocr_pages_used: 0,
          ocr_chars_used: 0,
          ocr_reset_date: this.todayDate(),
        },
      });
    } catch {
      return prisma.userCredit.findUnique({ where: { user_id: userId } });
    }
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
   * 上传和真正调用 OCR 之前都走这里。免费额度能覆盖时 estimated_fee 为 0，余额为 0 也允许。
   * 预计要扣钱而余额不够时直接 402，调用方不得再发起识别。
   */
  async assertAffordable(userId: string, pages: number): Promise<OcrPrecheckResult> {
    const precheck = await this.precheckCost(userId, pages);
    if (!precheck.sufficient) {
      throw new HttpException(
        {
          success: false,
          error: 'INSUFFICIENT_BALANCE',
          message: `余额不足，已中止识别：预计需要 ¥${precheck.estimated_fee.toFixed(2)}，当前余额 ¥${Number(precheck.current_paid_balance).toFixed(2)}`,
          required: precheck.estimated_fee,
          current: Number(precheck.current_paid_balance),
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
    return precheck;
  }

  /**
   * OCR 完成后结算。扣减包在行锁里，并发请求会排队看到对方扣完后的余额。
   */
  async chargeAfterOcr(
    userId: string,
    params: OcrChargeParams,
  ): Promise<OcrFeeDetail> {
    const prisma = this.prisma as any;
    await this.getOrCreateCredit(userId);

    return prisma.$transaction(async (tx: any) => {
      const locked = await tx.$queryRawUnsafe(
        `SELECT paid_balance, ocr_pages_used, ocr_chars_used, ocr_reset_date
         FROM user_credits
         WHERE user_id = $1
         FOR UPDATE`,
        userId,
      );
      const row = (Array.isArray(locked) ? locked[0] : null) as LockedCredit | undefined;
      if (!row) {
        throw new HttpException('计费账户不存在', HttpStatus.PAYMENT_REQUIRED);
      }

      let pagesUsed = Number(row.ocr_pages_used) || 0;
      let charsUsed = Number(row.ocr_chars_used) || 0;
      const balance = Number(row.paid_balance) || 0;
      const resetDate = new Date(row.ocr_reset_date);
      const now = new Date();
      const sameMonth =
        resetDate.getFullYear() === now.getFullYear() &&
        resetDate.getMonth() === now.getMonth();
      if (!sameMonth) {
        pagesUsed = 0;
        charsUsed = 0;
      }

      const quote = this.quote(pagesUsed, charsUsed, balance, params.pages, params.totalChars);
      if (quote.fee > balance) {
        throw new HttpException(
          {
            success: false,
            error: 'INSUFFICIENT_BALANCE',
            message: `OCR 余额不足：本次需 ¥${quote.fee.toFixed(2)}，当前余额 ¥${balance.toFixed(2)}`,
            required: quote.fee,
            current: balance,
          },
          HttpStatus.PAYMENT_REQUIRED,
        );
      }

      const updated = await tx.userCredit.update({
        where: { user_id: userId },
        data: {
          paid_balance: { decrement: quote.fee },
          ocr_pages_used: quote.nextPagesUsed,
          ocr_chars_used: quote.nextCharsUsed,
          ...(sameMonth ? {} : { ocr_reset_date: this.todayDate() }),
        },
      });
      await tx.ocrUsageLog.create({
        data: {
          user_id: userId,
          task_id: params.taskId || null,
          pages_total: params.pages,
          chars_total: params.totalChars,
          free_pages_used: quote.freePagesUsed,
          free_chars_used: quote.freeCharsUsed,
          charged_pages: quote.chargedPages,
          charged_chars: quote.chargedChars,
          fee_amount: quote.fee,
          fee_source: quote.feeSource,
          status: 'completed',
        },
      });

      this.logger.log(
        `OCR 计费完成 user=${userId} pages=${params.pages} chars=${params.totalChars} ` +
          `free_p=${quote.freePagesUsed} free_c=${quote.freeCharsUsed} ` +
          `charged_p=${quote.chargedPages} charged_c=${quote.chargedChars} fee=¥${quote.fee.toFixed(2)}`,
      );
      this.logger.log(
        `[PDF_Import] Task ${params.taskId} 扣费成功 fee=¥${quote.fee.toFixed(2)} balance_after=${Number(updated.paid_balance)}`,
      );

      return {
        pages_total: params.pages,
        chars_total: params.totalChars,
        free_pages_used: quote.freePagesUsed,
        free_chars_used: quote.freeCharsUsed,
        charged_pages: quote.chargedPages,
        charged_chars: quote.chargedChars,
        fee_amount: quote.fee,
        fee_source: quote.feeSource,
        paid_balance_after: Number(updated.paid_balance),
      };
    });
  }

  private quote(
    pagesUsed: number,
    charsUsed: number,
    _balance: number,
    pages: number,
    totalChars: number,
  ) {
    const freePagesLeft = Math.max(0, this.FREE_PAGES - pagesUsed);
    const freePagesUsed = Math.min(pages, freePagesLeft);
    const chargedPages = Math.max(0, pages - freePagesUsed);
    const freeCharsLeft = Math.max(0, this.FREE_CHARS - charsUsed);
    const freeCharsUsed = Math.min(totalChars, freeCharsLeft);
    const chargedChars = Math.max(0, totalChars - freeCharsUsed);
    const chargedHundredChars = Math.ceil(chargedChars / 100);
    const fee = this.roundMoney(
      chargedPages * this.PRICE_PER_PAGE + chargedHundredChars * this.PRICE_PER_100_CHARS,
    );
    const feeSource: 'free' | 'paid' | 'mixed' =
      fee === 0 ? 'free' : freePagesUsed > 0 || freeCharsUsed > 0 ? 'mixed' : 'paid';
    return {
      freePagesUsed,
      freeCharsUsed,
      chargedPages,
      chargedChars,
      fee,
      feeSource,
      nextPagesUsed: pagesUsed + freePagesUsed,
      nextCharsUsed: charsUsed + freeCharsUsed,
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