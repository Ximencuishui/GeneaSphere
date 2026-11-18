process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef';

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { MergeController } from './merge.controller';
import { SearchService } from '../../search/search.service';

const ORIGINAL_CIPHER = '00112233445566778899aabbccddeeff:originalcipher';

function post(overrides: Record<string, unknown> = {}) {
  return {
    id: 5n,
    origin_place: '梅州',
    xipai_keywords: ['文'],
    contact_info: ORIGINAL_CIPHER,
    created_by: 'creator-1',
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    updated_at: new Date('2026-01-01T00:00:00.000Z'),
    status: 'PUBLISHED',
    ...overrides,
  };
}

describe('MergeController 寻亲帖管理', () => {
  const admin = {
    requireAdminBySlug: jest.fn(),
    requireAdmin: jest.fn(),
    logAction: jest.fn(),
  };
  const prisma = {
    searchPost: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    clanMember: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    clan: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
  };
  const clanResolver = {
    resolveOrThrow: jest.fn(),
  };
  const searchService = new SearchService(prisma as never);
  const controller = new MergeController(
    admin as never,
    prisma as never,
    clanResolver as never,
    searchService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef';
    admin.requireAdminBySlug.mockResolvedValue(1n);
    admin.requireAdmin.mockResolvedValue(undefined);
    admin.logAction.mockResolvedValue(undefined);
    clanResolver.resolveOrThrow.mockResolvedValue({ id: 1n, slug: 'zhu', name: '朱' });
    prisma.clanMember.findMany.mockImplementation(async ({ where }: { where: { clan_id?: bigint } }) => {
      if (where.clan_id === 1n) return [{ user_id: 'creator-1' }, { user_id: 'member-square' }];
      if (where.clan_id === 2n) return [{ user_id: 'other-clan' }];
      return [];
    });
    prisma.clan.findUnique.mockImplementation(async ({ where }: { where: { id: bigint } }) => {
      if (where.id === 1n) return { admin_user_id: 'clan-admin' };
      if (where.id === 2n) return { admin_user_id: 'other-admin' };
      return null;
    });
    prisma.searchPost.findUnique.mockResolvedValue(post());
    prisma.searchPost.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      ...post(),
      ...data,
    }));
    prisma.searchPost.delete.mockResolvedValue(post());
  });

  it('跨家族编辑寻亲帖被拒绝', async () => {
    clanResolver.resolveOrThrow.mockResolvedValue({ id: 2n, slug: 'other', name: '别族' });

    await expect(controller.editSearchPost(
      { user: { userId: 'other-admin' } },
      '5',
      { origin_place: '被篡改' },
      'other',
    )).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.searchPost.update).not.toHaveBeenCalled();
    expect(admin.requireAdmin).not.toHaveBeenCalled();
  });

  it('跨家族删除寻亲帖被拒绝', async () => {
    clanResolver.resolveOrThrow.mockResolvedValue({ id: 2n, slug: 'other', name: '别族' });

    await expect(controller.deleteSearchPost(
      { user: { userId: 'other-admin' } },
      '5',
      'other',
    )).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.searchPost.delete).not.toHaveBeenCalled();
  });

  it('非创建者且非该族管理员不能编辑寻亲帖', async () => {
    admin.requireAdmin.mockRejectedValue(new ForbiddenException('Admin access required'));

    await expect(controller.editSearchPost(
      { user: { userId: 'viewer-1' } },
      '5',
      { origin_place: '被篡改' },
      'zhu',
    )).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.searchPost.update).not.toHaveBeenCalled();
  });

  it('非创建者且非该族管理员不能删除寻亲帖', async () => {
    admin.requireAdmin.mockRejectedValue(new ForbiddenException('Admin access required'));

    await expect(controller.deleteSearchPost(
      { user: { userId: 'viewer-1' } },
      '5',
      'zhu',
    )).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.searchPost.delete).not.toHaveBeenCalled();
  });

  it('创建者可以编辑本族寻亲帖', async () => {
    await controller.editSearchPost(
      { user: { userId: 'creator-1' } },
      '5',
      { origin_place: '梅州丰顺' },
      'zhu',
    );

    expect(admin.requireAdmin).not.toHaveBeenCalled();
    expect(prisma.searchPost.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 5n },
      data: expect.objectContaining({ origin_place: '梅州丰顺' }),
    }));
  });

  it('创建者可以删除本族寻亲帖', async () => {
    await controller.deleteSearchPost({ user: { userId: 'creator-1' } }, '5', 'zhu');

    expect(admin.requireAdmin).not.toHaveBeenCalled();
    expect(prisma.searchPost.delete).toHaveBeenCalledWith({ where: { id: 5n } });
  });

  it('该族管理员可以编辑本族寻亲帖', async () => {
    await controller.editSearchPost(
      { user: { userId: 'clan-admin' } },
      '5',
      { origin_place: '梅州丰顺' },
      'zhu',
    );

    expect(admin.requireAdmin).toHaveBeenCalledWith(1n, 'clan-admin');
    expect(prisma.searchPost.update).toHaveBeenCalled();
  });

  it('该族管理员可以删除本族寻亲帖', async () => {
    await controller.deleteSearchPost({ user: { userId: 'clan-admin' } }, '5', 'zhu');

    expect(admin.requireAdmin).toHaveBeenCalledWith(1n, 'clan-admin');
    expect(prisma.searchPost.delete).toHaveBeenCalledWith({ where: { id: 5n } });
  });

  it('编辑时掩码不覆盖原密文', async () => {
    await controller.editSearchPost(
      { user: { userId: 'creator-1' } },
      '5',
      { contact_info: '***' },
      'zhu',
    );
    await controller.editSearchPost(
      { user: { userId: 'creator-1' } },
      '5',
      { contact_info: '' },
      'zhu',
    );

    for (const call of prisma.searchPost.update.mock.calls) {
      expect(call[0].data.contact_info).toBeUndefined();
    }
  });

  it('编辑时新明文会先加密再入库', async () => {
    await controller.editSearchPost(
      { user: { userId: 'creator-1' } },
      '5',
      { contact_info: '13900001111' },
      'zhu',
    );

    const saved = prisma.searchPost.update.mock.calls[0][0].data.contact_info as string;
    expect(saved).not.toBe('13900001111');
    expect(saved).not.toBe(ORIGINAL_CIPHER);
    expect(saved).toMatch(/^[0-9a-f]{32}:[0-9a-f]+$/);

    prisma.searchPost.findUnique.mockResolvedValue(post({ contact_info: saved }));
    await expect(searchService.getContactForUser(5n, 'creator-1')).resolves.toBe('13900001111');
  });

  it('管理列表能查到本族成员发的广场帖，查不到其他家族的帖', async () => {
    const rows = [
      post({ id: 11n, created_by: 'member-square', origin_place: '广场帖' }),
      post({ id: 12n, created_by: 'other-clan', origin_place: '外族帖' }),
      post({ id: 13n, created_by: 'current-user', origin_place: '伪造创建者' }),
    ];
    prisma.searchPost.findMany.mockImplementation(async ({ where }: { where: { created_by: { in: string[] } } }) => {
      const ids = where.created_by.in;
      return rows.filter((row) => ids.includes(String(row.created_by)));
    });
    prisma.searchPost.count.mockImplementation(async ({ where }: { where: { created_by: { in: string[] } } }) => {
      const ids = where.created_by.in;
      return rows.filter((row) => ids.includes(String(row.created_by))).length;
    });

    const result = await controller.getSearchPosts({ user: { userId: 'clan-admin' } }, 'zhu', '1', '20');

    expect(result.data.map((row) => row.created_by)).toEqual(['member-square']);
    expect(result.data.map((row) => row.origin_place)).not.toContain('外族帖');
    expect(result.data.map((row) => row.origin_place)).not.toContain('伪造创建者');
    expect(result.data[0].contact_info).toBe('***');
    const queriedIds = prisma.searchPost.findMany.mock.calls[0][0].where.created_by.in as string[];
    expect(queriedIds).toEqual(expect.arrayContaining(['member-square', 'creator-1', 'clan-admin']));
    expect(queriedIds).not.toContain('other-clan');
    expect(queriedIds).not.toContain('current-user');
  });
});