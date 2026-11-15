import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@geneasphere/db';
import { AdminService } from '../admin.service';
import { CapabilityService } from '../../common/capability.service';
import { WechatOfficialProvider } from './wechat-official.provider';

const ARTICLE_STATUSES = new Set(['drafts', 'scheduled', 'sent']);

@Injectable()
export class AdminWechatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminService: AdminService,
    private readonly capability: CapabilityService,
    private readonly provider: WechatOfficialProvider,
  ) {}

  async getConfig(clanSlug: string, userId: string) {
    const clanId = await this.adminService.requireAdminBySlug(clanSlug, userId);
    const row = await this.prisma.clanWechatConfig.findUnique({ where: { clan_id: clanId } });
    return {
      config: this.publicConfig(row),
      status: this.publicStatus(row),
    };
  }

  async saveConfig(userId: string, body: { clanSlug: string; config?: Record<string, any> }) {
    const clanId = await this.adminService.requireAdminBySlug(body.clanSlug, userId);
    const input = body.config || {};
    const existing = await this.prisma.clanWechatConfig.findUnique({ where: { clan_id: clanId } });
    const data: Record<string, unknown> = {
      app_id: this.optionalText(input.app_id, existing?.app_id),
      token: this.optionalText(input.token, existing?.token),
      whitelisted_domains: input.whitelisted_domains ?? existing?.whitelisted_domains ?? null,
      follow_reply_type: input.follow_reply_type || existing?.follow_reply_type || 'TEXT',
      follow_reply_content: input.follow_reply_content ?? existing?.follow_reply_content ?? null,
      default_menu_json: input.default_menu_json ?? existing?.default_menu_json ?? null,
    };
    const secret = this.freshSecret(input.app_secret);
    if (secret) data.app_secret = secret;
    const aes = this.freshSecret(input.encoding_aes_key);
    if (aes) data.encoding_aes_key = aes;

    const row = existing
      ? await this.prisma.clanWechatConfig.update({ where: { clan_id: clanId }, data })
      : await this.prisma.clanWechatConfig.create({
          data: { clan_id: clanId, enabled: false, ...data },
        });

    await this.adminService.logAction({
      clanId,
      userId,
      action: 'SAVE_WECHAT_CONFIG',
      targetType: 'ClanWechatConfig',
      targetId: row.id.toString(),
      details: '保存公众号配置草稿',
    });

    return { config: this.publicConfig(row), status: this.publicStatus(row) };
  }

  async getStatus(clanSlug: string, userId: string) {
    const clanId = await this.adminService.requireAdminBySlug(clanSlug, userId);
    const row = await this.prisma.clanWechatConfig.findUnique({ where: { clan_id: clanId } });
    return this.publicStatus(row);
  }

  async verify(userId: string, clanSlug: string) {
    const clanId = await this.adminService.requireAdminBySlug(clanSlug, userId);
    this.assertWechatReady('连通性校验');
    const row = await this.prisma.clanWechatConfig.findUnique({ where: { clan_id: clanId } });
    if (!row?.app_id || !row.app_secret) {
      throw new BadRequestException('请先保存 AppID 与 AppSecret');
    }
    await this.provider.verifyConnectivity(row.app_id);
    return { verified: true };
  }

  async setEnabled(userId: string, body: { clanSlug: string; enabled: boolean }) {
    const clanId = await this.adminService.requireAdminBySlug(body.clanSlug, userId);
    if (body.enabled) {
      this.assertWechatReady('启用公众号');
    }
    const existing = await this.prisma.clanWechatConfig.findUnique({ where: { clan_id: clanId } });
    if (!existing) {
      throw new BadRequestException('请先保存公众号配置');
    }
    if (body.enabled && (!existing.app_id || !existing.app_secret)) {
      throw new BadRequestException('请先保存 AppID 与 AppSecret');
    }
    const row = await this.prisma.clanWechatConfig.update({
      where: { clan_id: clanId },
      data: { enabled: Boolean(body.enabled) },
    });
    await this.adminService.logAction({
      clanId,
      userId,
      action: body.enabled ? 'ENABLE_WECHAT' : 'DISABLE_WECHAT',
      targetType: 'ClanWechatConfig',
      targetId: row.id.toString(),
    });
    return { enabled: row.enabled };
  }

  async listArticles(clanSlug: string, userId: string, query: { status?: string; page?: string; pageSize?: string }) {
    const clanId = await this.adminService.requireAdminBySlug(clanSlug, userId);
    const page = parseInt(query.page || '1', 10) || 1;
    const pageSize = parseInt(query.pageSize || '20', 10) || 20;
    const where: any = { clan_id: clanId };
    if (query.status && ARTICLE_STATUSES.has(query.status)) where.status = query.status;
    const [rows, total] = await Promise.all([
      this.prisma.clanWechatArticle.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.clanWechatArticle.count({ where }),
    ]);
    return {
      data: rows.map((row) => this.publicArticle(row)),
      total,
      page,
      pageSize,
    };
  }

  async createArticle(userId: string, body: any) {
    const clanId = await this.adminService.requireAdminBySlug(body.clanSlug, userId);
    const status = body.status === 'scheduled' ? 'scheduled' : 'drafts';
    const row = await this.prisma.clanWechatArticle.create({
      data: {
        clan_id: clanId,
        title: String(body.title || '').trim(),
        digest: body.digest || null,
        content: body.content || '',
        cover_url: body.cover_url || null,
        article_type: body.article_type || 'NEWS',
        source_url: body.source_url || null,
        scheduled_at: body.scheduled_at ? new Date(body.scheduled_at) : null,
        target_tags: Array.isArray(body.target_tags) ? body.target_tags : [],
        status,
        created_by: userId,
      },
    });
    await this.adminService.logAction({
      clanId,
      userId,
      action: 'CREATE_WECHAT_ARTICLE',
      targetType: 'ClanWechatArticle',
      targetId: row.id.toString(),
      details: row.title,
    });
    return this.publicArticle(row);
  }

  async updateArticle(userId: string, id: string, body: any) {
    const clanId = await this.adminService.requireAdminBySlug(body.clanSlug, userId);
    const current = await this.loadArticle(BigInt(id), clanId);
    if (current.status === 'sent') {
      throw new BadRequestException('已发送内容不可编辑');
    }
    const row = await this.prisma.clanWechatArticle.update({
      where: { id: current.id },
      data: {
        title: body.title ?? current.title,
        digest: body.digest ?? current.digest,
        content: body.content ?? current.content,
        cover_url: body.cover_url ?? current.cover_url,
        article_type: body.article_type ?? current.article_type,
        source_url: body.source_url ?? current.source_url,
        scheduled_at: body.scheduled_at ? new Date(body.scheduled_at) : current.scheduled_at,
        target_tags: Array.isArray(body.target_tags) ? body.target_tags : current.target_tags,
      },
    });
    await this.adminService.logAction({
      clanId,
      userId,
      action: 'UPDATE_WECHAT_ARTICLE',
      targetType: 'ClanWechatArticle',
      targetId: row.id.toString(),
    });
    return this.publicArticle(row);
  }

  async publishArticle(userId: string, id: string, clanSlug: string) {
    const clanId = await this.adminService.requireAdminBySlug(clanSlug, userId);
    this.assertWechatReady('推送');
    const current = await this.loadArticle(BigInt(id), clanId);
    await this.provider.publishToFollowers({ clanId: clanId.toString(), title: current.title });
    const row = await this.prisma.clanWechatArticle.update({
      where: { id: current.id },
      data: { status: 'sent', published_at: new Date() },
    });
    await this.adminService.logAction({
      clanId,
      userId,
      action: 'PUBLISH_WECHAT_ARTICLE',
      targetType: 'ClanWechatArticle',
      targetId: row.id.toString(),
      details: row.title,
    });
    return { id: row.id.toString(), status: row.status, delivered: true };
  }

  async duplicateArticle(userId: string, id: string, clanSlug: string) {
    const clanId = await this.adminService.requireAdminBySlug(clanSlug, userId);
    const current = await this.loadArticle(BigInt(id), clanId);
    const row = await this.prisma.clanWechatArticle.create({
      data: {
        clan_id: clanId,
        title: `${current.title}（副本）`,
        digest: current.digest,
        content: current.content,
        cover_url: current.cover_url,
        article_type: current.article_type,
        source_url: current.source_url,
        target_tags: current.target_tags,
        status: 'drafts',
        created_by: userId,
      },
    });
    await this.adminService.logAction({
      clanId,
      userId,
      action: 'DUPLICATE_WECHAT_ARTICLE',
      targetType: 'ClanWechatArticle',
      targetId: row.id.toString(),
    });
    return this.publicArticle(row);
  }

  async deleteArticle(userId: string, id: string, clanSlug: string) {
    const clanId = await this.adminService.requireAdminBySlug(clanSlug, userId);
    const current = await this.loadArticle(BigInt(id), clanId);
    await this.prisma.clanWechatArticle.delete({ where: { id: current.id } });
    await this.adminService.logAction({
      clanId,
      userId,
      action: 'DELETE_WECHAT_ARTICLE',
      targetType: 'ClanWechatArticle',
      targetId: current.id.toString(),
    });
    return { success: true };
  }

  private assertWechatReady(action: string) {
    const status = this.capability.getStatus('wechat');
    if (!status.available) {
      throw new BadRequestException(`微信能力未配置，无法${action}。${status.reason || ''}`.trim());
    }
  }

  private async loadArticle(id: bigint, clanId: bigint) {
    const row = await this.prisma.clanWechatArticle.findFirst({ where: { id, clan_id: clanId } });
    if (!row) throw new NotFoundException('内容不存在');
    return row;
  }

  private optionalText(value: unknown, fallback?: string | null) {
    if (typeof value === 'string') return value.trim() || null;
    return fallback ?? null;
  }

  private freshSecret(value: unknown) {
    if (typeof value !== 'string') return null;
    const text = value.trim();
    if (!text || text.includes('*') || text === '已设置') return null;
    return text;
  }

  private publicConfig(row: { app_id?: string | null; app_secret?: string | null; token?: string | null; encoding_aes_key?: string | null; whitelisted_domains?: string | null; follow_reply_type?: string | null; follow_reply_content?: string | null; default_menu_json?: string | null; enabled?: boolean } | null) {
    return {
      app_id: row?.app_id || '',
      app_secret_masked: '',
      app_secret_set: Boolean(row?.app_secret),
      token: row?.token || '',
      encoding_aes_key: '',
      encoding_aes_key_set: Boolean(row?.encoding_aes_key),
      whitelisted_domains: row?.whitelisted_domains || '',
      follow_reply_type: row?.follow_reply_type || 'TEXT',
      follow_reply_content: row?.follow_reply_content || '',
      default_menu_json: row?.default_menu_json || '',
      enabled: Boolean(row?.enabled),
    };
  }

  private publicStatus(row: { app_id?: string | null; app_secret?: string | null; verified_at?: Date | null; enabled?: boolean } | null) {
    const capability = this.capability.getStatus('wechat');
    return {
      configured: Boolean(row?.app_id && row?.app_secret),
      verified: false,
      last_verified_at: row?.verified_at ? row.verified_at.toISOString() : '',
      followers_count: 0,
      monthly_message_quota: 0,
      monthly_message_used: 0,
      capability_available: capability.available,
      capability_reason: capability.reason || '',
      enabled: Boolean(row?.enabled),
    };
  }

  private publicArticle(row: any) {
    return {
      id: row.id.toString(),
      title: row.title,
      digest: row.digest,
      content: row.content,
      cover_url: row.cover_url,
      article_type: row.article_type,
      source_url: row.source_url,
      scheduled_at: row.scheduled_at,
      target_tags: row.target_tags,
      status: row.status,
      published_at: row.published_at,
      created_at: row.created_at,
    };
  }
}
