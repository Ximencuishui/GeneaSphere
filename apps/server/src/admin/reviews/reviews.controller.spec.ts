import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ReviewStatus } from '@prisma/client';
import { ReviewsController } from './reviews.controller';

describe('ReviewsController 谱稿初审', () => {
  const admin = { requireAdmin: jest.fn(), logAction: jest.fn() };
  const prisma = {
    bioReview: { findUnique: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
    personBio: { upsert: jest.fn() },
    $transaction: jest.fn(),
  };
  const notification = { notifyBioReview: jest.fn().mockResolvedValue(undefined) };
  const controller = new ReviewsController(admin as never, prisma as never, notification as never);
  const req = { user: { userId: 'admin-1' } };

  beforeEach(() => {
    jest.clearAllMocks();
    admin.logAction.mockResolvedValue(undefined);
  });

  it('非 PENDING 不能通过，也不写人物生平', async () => {
    prisma.bioReview.findUnique.mockResolvedValue({
      id: 1n,
      status: 'APPROVED',
      person_id: 3n,
      content: '新生平',
      title: '生平',
      author_id: 'author',
      person: { clan_id: 9n },
    });
    admin.requireAdmin.mockResolvedValue(undefined);

    await expect(controller.approveBio(req, '1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.personBio.upsert).not.toHaveBeenCalled();
  });

  it('通过待审生平会写入人物生平，并只更新 PENDING', async () => {
    prisma.bioReview.findUnique.mockResolvedValue({
      id: 1n,
      status: 'PENDING',
      person_id: 3n,
      content: '新生平',
      title: '生平',
      author_id: 'author',
      person: { clan_id: 9n },
    });
    admin.requireAdmin.mockResolvedValue(undefined);
    const tx = {
      bioReview: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      personBio: { upsert: jest.fn().mockResolvedValue({}) },
    };
    prisma.$transaction.mockImplementation(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx));

    await controller.approveBio(req, '1');

    expect(tx.bioReview.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 1n, status: 'PENDING' },
    }));
    expect(tx.personBio.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { person_id: 3n },
      create: expect.objectContaining({ biography: '新生平' }),
      update: { biography: '新生平' },
    }));
    expect(notification.notifyBioReview).toHaveBeenCalledWith(expect.objectContaining({ approved: true, authorId: 'author' }));
  });

  it('批量审核会校验每条所属家族，跨家族时不更新', async () => {
    prisma.bioReview.findMany.mockResolvedValue([
      { id: 1n, status: 'PENDING', person_id: 3n, content: '甲', title: '甲', author_id: 'a', person: { clan_id: 2n } },
      { id: 2n, status: 'PENDING', person_id: 4n, content: '乙', title: '乙', author_id: 'b', person: { clan_id: 8n } },
    ]);
    admin.requireAdmin.mockImplementation(async (clanId: bigint) => {
      if (clanId === 8n) throw new ForbiddenException('Admin access required');
    });

    await expect(controller.batchApproveBio(req, { reviewIds: ['1', '2'] })).rejects.toBeInstanceOf(ForbiddenException);

    expect(admin.requireAdmin).toHaveBeenCalledWith(2n, 'admin-1');
    expect(admin.requireAdmin).toHaveBeenCalledWith(8n, 'admin-1');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('批量驳回只更新仍为 PENDING 的记录', async () => {
    prisma.bioReview.findMany.mockResolvedValue([
      { id: 1n, status: 'PENDING', person_id: 3n, content: '甲', title: '甲', author_id: 'a', person: { clan_id: 2n } },
      { id: 2n, status: 'APPROVED', person_id: 4n, content: '乙', title: '乙', author_id: 'b', person: { clan_id: 2n } },
    ]);
    admin.requireAdmin.mockResolvedValue(undefined);
    prisma.bioReview.updateMany.mockResolvedValue({ count: 1 });

    await controller.batchRejectBio(req, { reviewIds: ['1', '2'], reason: '不实' });

    expect(prisma.bioReview.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: [1n] }, status: 'PENDING' },
      data: expect.objectContaining({ status: 'REJECTED', reject_reason: '不实' }),
    }));
  });
});

describe('ReviewsController 影像审核', () => {
  const admin = { requireAdmin: jest.fn(), logAction: jest.fn() };
  const prisma = {
    mediaReview: { findUnique: jest.fn(), update: jest.fn() },
  };
  const notification = { notifyMediaReview: jest.fn().mockResolvedValue(undefined) };
  const controller = new ReviewsController(admin as never, prisma as never, notification as never);
  const req = { user: { userId: 'admin-1' } };

  beforeEach(() => {
    jest.clearAllMocks();
    admin.requireAdmin.mockResolvedValue(undefined);
    admin.logAction.mockResolvedValue(undefined);
    notification.notifyMediaReview.mockResolvedValue(undefined);
  });

  it('approves pending media, clears the reject reason, and notifies the uploader', async () => {
    prisma.mediaReview.findUnique.mockResolvedValue({
      id: 5n,
      status: ReviewStatus.PENDING,
      media_id: 9n,
      media: { clan_id: 2n, uploader_id: 'uploader-1' },
    });
    prisma.mediaReview.update.mockResolvedValue({ status: ReviewStatus.APPROVED });

    await controller.approveMedia(req, '5');

    expect(prisma.mediaReview.update).toHaveBeenCalledWith({
      where: { id: 5n },
      data: expect.objectContaining({
        status: ReviewStatus.APPROVED,
        reject_reason: null,
        reviewer_id: 'admin-1',
      }),
    });
    expect(notification.notifyMediaReview).toHaveBeenCalledWith(expect.objectContaining({
      uploaderId: 'uploader-1',
      mediaId: '9',
      approved: true,
    }));
  });

  it('does not approve media that is not pending', async () => {
    prisma.mediaReview.findUnique.mockResolvedValue({
      id: 5n,
      status: ReviewStatus.REJECTED,
      media_id: 9n,
      media: { clan_id: 2n, uploader_id: 'uploader-1' },
    });

    await expect(controller.approveMedia(req, '5')).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.mediaReview.update).not.toHaveBeenCalled();
    expect(notification.notifyMediaReview).not.toHaveBeenCalled();
  });
});
