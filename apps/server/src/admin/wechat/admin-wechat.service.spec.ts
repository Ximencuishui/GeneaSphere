import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AdminWechatService } from './admin-wechat.service';
import { AdminService } from '../admin.service';
import { ClanResolverService } from '../../common/clan-resolver.service';

describe('AdminWechatService 公众号', () => {
  const prisma = {
    clanWechatConfig: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    clanWechatArticle: { findFirst: jest.fn(), update: jest.fn() },
  };
  const admin = { requireAdminBySlug: jest.fn(), logAction: jest.fn() };
  const capability = { getStatus: jest.fn() };
  const provider = { verifyConnectivity: jest.fn(), publishToFollowers: jest.fn() };
  const service = new AdminWechatService(prisma as never, admin as never, capability as never, provider as never);
  const authPrisma = {
    clan: { findUnique: jest.fn() },
    clanMember: { findUnique: jest.fn() },
    auditLog: { create: jest.fn() },
    clanWechatConfig: { findUnique: jest.fn() },
    clanWechatArticle: { findMany: jest.fn(), count: jest.fn() },
  };
  const realAdmin = new AdminService(authPrisma as never, new ClanResolverService(authPrisma as never));
  const guarded = new AdminWechatService(authPrisma as never, realAdmin, capability as never, provider as never);

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
    admin.requireAdminBySlug.mockResolvedValue(3n);
    admin.logAction.mockResolvedValue(undefined);
    capability.getStatus.mockReturnValue({
      available: false,
      reason: '管理员尚未配置真实服务提供商',
    });
    installMembership();
  });

  it('未配置微信时可以保存草稿，且不回显密钥', async () => {
    prisma.clanWechatConfig.findUnique.mockResolvedValue(null);
    prisma.clanWechatConfig.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 1n,
      ...data,
      enabled: false,
      verified_at: null,
    }));

    const saved = await service.saveConfig('admin-1', {
      clanSlug: 'zhu',
      config: { app_id: 'wx123', app_secret: 'secret-value', token: 'tok' },
    });

    expect(saved.config.app_secret_set).toBe(true);
    expect(JSON.stringify(saved)).not.toContain('secret-value');
    expect(provider.publishToFollowers).not.toHaveBeenCalled();
  });

  it('未配置微信时推送失败，不把文章标成已发送', async () => {
    await expect(service.publishArticle('admin-1', '4', 'zhu')).rejects.toBeInstanceOf(BadRequestException);

    expect(provider.publishToFollowers).not.toHaveBeenCalled();
    expect(prisma.clanWechatArticle.update).not.toHaveBeenCalled();
  });

  it('未配置微信时不能启用', async () => {
    prisma.clanWechatConfig.findUnique.mockResolvedValue({ id: 1n, app_id: 'wx123', app_secret: 'kept' });

    await expect(service.setEnabled('admin-1', { clanSlug: 'zhu', enabled: true })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.clanWechatConfig.update).not.toHaveBeenCalled();
  });

  it('家族 A 的管理员不能读取家族 B 的公众号配置', async () => {
    authPrisma.clanWechatConfig.findUnique.mockImplementation(async ({ where }: any) => {
      if (where.clan_id === 1n) {
        return {
          id: 1n,
          app_id: 'wx-clan-a',
          app_secret: 'secret-a',
          token: 'tok-a',
          enabled: true,
          verified_at: null,
        };
      }
      if (where.clan_id === 2n) {
        return {
          id: 2n,
          app_id: 'wx-clan-b',
          app_secret: 'secret-b',
          token: 'tok-b',
          enabled: true,
          verified_at: null,
        };
      }
      return null;
    });

    const own = await guarded.getConfig('clan-a', 'admin-a');
    const error = await guarded.getConfig('clan-b', 'admin-a').catch((err: unknown) => err);

    expect(own.config.app_id).toBe('wx-clan-a');
    expect(JSON.stringify(own)).not.toContain('wx-clan-b');
    expect(JSON.stringify(own)).not.toContain('secret-b');
    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).message).toBe('Admin access required');
    expect(authPrisma.clanWechatConfig.findUnique.mock.calls.map((call) => call[0].where.clan_id)).toEqual([1n]);
    expect(authPrisma.clanMember.findUnique).toHaveBeenCalledWith({
      where: { clan_id_user_id: { clan_id: 2n, user_id: 'admin-a' } },
    });
  });

  it('家族 A 的管理员不能读取家族 B 的文章列表', async () => {
    authPrisma.clanWechatArticle.findMany.mockImplementation(async ({ where }: any) => {
      if (where.clan_id === 2n) {
        return [{
          id: 9n,
          title: '乙家族草稿',
          digest: null,
          content: '机密',
          cover_url: null,
          article_type: 'NEWS',
          source_url: null,
          scheduled_at: null,
          target_tags: [],
          status: 'drafts',
          published_at: null,
          created_at: new Date(),
        }];
      }
      return [];
    });
    authPrisma.clanWechatArticle.count.mockImplementation(async ({ where }: any) => (where.clan_id === 2n ? 1 : 0));

    const own = await guarded.listArticles('clan-a', 'admin-a', {});
    const error = await guarded.listArticles('clan-b', 'admin-a', {}).catch((err: unknown) => err);

    expect(own.data).toEqual([]);
    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).message).toBe('Admin access required');
    expect(authPrisma.clanWechatArticle.findMany.mock.calls.map((call) => call[0].where.clan_id)).toEqual([1n]);
    expect(authPrisma.clanWechatArticle.count.mock.calls.map((call) => call[0].where.clan_id)).toEqual([1n]);
    expect(authPrisma.clanMember.findUnique).toHaveBeenCalledWith({
      where: { clan_id_user_id: { clan_id: 2n, user_id: 'admin-a' } },
    });
  });
});
