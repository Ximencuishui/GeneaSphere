import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AdminAnnouncementController } from './admin-announcement.controller';
import { AdminService } from '../admin.service';
import { ClanResolverService } from '../../common/clan-resolver.service';

describe('AdminAnnouncementController 公告隔离', () => {
  const admin = { requireAdminBySlug: jest.fn(), logAction: jest.fn() };
  const prisma = {
    clanAnnouncement: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const controller = new AdminAnnouncementController(admin as never, prisma as never);
  const req = { user: { userId: 'admin-1' } };
  const permissionPrisma = {
    clan: { findUnique: jest.fn() },
    clanMember: { findUnique: jest.fn() },
    auditLog: { create: jest.fn() },
    clanAnnouncement: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const realAdmin = new AdminService(
    permissionPrisma as never,
    new ClanResolverService(permissionPrisma as never),
  );
  const guarded = new AdminAnnouncementController(realAdmin as never, permissionPrisma as never);

  function installMembership() {
    permissionPrisma.clan.findUnique.mockImplementation(async ({ where }: any) => {
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
    permissionPrisma.clanMember.findUnique.mockImplementation(async ({ where }: any) => {
      const { clan_id, user_id } = where.clan_id_user_id;
      if (clan_id === 1n && user_id === 'admin-a') return { role: Role.ADMIN };
      if (clan_id === 1n && user_id === 'viewer-1') return { role: Role.VIEWER };
      return null;
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    admin.requireAdminBySlug.mockResolvedValue(1n);
    installMembership();
  });

  it('其他家族的公告详情返回 404', async () => {
    prisma.clanAnnouncement.findFirst.mockResolvedValue(null);

    await expect(controller.getAnnouncement(req, 8, 'zhu')).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.clanAnnouncement.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 8n, clan_id: 1n, deleted_at: null },
    }));
  });

  it('置顶条数与更新在同一事务里，超限不更新', async () => {
    const tx = {
      clanAnnouncement: {
        findFirst: jest.fn().mockResolvedValue({ id: 8n, clan_id: 1n, title: '甲', is_pinned: false }),
        count: jest.fn().mockResolvedValue(3),
        updateMany: jest.fn(),
      },
    };
    prisma.$transaction.mockImplementation(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx));

    await expect(
      controller.togglePin(req, 8, 'zhu', { isPinned: true }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.clanAnnouncement.updateMany).not.toHaveBeenCalled();
  });

  it('删除其他家族公告不会执行删除', async () => {
    prisma.clanAnnouncement.findFirst.mockResolvedValue(null);

    await expect(controller.deleteAnnouncement(req, 8, 'zhu')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.clanAnnouncement.updateMany).not.toHaveBeenCalled();
  });

  it('管理员更新公告时按公告 id 与家族 id 写入', async () => {
    prisma.clanAnnouncement.findFirst.mockResolvedValue({
      id: 8n,
      clan_id: 1n,
      title: '旧标题',
      is_pinned: false,
      creator: { id: 'admin-1', phone: '1', nickname: '管' },
    });
    const tx = {
      clanAnnouncement: {
        count: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findFirst: jest.fn().mockResolvedValue({
          id: 8n,
          title: '新标题',
          content: '正文',
          is_pinned: false,
          is_active: true,
          updated_at: new Date('2026-01-01'),
        }),
      },
    };
    prisma.$transaction.mockImplementation(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx));

    await controller.updateAnnouncement(req, 8, { clanSlug: 'zhu', title: '新标题', content: '正文' });

    expect(tx.clanAnnouncement.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 8n, clan_id: 1n, deleted_at: null },
      data: expect.objectContaining({ title: '新标题', content: '正文' }),
    }));
  });

  it('管理员上下架公告时按公告 id 与家族 id 写入', async () => {
    prisma.clanAnnouncement.findFirst.mockResolvedValue({
      id: 8n,
      clan_id: 1n,
      title: '公告',
      is_active: false,
      published_at: null,
      creator: { id: 'admin-1', phone: '1', nickname: '管' },
    });
    prisma.clanAnnouncement.updateMany.mockResolvedValue({ count: 1 });

    await controller.toggleStatus(req, 8, 'zhu', { isActive: true });

    expect(prisma.clanAnnouncement.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 8n, clan_id: 1n, deleted_at: null },
      data: expect.objectContaining({ is_active: true, published_at: expect.any(Date) }),
    }));

    prisma.clanAnnouncement.findFirst.mockResolvedValue({
      id: 8n,
      clan_id: 1n,
      title: '公告',
      is_active: true,
      published_at: new Date('2026-01-01'),
      creator: { id: 'admin-1', phone: '1', nickname: '管' },
    });

    await controller.toggleStatus(req, 8, 'zhu', { isActive: false });

    expect(prisma.clanAnnouncement.updateMany).toHaveBeenLastCalledWith({
      where: { id: 8n, clan_id: 1n, deleted_at: null },
      data: { is_active: false },
    });
  });

  it('普通族员不能更新公告', async () => {
    permissionPrisma.clanAnnouncement.updateMany.mockResolvedValue({ count: 1 });
    permissionPrisma.$transaction.mockImplementation(async (fn: (client: typeof permissionPrisma) => Promise<unknown>) => fn(permissionPrisma));

    const error = await guarded.updateAnnouncement(
      { user: { userId: 'viewer-1' } },
      8,
      { clanSlug: 'clan-a', title: '改' },
    ).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).message).toBe('Admin access required');
    expect(permissionPrisma.clan.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { slug: 'clan-a' },
    }));
    expect(permissionPrisma.clanMember.findUnique).toHaveBeenCalledWith({
      where: { clan_id_user_id: { clan_id: 1n, user_id: 'viewer-1' } },
    });
    expect(permissionPrisma.clanAnnouncement.findFirst).not.toHaveBeenCalled();
    expect(permissionPrisma.clanAnnouncement.updateMany).not.toHaveBeenCalled();
    expect(permissionPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('普通族员不能上下架公告', async () => {
    permissionPrisma.clanAnnouncement.updateMany.mockResolvedValue({ count: 1 });

    const error = await guarded.toggleStatus(
      { user: { userId: 'viewer-1' } },
      8,
      'clan-a',
      { isActive: false },
    ).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).message).toBe('Admin access required');
    expect(permissionPrisma.clanMember.findUnique).toHaveBeenCalledWith({
      where: { clan_id_user_id: { clan_id: 1n, user_id: 'viewer-1' } },
    });
    expect(permissionPrisma.clanAnnouncement.findFirst).not.toHaveBeenCalled();
    expect(permissionPrisma.clanAnnouncement.updateMany).not.toHaveBeenCalled();
  });

  it('家族 A 的管理员更新家族 B 的公告得到 404 且不更新', async () => {
    permissionPrisma.clanAnnouncement.findFirst.mockImplementation(async ({ where }: any) => {
      if (where?.id === 8n && where.clan_id !== 1n) {
        return {
          id: 8n,
          clan_id: 2n,
          title: '乙家族公告',
          is_pinned: false,
          creator: { id: 'b', phone: '2', nickname: '乙' },
        };
      }
      return null;
    });
    const tx = {
      clanAnnouncement: {
        count: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findFirst: jest.fn(),
      },
    };
    permissionPrisma.$transaction.mockImplementation(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx));

    const error = await guarded.updateAnnouncement(
      { user: { userId: 'admin-a' } },
      8,
      { clanSlug: 'clan-a', title: '篡改' },
    ).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as NotFoundException).message).toBe('公告不存在');
    expect(permissionPrisma.clanMember.findUnique).toHaveBeenCalledWith({
      where: { clan_id_user_id: { clan_id: 1n, user_id: 'admin-a' } },
    });
    expect(permissionPrisma.clanAnnouncement.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 8n, clan_id: 1n, deleted_at: null },
    }));
    expect(permissionPrisma.$transaction).not.toHaveBeenCalled();
    expect(tx.clanAnnouncement.updateMany).not.toHaveBeenCalled();
  });

  it('家族 A 的管理员上下架家族 B 的公告得到 404 且不更新', async () => {
    permissionPrisma.clanAnnouncement.findFirst.mockImplementation(async ({ where }: any) => {
      if (where?.id === 8n && where.clan_id !== 1n) {
        return {
          id: 8n,
          clan_id: 2n,
          title: '乙家族公告',
          is_active: true,
          published_at: new Date('2026-01-01'),
          creator: { id: 'b', phone: '2', nickname: '乙' },
        };
      }
      return null;
    });
    permissionPrisma.clanAnnouncement.updateMany.mockResolvedValue({ count: 1 });

    const error = await guarded.toggleStatus(
      { user: { userId: 'admin-a' } },
      8,
      'clan-a',
      { isActive: false },
    ).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as NotFoundException).message).toBe('公告不存在');
    expect(permissionPrisma.clanAnnouncement.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 8n, clan_id: 1n, deleted_at: null },
    }));
    expect(permissionPrisma.clanAnnouncement.updateMany).not.toHaveBeenCalled();
  });
});
