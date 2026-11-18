process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef';

import { ForbiddenException, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { SearchPostStatus } from '@prisma/client';
import { SearchService } from './search.service';

const PLAIN_CONTACT = '13800138000';

function post(overrides: Record<string, unknown> = {}) {
  return {
    id: 5n,
    origin_place: '梅州',
    xipai_keywords: ['文'],
    contact_info: 'ciphertext-should-not-leak',
    created_by: 'creator-1',
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    updated_at: new Date('2026-01-01T00:00:00.000Z'),
    status: SearchPostStatus.PUBLISHED,
    reviewed_at: null,
    reviewer_id: null,
    reject_reason: null,
    ...overrides,
  };
}

describe('SearchService 寻亲帖安全', () => {
  const prisma = {
    searchPost: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
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
  const service = new SearchService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef';
    prisma.searchPost.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 5n,
      ...data,
    }));
    prisma.clanMember.findMany.mockImplementation(async ({ where }: { where: { user_id?: string; clan_id?: bigint } }) => {
      if (where.user_id === 'creator-1') return [{ clan_id: 1n, user_id: 'creator-1' }];
      if (where.clan_id === 1n) return [{ user_id: 'creator-1' }, { user_id: 'member-square' }];
      if (where.clan_id === 2n) return [{ user_id: 'other-clan' }];
      return [];
    });
    prisma.clan.findMany.mockResolvedValue([]);
    prisma.clan.findUnique.mockImplementation(async ({ where }: { where: { id: bigint } }) => {
      if (where.id === 1n) return { admin_user_id: 'primary-admin' };
      if (where.id === 2n) return { admin_user_id: 'other-admin' };
      return null;
    });
    prisma.clan.findFirst.mockResolvedValue(null);
    prisma.clanMember.findFirst.mockResolvedValue(null);
  });

  it('创建寻亲帖时入库使用登录用户，联系方式先加密', async () => {
    await service.createPost('梅州', ['文'], PLAIN_CONTACT, 'real-user');

    const saved = prisma.searchPost.create.mock.calls[0][0].data;
    expect(saved.created_by).toBe('real-user');
    expect(saved.contact_info).not.toBe(PLAIN_CONTACT);
    expect(saved.contact_info).toMatch(/^[0-9a-f]{32}:[0-9a-f]+$/);
  });

  it('缺少 ENCRYPTION_KEY 时加密失败', () => {
    delete process.env.ENCRYPTION_KEY;
    expect(() => service.encryptContactIfChanged(PLAIN_CONTACT)).toThrow(InternalServerErrorException);
    expect(() => service.encryptContactIfChanged(PLAIN_CONTACT)).toThrow(/ENCRYPTION_KEY/);
  });

  it('下架 REMOVED 后公开列表查不到', async () => {
    prisma.searchPost.findMany.mockResolvedValue([
      post(),
      post({ id: 6n, status: SearchPostStatus.REMOVED, origin_place: '梅州下架' }),
    ]);

    const results = await service.search('梅');

    expect(prisma.searchPost.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: { not: SearchPostStatus.REMOVED },
      }),
    }));
    expect(results.map((item) => item.post.id)).toEqual([5]);
  });

  it('下架 REMOVED 后公开详情查不到', async () => {
    prisma.searchPost.findUnique.mockResolvedValue(post({ status: SearchPostStatus.REMOVED }));

    await expect(service.getPostById(5n)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('公开搜索响应不含 contact_info', async () => {
    const secret = 'aabbccddeeff00112233445566778899:deadbeef';
    prisma.searchPost.findMany.mockResolvedValue([post({ contact_info: secret })]);

    const results = await service.search('梅');

    expect(results[0].post).not.toHaveProperty('contact_info');
    expect(results[0].contact_info).toBeUndefined();
    expect(JSON.stringify(results)).not.toContain(secret);
    expect(JSON.stringify(results)).not.toContain(PLAIN_CONTACT);
  });

  it('公开详情响应不含 contact_info', async () => {
    const secret = 'aabbccddeeff00112233445566778899:cafebabe';
    prisma.searchPost.findUnique.mockResolvedValue(post({ contact_info: secret }));

    const result = await service.getPostById(5n);

    expect(result.post).not.toHaveProperty('contact_info');
    expect(result.contact_info).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it('无权限用户拿不到联系方式', async () => {
    const encrypted = service.encryptContactIfChanged(PLAIN_CONTACT);
    prisma.searchPost.findUnique.mockResolvedValue(post({ contact_info: encrypted }));

    await expect(service.getContactForUser(5n, 'viewer-1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('帖子创建者能拿到解密后的明文联系方式', async () => {
    const encrypted = service.encryptContactIfChanged(PLAIN_CONTACT);
    prisma.searchPost.findUnique.mockResolvedValue(post({ contact_info: encrypted }));

    await expect(service.getContactForUser(5n, 'creator-1')).resolves.toBe(PLAIN_CONTACT);
  });

  it('该帖所属家族管理员能拿到解密后的明文联系方式', async () => {
    const encrypted = service.encryptContactIfChanged(PLAIN_CONTACT);
    prisma.searchPost.findUnique.mockResolvedValue(post({ contact_info: encrypted }));
    prisma.clan.findFirst.mockImplementation(async ({ where }: { where: { admin_user_id?: string } }) => {
      if (where.admin_user_id === 'primary-admin') return { id: 1n };
      return null;
    });

    await expect(service.getContactForUser(5n, 'primary-admin')).resolves.toBe(PLAIN_CONTACT);
  });

  it('该帖所属家族的管理员角色能拿到解密后的明文联系方式', async () => {
    const encrypted = service.encryptContactIfChanged(PLAIN_CONTACT);
    prisma.searchPost.findUnique.mockResolvedValue(post({ contact_info: encrypted }));
    prisma.clanMember.findFirst.mockImplementation(async ({ where }: { where: { user_id?: string } }) => {
      if (where.user_id === 'admin-role') return { id: 9n };
      return null;
    });

    await expect(service.getContactForUser(5n, 'admin-role')).resolves.toBe(PLAIN_CONTACT);
  });

  it('编辑时掩码或空联系方式不生成新密文', () => {
    expect(service.encryptContactIfChanged('***')).toBeUndefined();
    expect(service.encryptContactIfChanged('  ***  ')).toBeUndefined();
    expect(service.encryptContactIfChanged('')).toBeUndefined();
    expect(service.encryptContactIfChanged(undefined)).toBeUndefined();
  });

  it('编辑时新明文会先加密', () => {
    const encrypted = service.encryptContactIfChanged('13900001111');
    expect(encrypted).toBeDefined();
    expect(encrypted).not.toBe('13900001111');
    expect(encrypted).toMatch(/^[0-9a-f]{32}:[0-9a-f]+$/);
  });

  it('管理列表的家族归属只包含本族成员和本族管理员', async () => {
    const ids = await service.listCreatorIdsForClan(1n);

    expect(ids).toEqual(expect.arrayContaining(['creator-1', 'member-square', 'primary-admin']));
    expect(ids).not.toContain('other-clan');
    expect(ids).not.toContain('current-user');
    expect(prisma.clanMember.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { clan_id: 1n },
    }));
  });
});
