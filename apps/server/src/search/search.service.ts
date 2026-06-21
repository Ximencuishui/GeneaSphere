import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaClient, SearchPost } from '@prisma/client';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef';
const IV_LENGTH = 16;

export interface SearchResult {
  post: any;
  score: number;
  contact_info?: string;
}

@Injectable()
export class SearchService {
  private memoryPosts: SearchPost[] = [];
  private nextId = 1n;

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

  async createPost(origin_place: string, xipai_keywords: string[], contact_info: string, created_by?: string): Promise<any> {
    const encryptedContactInfo = this.encrypt(contact_info);
    
    const now = new Date();
    const post: SearchPost = {
      id: this.nextId++,
      origin_place,
      xipai_keywords,
      contact_info: encryptedContactInfo,
      created_by: created_by || 'unknown',
      created_at: now,
      updated_at: now,
    };
    
    this.memoryPosts.push(post);
    
    try {
      const result = await prisma.searchPost.create({
        data: {
          origin_place,
          xipai_keywords,
          contact_info: encryptedContactInfo,
          created_by: created_by || 'unknown',
        },
      });
      return { ...result, id: Number(result.id) };
    } catch {
      return { ...post, id: Number(post.id) };
    }
  }

  async search(query: string, origin_place?: string): Promise<SearchResult[]> {
    const normalizedQuery = query.toLowerCase().trim();
    
    let allPosts: SearchPost[] = [];
    
    try {
      const where: any = {
        OR: [
          {
            origin_place: {
              contains: normalizedQuery,
              mode: 'insensitive',
            },
          },
        ],
      };

      if (origin_place) {
        where.origin_place = {
          contains: origin_place.toLowerCase(),
          mode: 'insensitive',
        };
      }

      const posts = await prisma.searchPost.findMany({
        where,
        orderBy: { created_at: 'desc' },
      });

      const postsWithKeywordMatch = await prisma.searchPost.findMany({
        where: {
          xipai_keywords: {
            hasSome: [normalizedQuery],
          },
          ...(origin_place ? { origin_place: { contains: origin_place.toLowerCase(), mode: 'insensitive' } } : {}),
        },
        orderBy: { created_at: 'desc' },
      });

      const dbPosts = [...new Map([...posts, ...postsWithKeywordMatch].map(post => [post.id, post])).values()];
      allPosts = [...new Map([...dbPosts, ...this.memoryPosts].map(post => [post.id, post])).values()];
    } catch {
      allPosts = this.memoryPosts;
    }

    const filteredPosts = allPosts.filter(post => {
      const keywords = Array.isArray(post.xipai_keywords) ? post.xipai_keywords : [];
      
      const keywordMatch = keywords.some(keyword => 
        keyword.toLowerCase().includes(normalizedQuery)
      );
      const originMatch = post.origin_place.toLowerCase().includes(normalizedQuery);
      
      if (origin_place) {
        const originFilterMatch = post.origin_place.toLowerCase().includes(origin_place.toLowerCase());
        return (keywordMatch || originMatch) && originFilterMatch;
      }
      
      return keywordMatch || originMatch;
    });

    const results: SearchResult[] = filteredPosts.map(post => {
      let score = 0;
      
      for (const keyword of post.xipai_keywords) {
        const lowerKeyword = keyword.toLowerCase();
        if (lowerKeyword === normalizedQuery) {
          score += 10;
        } else if (lowerKeyword.includes(normalizedQuery)) {
          score += 5;
        }
      }

      if (post.origin_place.toLowerCase().includes(normalizedQuery)) {
        score += 3;
      }

      return {
        post: { ...post, id: Number(post.id) },
        score,
      };
    });

    return results.sort((a, b) => b.score - a.score);
  }

  async getPostById(id: bigint, isAdmin: boolean = false): Promise<SearchResult> {
    const post = await prisma.searchPost.findUnique({
      where: { id },
    });

    if (!post) {
      throw new Error('Post not found');
    }

    let contact_info: string | undefined;
    if (isAdmin) {
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

    const post = await prisma.searchPost.findUnique({
      where: { id: postId },
    });

    if (!post) {
      throw new Error('Post not found');
    }

    return this.decrypt(post.contact_info);
  }
}
