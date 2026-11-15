import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { MembersController } from './members.controller';

describe('MembersController 族员管理', () => {
  const admin = {
    requireAdminBySlug: jest.fn(),
    requireOwnerBySlug: jest.fn(),
    requireAdmin: jest.fn(),
    requireOwner: jest.fn(),
    logAction: jest.fn(),
  };
  const prisma = {
    clanMember: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    clan: { update: jest.fn() },
    personUserLink: { findMany: jest.fn() },
    familyUnit: { findMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const controller = new MembersController(admin as never, prisma as never);
  const ownerReq = { user: { userId: 'owner-1' } };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('角色和关键字进入查询条件', async () => {
    admin.requireAdminBySlug.mockResolvedValue(9n);
    prisma.clanMember.findMany.mockResolvedValue([]);
    prisma.clanMember.count.mockResolvedValue(0);

    await controller.getMembers(ownerReq, 'zhu', '1', '20', 'ADMIN', '张');

    expect(prisma.clanMember.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        clan_id: 9n,
        role: 'ADMIN',
        OR: expect.any(Array),
      }),
    }));
  });

  it('非 Owner 不能转让，且不写库', async () => {
    admin.requireOwnerBySlug.mockRejectedValue(new ForbiddenException('Owner access required'));

    await expect(
      controller.transferOwnership(ownerReq, { targetUserId: 'member-2', clanSlug: 'zhu' }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.clan.update).not.toHaveBeenCalled();
  });

  it('转让时把新人设为 OWNER、原主人降为 ADMIN，并同步 admin_user_id', async () => {
    admin.requireOwnerBySlug.mockResolvedValue(9n);
    prisma.clanMember.findUnique.mockResolvedValue({ id: 2n, user_id: 'member-2', role: 'ADMIN' });
    prisma.$transaction.mockResolvedValue([]);

    await controller.transferOwnership(ownerReq, { targetUserId: 'member-2', clanSlug: 'zhu' });

    const ops = prisma.$transaction.mock.calls[0][0];
    expect(ops).toHaveLength(3);
    expect(prisma.clanMember.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { role: 'OWNER' },
    }));
    expect(prisma.clanMember.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { role: 'ADMIN' },
    }));
    expect(prisma.clan.update).toHaveBeenCalledWith({
      where: { id: 9n },
      data: { admin_user_id: 'member-2' },
    });
  });

  it('目标不是本家族成员时拒绝转让', async () => {
    admin.requireOwnerBySlug.mockResolvedValue(9n);
    prisma.clanMember.findUnique.mockResolvedValue(null);

    await expect(
      controller.transferOwnership(ownerReq, { targetUserId: 'outsider', clanSlug: 'zhu' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('不能移除 OWNER，也不按手机号去猜子女', async () => {
    prisma.clanMember.findUnique.mockResolvedValue({
      id: 4n,
      user_id: 'owner-2',
      role: 'OWNER',
      clan_id: 9n,
      user: { id: 'owner-2', phone: '13800001234' },
    });
    admin.requireAdmin.mockResolvedValue(undefined);

    await expect(controller.removeMember(ownerReq, '4')).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.clanMember.delete).not.toHaveBeenCalled();
    expect(prisma.familyUnit.findMany).not.toHaveBeenCalled();
  });

  it('管理员不能移除自己的账号', async () => {
    prisma.clanMember.findUnique.mockResolvedValue({
      id: 4n,
      user_id: 'owner-1',
      role: 'ADMIN',
      clan_id: 9n,
      user: { id: 'owner-1', phone: '13800000000' },
    });
    admin.requireAdmin.mockResolvedValue(undefined);

    const error = await controller.removeMember(ownerReq, '4').catch((err: unknown) => err);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).message).toBe('不能移除自己，请联系其他管理员处理');
    expect(admin.requireAdmin).toHaveBeenCalledWith(9n, 'owner-1');
    expect(prisma.clanMember.delete).not.toHaveBeenCalled();
  });
});
