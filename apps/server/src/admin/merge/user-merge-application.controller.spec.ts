import { ConflictException } from '@nestjs/common';
import { ApplicationStatus } from '@prisma/client';
import { UserMergeApplicationController } from './user-merge-application.controller';

describe('UserMergeApplicationController', () => {
  const prisma = {
    clan: { findUnique: jest.fn() },
    person: { findUnique: jest.fn() },
    mergeApplication: { create: jest.fn(), updateMany: jest.fn(), findMany: jest.fn() },
  };
  const controller = new UserMergeApplicationController(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('用户发起申请写入 PENDING，applicant_id 来自 JWT，忽略客户端 status', async () => {
    prisma.clan.findUnique.mockImplementation(async ({ where }: { where: { id: bigint } }) => {
      if (where.id === 10n || where.id === 11n) return { id: where.id };
      return null;
    });
    prisma.person.findUnique.mockResolvedValue({ id: 20n, clan_id: 11n });
    prisma.mergeApplication.create.mockResolvedValue({
      id: 5n,
      status: ApplicationStatus.PENDING,
      applicant_id: 'jwt-user',
    });

    const result = await controller.create(
      { user: { userId: 'jwt-user' } },
      {
        clan_id: '10',
        origin_place: ' 婺源 ',
        xipai_info: ['德'],
        ancestor_name: '朱铨',
        applicant_clan_id: '11',
        branch_root_person_id: '20',
        status: 'APPROVED',
      } as never,
    );

    expect(result).toEqual({ id: '5', status: ApplicationStatus.PENDING, applicant_id: 'jwt-user' });
    expect(prisma.mergeApplication.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clan_id: 10n,
        applicant_id: 'jwt-user',
        origin_place: '婺源',
        xipai_info: ['德'],
        applicant_clan_id: 11n,
        branch_root_person_id: 20n,
        status: ApplicationStatus.PENDING,
      }),
    });
    const data = prisma.mergeApplication.create.mock.calls[0][0].data;
    expect(data.status).toBe(ApplicationStatus.PENDING);
    expect(data).not.toHaveProperty('match_score');
    expect(data).not.toHaveProperty('reviewed_by');
  });

  it('非 PENDING 或非申请人撤回返回 409', async () => {
    prisma.mergeApplication.updateMany.mockResolvedValue({ count: 0 });

    await expect(controller.withdraw({ user: { userId: 'jwt-user' } }, '8')).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.mergeApplication.updateMany).toHaveBeenCalledWith({
      where: { id: 8n, applicant_id: 'jwt-user', status: ApplicationStatus.PENDING },
      data: { status: ApplicationStatus.WITHDRAWN },
    });
  });
});
