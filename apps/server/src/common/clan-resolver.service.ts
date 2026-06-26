import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '@geneasphere/db';

/**
 * 多家族 SaaS 路由解析：把 URL 段里的 clan slug 解析为 clan 元数据，
 * 并对 NORMAL 之外的家族（封禁/审核中）拒绝访问。
 *
 * 所有 /api/admin/* controller 入口统一改用此 service 替代 BigInt(query.clanId)。
 */
@Injectable()
export class ClanResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveOrThrow(clanSlug: string): Promise<{
    id: bigint;
    slug: string;
    name: string;
  }> {
    if (!clanSlug || typeof clanSlug !== 'string') {
      throw new ForbiddenException('clanSlug is required');
    }

    // slug 必须是合法的 url-safe 字符串，防止注入
    if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(clanSlug)) {
      throw new NotFoundException(`Invalid clan slug '${clanSlug}'`);
    }

    const clan = await this.prisma.clan.findUnique({
      where: { slug: clanSlug },
      select: { id: true, slug: true, name: true, status: true },
    });

    if (!clan) {
      throw new NotFoundException(`Clan '${clanSlug}' not found`);
    }
    if (clan.status !== 'NORMAL') {
      throw new ForbiddenException('家族当前不可用');
    }

    return {
      id: clan.id,
      slug: clan.slug!,
      name: clan.name,
    };
  }

  /**
   * 生成唯一 slug（前端未指定时由后端兜底）：
   * 1. 把 name 转成 url-safe 短串（去空格、转小写、去特殊字符）
   * 2. 重复时追加 -2/-3/...
   */
  async generateUniqueSlug(sourceName: string, preferred?: string): Promise<string> {
    const base = (preferred || this.normalize(sourceName)).slice(0, 32);
    let candidate = base;
    let i = 2;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const exists = await this.prisma.clan.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      if (!exists) return candidate;
      candidate = `${base}-${i}`;
      i++;
      if (i > 1000) {
        // 极端兜底：加随机串
        return `${base}-${Date.now().toString(36)}`;
      }
    }
  }

  private normalize(s: string): string {
    return s
      .toLowerCase()
      .replace(/[\s\u3000]+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 32) || 'clan';
  }
}
