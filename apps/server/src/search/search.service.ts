import {
  Injectable,
  InternalServerErrorException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '@geneasphere/db';
import { Prisma, Role, SearchPost, SearchPostStatus } from '@prisma/client';
import * as crypto from 'crypto';

/** 管理端回显、以及「未修改联系方式」时提交的占位掩码。 */
export const SEARCH_CONTACT_MASK = '***';

const IV_LENGTH = 16;

export interface SearchResult {
  post: any;
  score: number;
  contact_info?: string;
}

/**
 * AES-256 密钥只从环境变量读取。源码不提供默认值，避免仓库里的常量被当成正式密钥。
 * 必须是 32 字节（与 createCipheriv('aes-256-cbc') 的密钥长度一致）。
 */
function readEncryptionKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (typeof raw !== 'string' || raw.length === 0) {
    throw new InternalServerErrorException(
      '缺少环境变量 ENCRYPTION_KEY，无法加密或解密寻亲联系方式',
    );
  }
  const key = Buffer.from(raw, 'utf8');
  if (key.length !== 32) {
    throw new InternalServerErrorException(
      '环境变量 ENCRYPTION_KEY 必须为 32 字节，才能用于 AES-256 加密寻亲联系方式',
    );
  }
  return key;
}

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  private encrypt(text: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', readEncryptionKey(), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
  }

  private decrypt(encryptedText: string): string {
    const parts = encryptedText.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedData = Buffer.from(parts[1], 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', readEncryptionKey(), iv);
    let decrypted = decipher.update(encryptedData);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  }

  /**
   * 掩码、空白或未传表示用户没有改联系方式，调用方不得覆盖原密文。
   * 新明文返回加密后的字符串。
   */
  encryptContactIfChanged(value?: string | null): string | undefined {
    if (value == null) return undefined;
    const trimmed = value.trim();
    if (trimmed === '' || trimmed === SEARCH_CONTACT_MASK) return undefined;
    return this.encrypt(trimmed);
  }

  /**
   * search_posts 没有 clan_id。家族归属 = 创建者是该族 clan_members.user_id，
   * 或创建者是该族 clans.admin_user_id（族长可能不在成员表里）。
   */
  async listCreatorIdsForClan(clanId: bigint): Promise<string[]> {
    const [members, clan] = await Promise.all([
      this.prisma.clanMember.findMany({
        where: { clan_id: clanId },
        select: { user_id: true },
      }),
      this.prisma.clan.findUnique({
        where: { id: clanId },
        select: { admin_user_id: true },
      }),
    ]);
    const ids = new Set<string>();
    for (const member of members) {
      if (member.user_id) ids.add(member.user_id);
    }
    if (clan?.admin_user_id) ids.add(clan.admin_user_id);
    return [...ids];
  }

  async postBelongsToClan(createdBy: string, clanId: bigint): Promise<boolean> {
    if (!createdBy) return false;
    const ids = await this.listCreatorIdsForClan(clanId);
    return ids.includes(createdBy);
  }

  async createPost(
    origin_place: string,
    xipai_keywords: string[],
    contact_info: string,
    userId: string,
  ): Promise<any> {
    if (!userId) {
      throw new UnauthorizedException('请先登录');
    }
    const encryptedContactInfo = this.encrypt(contact_info);
    try {
      const result = await this.prisma.searchPost.create({
        data: {
          origin_place,
          xipai_keywords,
          contact_info: encryptedContactInfo,
          created_by: userId,
        },
      });
      return { ...result, id: Number(result.id), contact_info: SEARCH_CONTACT_MASK };
    } catch (err: any) {
      throw new InternalServerErrorException(`创建寻亲帖失败：${err.message}`);
    }
  }

  async search(query: string, origin_place?: string): Promise<SearchResult[]> {
    const normalizedQuery = query.toLowerCase().trim();

    const where: Prisma.SearchPostWhereInput = {
      status: { not: SearchPostStatus.REMOVED },
      OR: [
        { origin_place: { contains: normalizedQuery, mode: 'insensitive' } },
      ],
    };
    if (origin_place) {
      where.OR!.push({
        origin_place: { contains: origin_place.toLowerCase(), mode: 'insensitive' },
      } as any);
    }

    let posts: SearchPost[] = [];
    try {
      posts = await this.prisma.searchPost.findMany({ where, orderBy: { created_at: 'desc' } });
    } catch (err: any) {
      throw new InternalServerErrorException(`搜索寻亲帖失败：${err.message}`);
    }

    const visiblePosts = posts.filter((post) => post.status !== SearchPostStatus.REMOVED);

    const filteredPosts = visiblePosts.filter((post) => {
      const keywords = Array.isArray(post.xipai_keywords) ? post.xipai_keywords : [];
      const keywordMatch = keywords.some((keyword) =>
        keyword.toLowerCase().includes(normalizedQuery),
      );
      const originMatch = post.origin_place.toLowerCase().includes(normalizedQuery);
      if (origin_place) {
        const originFilterMatch = post.origin_place
          .toLowerCase()
          .includes(origin_place.toLowerCase());
        return (keywordMatch || originMatch) && originFilterMatch;
      }
      return keywordMatch || originMatch;
    });

    const results: SearchResult[] = filteredPosts.map((post) => {
      let score = 0;
      for (const keyword of post.xipai_keywords) {
        const lower = keyword.toLowerCase();
        if (lower === normalizedQuery) score += 10;
        else if (lower.includes(normalizedQuery)) score += 5;
      }
      if (post.origin_place.toLowerCase().includes(normalizedQuery)) score += 3;
      return {
        post: this.toPublicPost(post),
        score,
      };
    });

    return results.sort((a, b) => b.score - a.score);
  }

  async getPostById(id: bigint): Promise<SearchResult> {
    const post = await this.prisma.searchPost.findUnique({ where: { id } });

    if (!post || post.status === SearchPostStatus.REMOVED) {
      throw new NotFoundException('Post not found');
    }

    return {
      post: this.toPublicPost(post),
      score: 0,
    };
  }

  /**
   * 明文联系方式只给帖子创建者，或创建者所属家族的管理员。
   * 管理员判定与 AdminService.requireAdmin 相同：clan.admin_user_id，或成员角色 OWNER/ADMIN。
   * 不接受调用方传入的 isAdmin。
   */
  async getContactForUser(postId: bigint, userId: string): Promise<string> {
    if (!userId) {
      throw new UnauthorizedException('请先登录');
    }

    const post = await this.prisma.searchPost.findUnique({
      where: { id: postId },
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    const allowed = post.created_by === userId || await this.isAdminOfCreatorClan(post.created_by, userId);
    if (!allowed) {
      throw new ForbiddenException('无权查看联系方式');
    }

    return this.decrypt(post.contact_info);
  }

  private async isAdminOfCreatorClan(creatorId: string, userId: string): Promise<boolean> {
    const clanIds = await this.clanIdsOfUser(creatorId);
    if (clanIds.length === 0) return false;

    const asPrimaryAdmin = await this.prisma.clan.findFirst({
      where: { id: { in: clanIds }, admin_user_id: userId },
      select: { id: true },
    });
    if (asPrimaryAdmin) return true;

    const member = await this.prisma.clanMember.findFirst({
      where: {
        user_id: userId,
        clan_id: { in: clanIds },
        role: { in: [Role.OWNER, Role.ADMIN] },
      },
      select: { id: true },
    });
    return !!member;
  }

  /** 用户所属家族：成员表上的 clan_id，加上其担任 admin_user_id 的家族。 */
  private async clanIdsOfUser(userId: string): Promise<bigint[]> {
    const [memberships, owned] = await Promise.all([
      this.prisma.clanMember.findMany({
        where: { user_id: userId },
        select: { clan_id: true },
      }),
      this.prisma.clan.findMany({
        where: { admin_user_id: userId },
        select: { id: true },
      }),
    ]);
    const ids = new Set<bigint>();
    for (const membership of memberships) ids.add(membership.clan_id);
    for (const clan of owned) ids.add(clan.id);
    return [...ids];
  }

  /** 公开响应去掉联系方式，既不回密文也不回明文。 */
  private toPublicPost(post: SearchPost) {
    const { contact_info, ...rest } = post;
    return { ...rest, id: Number(post.id) };
  }
}
