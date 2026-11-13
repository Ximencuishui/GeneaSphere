import { HttpException, HttpStatus } from '@nestjs/common';
import { OcrBillingService } from './ocr-billing.service';

describe('OcrBillingService.chargeAfterOcr', () => {
  const creditRow = {
    user_id: 'user-1',
    paid_balance: 0,
    ocr_pages_used: 10,
    ocr_chars_used: 1000,
    ocr_reset_date: new Date(),
  };

  function build() {
    const tx = {
      $queryRawUnsafe: jest.fn(async () => [creditRow]),
      userCredit: { update: jest.fn() },
      ocrUsageLog: { create: jest.fn() },
    };
    const prisma = {
      userCredit: {
        findUnique: jest.fn(async () => creditRow),
        create: jest.fn(),
      },
      $transaction: jest.fn(async (fn: (trx: typeof tx) => Promise<unknown>) => fn(tx)),
    };
    return { service: new OcrBillingService(prisma as never), tx };
  }

  it('扣费前用 FOR UPDATE 锁住账户，余额不够时不写扣减', async () => {
    const { service, tx } = build();
    await expect(
      service.chargeAfterOcr('user-1', { taskId: 'task-1', pages: 1, totalChars: 20 }),
    ).rejects.toMatchObject({ status: HttpStatus.PAYMENT_REQUIRED });

    const sql = String((tx.$queryRawUnsafe as jest.Mock).mock.calls[0][0]);
    expect(sql).toContain('FOR UPDATE');
    expect(tx.userCredit.update).not.toHaveBeenCalled();
    expect(tx.ocrUsageLog.create).not.toHaveBeenCalled();
  });

  it('免费额度够用时在同一把锁里记账，余额保持为 0', async () => {
    const { service, tx } = build();
    tx.$queryRawUnsafe.mockResolvedValueOnce([{
      ...creditRow,
      ocr_pages_used: 0,
      ocr_chars_used: 0,
    }]);
    tx.userCredit.update.mockResolvedValue({ paid_balance: 0 });

    const detail = await service.chargeAfterOcr('user-1', {
      taskId: 'task-2',
      pages: 1,
      totalChars: 20,
    });

    expect(detail.fee_amount).toBe(0);
    expect(detail.paid_balance_after).toBe(0);
    expect(tx.userCredit.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { user_id: 'user-1' },
      data: expect.objectContaining({
        paid_balance: { decrement: 0 },
        ocr_pages_used: 1,
      }),
    }));
  });

  it('assertAffordable 在预计费用高于余额时抛出 402', async () => {
    const { service } = build();
    await expect(service.assertAffordable('user-1', 1)).rejects.toBeInstanceOf(HttpException);
  });

  it('两个并发扣费串行过同一把锁，余额不会变成负数，后一笔因余额不足失败', async () => {
    const state = {
      paid_balance: 1,
      ocr_pages_used: 10,
      ocr_chars_used: 1000,
      ocr_reset_date: new Date(),
    };
    const tx = {
      $queryRawUnsafe: jest.fn(async () => [{ ...state }]),
      userCredit: {
        update: jest.fn(async ({ data }) => {
          state.paid_balance = Math.round((state.paid_balance - data.paid_balance.decrement) * 100) / 100;
          state.ocr_pages_used = data.ocr_pages_used;
          state.ocr_chars_used = data.ocr_chars_used;
          return { ...state };
        }),
      },
      ocrUsageLog: { create: jest.fn(async () => ({})) },
    };
    let chain = Promise.resolve();
    const prisma = {
      userCredit: {
        findUnique: jest.fn(async () => ({ ...state })),
        create: jest.fn(),
      },
      $transaction: jest.fn((fn: (client: typeof tx) => Promise<unknown>) => {
        const run = chain.then(() => fn(tx));
        chain = run.then(() => undefined, () => undefined);
        return run;
      }),
    };
    const service = new OcrBillingService(prisma as never);

    const results = await Promise.allSettled([
      service.chargeAfterOcr('user-1', { taskId: 'task-a', pages: 1, totalChars: 20 }),
      service.chargeAfterOcr('user-1', { taskId: 'task-b', pages: 1, totalChars: 20 }),
    ]);

    const fulfilled = results.filter((item) => item.status === 'fulfilled');
    const rejected = results.filter((item) => item.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(HttpException);
    expect(((rejected[0] as PromiseRejectedResult).reason as HttpException).getStatus()).toBe(
      HttpStatus.PAYMENT_REQUIRED,
    );
    expect(state.paid_balance).toBeGreaterThanOrEqual(0);
    expect(state.paid_balance).toBeLessThan(1);
    expect(tx.userCredit.update).toHaveBeenCalledTimes(1);
  });
});
