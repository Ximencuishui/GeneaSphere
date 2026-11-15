import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdminReportController } from './admin-report.controller';

describe('AdminReportController 举报处理', () => {
  const admin = { requireAdminBySlug: jest.fn(), logAction: jest.fn() };
  const prisma = {
    contentReport: { findFirst: jest.fn(), updateMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const controller = new AdminReportController(admin as never, prisma as never);
  const req = { user: { userId: 'admin-1' } };

  beforeEach(() => {
    jest.clearAllMocks();
    admin.requireAdminBySlug.mockResolvedValue(1n);
    admin.logAction.mockResolvedValue(undefined);
  });

  it('其他家族的举报详情返回 404', async () => {
    prisma.contentReport.findFirst.mockResolvedValue(null);

    await expect(controller.getReport(req, '5', 'zhu')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.contentReport.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 5n, clan_id: 1n },
    }));
  });

  it('非 PENDING 不能再确认', async () => {
    const tx = {
      contentReport: {
        findFirst: jest.fn().mockResolvedValue({ id: 5n, clan_id: 1n, status: 'CONFIRMED', target_type: 'MEDIA', target_id: 3n }),
        updateMany: jest.fn(),
      },
      mediaArchive: { update: jest.fn() },
    };
    prisma.$transaction.mockImplementation(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx));

    await expect(controller.confirmReport(req, '5', { clanSlug: 'zhu' })).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.contentReport.updateMany).not.toHaveBeenCalled();
    expect(tx.mediaArchive.update).not.toHaveBeenCalled();
  });

  it('处置失败时不把举报标成已处理', async () => {
    const tx = {
      contentReport: {
        findFirst: jest.fn().mockResolvedValue({
          id: 5n,
          clan_id: 1n,
          status: 'PENDING',
          target_type: 'MEDIA',
          target_id: 3n,
          reason: '违规',
        }),
        updateMany: jest.fn(),
      },
      mediaArchive: { update: jest.fn().mockRejectedValue(new Error('影像不存在')) },
    };
    prisma.$transaction.mockImplementation(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx));

    await expect(controller.confirmReport(req, '5', { clanSlug: 'zhu' })).rejects.toThrow('影像不存在');
    expect(tx.contentReport.updateMany).not.toHaveBeenCalled();
    expect(admin.logAction).not.toHaveBeenCalled();
  });

  it('MEMBER 类型确认返回明确错误，不静默成功', async () => {
    const tx = {
      contentReport: {
        findFirst: jest.fn().mockResolvedValue({
          id: 6n,
          clan_id: 1n,
          status: 'PENDING',
          target_type: 'MEMBER',
          target_id: 4n,
          reason: '资料有误',
        }),
        updateMany: jest.fn(),
      },
    };
    prisma.$transaction.mockImplementation(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx));

    await expect(controller.confirmReport(req, '6', { clanSlug: 'zhu' })).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.contentReport.updateMany).not.toHaveBeenCalled();
  });

  it('已驳回的举报不能再次驳回', async () => {
    prisma.contentReport.findFirst.mockResolvedValue({
      id: 5n,
      clan_id: 1n,
      status: 'REJECTED',
      reason: '不实',
      reporter: { nickname: '甲', phone: '1' },
      handler: { nickname: '管', phone: '2' },
    });
    prisma.contentReport.updateMany.mockResolvedValue({ count: 0 });

    const error = await controller.rejectReport(req, '5', { clanSlug: 'zhu', result: '再驳回一次' }).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).message).toBe('只能处理待处理的举报');
    expect(prisma.contentReport.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.contentReport.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 5n, clan_id: 1n, status: 'PENDING' },
      data: expect.objectContaining({ status: 'REJECTED' }),
    }));
    expect(admin.logAction).not.toHaveBeenCalled();
  });

  it('已确认的举报不能再驳回', async () => {
    prisma.contentReport.findFirst.mockResolvedValue({
      id: 5n,
      clan_id: 1n,
      status: 'CONFIRMED',
      reason: '违规',
      reporter: { nickname: '甲', phone: '1' },
      handler: { nickname: '管', phone: '2' },
    });
    prisma.contentReport.updateMany.mockResolvedValue({ count: 0 });

    const error = await controller.rejectReport(req, '5', { clanSlug: 'zhu' }).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).message).toBe('只能处理待处理的举报');
    expect(prisma.contentReport.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 5n, clan_id: 1n, status: 'PENDING' },
    }));
    expect(admin.logAction).not.toHaveBeenCalled();
  });
});
