import { Injectable, InternalServerErrorException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '@geneasphere/db';
import { SearchPost, Prisma } from '@prisma/client';
import * as crypto from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef';
const IV_LENGTH = 16;

export interface SearchResult {
  post: any;
  score: number;
  contact_info?: string;
}

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  private encrypt(text: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
  }

  private decrypt(encryptedText: string): string {
    const parts = encryptedText.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedData = Buffer.from(parts[1], 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let decrypted = decipher.update(encryptedData);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  }

  async createPost(
    origin_place: string,
    xipai_keywords: string[],
    contact_info: string,
    created_by?: string,
  ): Promise<any> {
    const encryptedContactInfo = this.encrypt(contact_info);
    try {
      const result = await this.prisma.searchPost.create({
        data: {
          origin_place,
          xipai_keywords,
          contact_info: encryptedContactInfo,
          created_by: created_by || 'unknown',
        },
      });
      return { ...result, id: Number(result.id) };
    } catch (err: any) {
      throw new InternalServerErrorException(`创建寻亲帖失败：${err.message}`);
    }
  }

  async search(query: string, origin_place?: string): Promise<SearchResult[]> {
    const normalizedQuery = query.toLowerCase().trim();

    const where: Prisma.SearchPostWhereInput = {
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

    const filteredPosts = posts.filter((post) => {
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
        post: { ...post, id: Number(post.id) },
        score,
      };
    });

    return results.sort((a, b) => b.score - a.score);
  }

  async getPostById(id: bigint, _isAdmin: boolean = false): Promise<SearchResult> {
    const post = await this.prisma.searchPost.findUnique({ where: { id } });

    if (!post) {
      throw new Error('Post not found');
    }

    // _isAdmin 保留参数签名以便未来调用方按需决定是否解密联系方式；
    // 当前 contact_info 由专用 /post/:id/contact 端点按权限公开，避免误返回敏感字段。
    let contact_info: string | undefined;
    if (_isAdmin && post.contact_info) {
      contact_info = this.decrypt(post.contact_info);
    }

    return {
      post,
      score: 0,
      contact_info,
    };
  }

  async decryptContactInfo(postId: bigint, isAdmin: boolean): Promise<string> {
    if (!isAdmin) {
      throw new ForbiddenException('Only admin or authorized users can view contact information');
    }

    const post = await this.prisma.searchPost.findUnique({
      where: { id: postId },
    });

    if (!post) {
      throw new Error('Post not found');
    }

    return this.decrypt(post.contact_info);
  }
}
