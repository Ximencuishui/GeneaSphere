import { NotFoundException } from '@nestjs/common';
import { MemoryQuizStatus } from '@prisma/client';
import { MemoryService } from './memory.service';
import { MemoryController } from './memory.controller';

describe('memory quiz clan admin', () => {
  const prisma = {
    localMemoryQuiz: { findMany: jest.fn(), count: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    clanMember: { findUnique: jest.fn(), findMany: jest.fn() },
    memoryBadge: { findFirst: jest.fn() },
    localMemoryAnswer: { count: jest.fn() },
    userVerifiedLocation: { count: jest.fn() },
  };
  const service = new MemoryService(prisma as never);

  it('lists only quizzes created by members of the current clan', async () => {
    prisma.localMemoryQuiz.findMany.mockResolvedValue([]);
    prisma.localMemoryQuiz.count.mockResolvedValue(0);

    await service.getPendingQuizzes(4n, 1, 20, 'ALL');

    expect(prisma.localMemoryQuiz.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: [
          { clan_id: 4n },
          {
            clan_id: null,
            creator: { clans: { some: { clan_id: 4n }, every: { clan_id: 4n } } },
          },
        ],
      }),
    }));
  });

  it('returns 404 and does not update when the creator left the clan', async () => {
    prisma.localMemoryQuiz.findUnique.mockResolvedValue({ id: 8, creator_id: 'user-x', clan_id: null, status: 'PENDING' });
    prisma.clanMember.findMany.mockResolvedValue([]);

    await expect(service.reviewQuiz(8, 4n, MemoryQuizStatus.REJECTED, undefined, '重复')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.localMemoryQuiz.update).not.toHaveBeenCalled();
  });

  it('stores the reject reason', async () => {
    prisma.localMemoryQuiz.findUnique.mockResolvedValue({ id: 8, creator_id: 'user-x', clan_id: 4n, status: 'PENDING' });
    prisma.localMemoryQuiz.update.mockResolvedValue({});

    await service.reviewQuiz(8, 4n, MemoryQuizStatus.REJECTED, undefined, '与地方无关');

    expect(prisma.localMemoryQuiz.update).toHaveBeenCalledWith({
      where: { id: 8 },
      data: expect.objectContaining({ status: 'REJECTED', reject_reason: '与地方无关' }),
    });
  });
});

describe('memory admin controller', () => {
  const memory = { getPendingQuizzes: jest.fn(), reviewQuiz: jest.fn() };
  const admin = { requireAdminBySlug: jest.fn(), logAction: jest.fn() };
  const controller = new MemoryController(memory as never, admin as never);

  it('requires the clan admin and writes an audit log', async () => {
    admin.requireAdminBySlug.mockResolvedValue(4n);
    memory.reviewQuiz.mockResolvedValue({ success: true });

    await controller.reviewQuiz(
      { user: { userId: 'admin-1' }, headers: { 'x-forwarded-for': '198.51.100.4' }, body: {} },
      8,
      'VERIFIED',
      undefined,
      undefined,
      'clan-a',
    );

    expect(admin.requireAdminBySlug).toHaveBeenCalledWith('clan-a', 'admin-1');
    expect(memory.reviewQuiz).toHaveBeenCalledWith(8, 4n, 'VERIFIED', undefined, undefined);
    expect(admin.logAction).toHaveBeenCalledWith(expect.objectContaining({
      action: 'APPROVE_MEMORY_QUIZ',
      clanId: 4n,
      ipAddress: '198.51.100.4',
    }));
  });
});
