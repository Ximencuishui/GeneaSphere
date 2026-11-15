import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AdminFamilyRelationService } from './admin-family-relation.service';
import { AdminService } from '../admin.service';
import { ClanResolverService } from '../../common/clan-resolver.service';

describe('AdminFamilyRelationService 审核状态', () => {
  const tx = {
    marriageHistory: { updateMany: jest.fn() },
    familyRelationChange: { updateMany: jest.fn() },
    childCustodyRecord: { updateMany: jest.fn(), create: jest.fn() },
  };
  const prisma = {
    familyRelationChange: { findUnique: jest.fn(), findMany: jest.fn() },
    clan: { findUnique: jest.fn() },
    $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const admin = { requireAdmin: jest.fn(), requireAdminBySlug: jest.fn(), logAction: jest.fn() };
  const notification = { notify: jest.fn() };
  const service = new AdminFamilyRelationService(prisma as never, admin as never, notification as never, {} as never);
  const authPrisma = {
    clan: { findUnique: jest.fn() },
    clanMember: { findUnique: jest.fn() },
    auditLog: { create: jest.fn() },
    familyRelationChange: { findMany: jest.fn(), count: jest.fn(), findUnique: jest.fn() },
  };
  const realAdmin = new AdminService(authPrisma as never, new ClanResolverService(authPrisma as never));
  const guarded = new AdminFamilyRelationService(authPrisma as never, realAdmin, notification as never, {} as never);

  function installMembership() {
    authPrisma.clan.findUnique.mockImplementation(async ({ where }: any) => {
      const clans = [
        { id: 1n, slug: 'clan-a', name: '甲家族', status: 'NORMAL', admin_user_id: 'owner-a' },
        { id: 2n, slug: 'clan-b', name: '乙家族', status: 'NORMAL', admin_user_id: 'owner-b' },
      ];
      if (where.slug) {
        const row = clans.find((item) => item.slug === where.slug);
        return row ? { id: row.id, slug: row.slug, name: row.name, status: row.status } : null;
      }
      if (where.id !== undefined) {
        const row = clans.find((item) => item.id === where.id);
        return row ? { admin_user_id: row.admin_user_id } : null;
      }
      return null;
    });
    authPrisma.clanMember.findUnique.mockImplementation(async ({ where }: any) => {
      const { clan_id, user_id } = where.clan_id_user_id;
      if (clan_id === 1n && user_id === 'admin-a') return { role: Role.ADMIN };
      return null;
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    admin.requireAdmin.mockResolvedValue(undefined);
    admin.logAction.mockResolvedValue(undefined);
    notification.notify.mockResolvedValue(undefined);
    installMembership();
  });

  it('已通过的变更不能再次驳回', async () => {
    prisma.familyRelationChange.findUnique.mockResolvedValue({
      id: 4n,
      status: 'approved',
      change_type: 'marriage',
      current_state: { applied: true },
      previous_state: { current_spouse_id: '8' },
      person_id: 2n,
      person: { clan_id: 1n },
    });
    tx.familyRelationChange.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.rejectChange('admin-1', '4', '不够')).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.familyRelationChange.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: { in: ['pending', 'needs_manual'] } }),
    }));
  });

  it('未落库的驳回不会回写婚姻', async () => {
    prisma.familyRelationChange.findUnique.mockResolvedValue({
      id: 4n,
      status: 'pending',
      change_type: 'marriage',
      current_state: { applied: false },
      previous_state: { current_spouse_id: '8' },
      person_id: 2n,
      person: { clan_id: 1n },
      operator_user_id: 'user-1',
    });
    tx.familyRelationChange.updateMany.mockResolvedValue({ count: 1 });

    await service.rejectChange('admin-1', '4', '材料不足');

    expect(tx.marriageHistory.updateMany).not.toHaveBeenCalled();
  });

  it('解决争议时把抚养状态写到目标子女，通知不用家族数字 id', async () => {
    prisma.familyRelationChange.findUnique.mockResolvedValue({
      id: 7n,
      clan_id: 99n,
      person_id: 3n,
      target_person_id: 8n,
      is_disputed: true,
      status: 'pending',
      operator_user_id: 'user-1',
      change_type: 'custody',
      current_state: { applied: false, is_biological: true },
      person: { clan_id: 99n },
    });
    prisma.clan.findUnique.mockResolvedValue({ name: '朱氏' });
    tx.childCustodyRecord.updateMany.mockResolvedValue({ count: 1 });
    tx.childCustodyRecord.create.mockResolvedValue({ id: 1n });
    tx.familyRelationChange.updateMany.mockResolvedValue({ count: 1 });

    await service.resolveDispute('admin-1', '7', 'joint');

    expect(tx.childCustodyRecord.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ child_id: 8n, custody_status: 'joint' }),
    }));
    expect(notification.notify).toHaveBeenCalledWith(expect.objectContaining({
      content: '您在「朱氏」的子女归属争议已被管理员解决。',
    }));
  });

  it('争议列表不直接返回未序列化的 BigInt', async () => {
    admin.requireAdminBySlug.mockResolvedValue(1n);
    prisma.familyRelationChange.findMany.mockResolvedValue([
      { id: 7n, clan_id: 1n, person_id: 3n, person: { full_name: '甲' } },
    ]);

    const rows = await service.listDisputes('admin-1', 'zhu');

    expect(typeof rows[0].id).toBe('string');
    expect(rows[0].id).toBe('7');
  });

  it('家族 A 的管理员不能查询家族 B 的关系变更列表', async () => {
    authPrisma.familyRelationChange.findMany.mockResolvedValue([]);
    authPrisma.familyRelationChange.count.mockResolvedValue(0);

    await guarded.listChanges('admin-a', { clanSlug: 'clan-a', page: 1, pageSize: 20 });

    const error = await guarded.listChanges('admin-a', {
      clanSlug: 'clan-b',
      page: 1,
      pageSize: 20,
    }).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).message).toBe('Admin access required');
    expect(authPrisma.familyRelationChange.findMany.mock.calls.map((call) => call[0].where.clan_id)).toEqual([1n]);
    expect(authPrisma.familyRelationChange.count.mock.calls.map((call) => call[0].where.clan_id)).toEqual([1n]);
    expect(authPrisma.clanMember.findUnique).toHaveBeenCalledWith({
      where: { clan_id_user_id: { clan_id: 2n, user_id: 'admin-a' } },
    });
  });

  it('家族 A 的管理员不能查询家族 B 的争议列表', async () => {
    authPrisma.familyRelationChange.findMany.mockResolvedValue([
      { id: 7n, clan_id: 2n, person_id: 3n, person: { full_name: '乙' } },
    ]);

    const error = await guarded.listDisputes('admin-a', 'clan-b').catch((err: unknown) => err);

    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).message).toBe('Admin access required');
    expect(authPrisma.familyRelationChange.findMany).not.toHaveBeenCalled();
    expect(authPrisma.clanMember.findUnique).toHaveBeenCalledWith({
      where: { clan_id_user_id: { clan_id: 2n, user_id: 'admin-a' } },
    });
  });
});
