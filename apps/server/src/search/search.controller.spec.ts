process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef';

import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { SearchPostStatus } from '@prisma/client';
import { IS_PUBLIC_KEY } from '../auth/public.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

const PLAIN_CONTACT = '13800138000';

describe('SearchController 寻亲帖发布与联系方式', () => {
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
  const controller = new SearchController(service);

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef';
    prisma.searchPost.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 5n,
      ...data,
    }));
    prisma.clanMember.findMany.mockResolvedValue([{ clan_id: 1n }]);
    prisma.clan.findMany.mockResolvedValue([]);
    prisma.clan.findFirst.mockResolvedValue(null);
    prisma.clanMember.findFirst.mockResolvedValue(null);
  });

  it('未登录不能发布寻亲帖', async () => {
    const isPublic = Reflect.getMetadata(IS_PUBLIC_KEY, SearchController.prototype.createPost);
    expect(isPublic).not.toBe(true);
    const guards = Reflect.getMetadata(GUARDS_METADATA, SearchController);
    expect(guards).toEqual(expect.arrayContaining([JwtAuthGuard]));

    await expect(controller.createPost({ user: {} }, {
      origin_place: '梅州',
      xipai_keywords: ['文'],
      contact_info: PLAIN_CONTACT,
    })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.searchPost.create).not.toHaveBeenCalled();
  });

  it('伪造 created_by 被忽略，入库使用 req.user', async () => {
    await controller.createPost(
      { user: { userId: 'real-user' } },
      {
        origin_place: '梅州',
        xipai_keywords: ['文'],
        contact_info: PLAIN_CONTACT,
        created_by: 'current-user',
      } as never,
    );

    expect(prisma.searchPost.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ created_by: 'real-user' }),
    });
    const saved = prisma.searchPost.create.mock.calls[0][0].data;
    expect(saved.created_by).not.toBe('current-user');
  });

  it('前端传 isAdmin: true 不能拿到联系方式', async () => {
    const encrypted = service.encryptContactIfChanged(PLAIN_CONTACT);
    prisma.searchPost.findUnique.mockResolvedValue({
      id: 5n,
      origin_place: '梅州',
      xipai_keywords: ['文'],
      contact_info: encrypted,
      created_by: 'creator-1',
      created_at: new Date(),
      updated_at: new Date(),
      status: SearchPostStatus.PUBLISHED,
      reviewed_at: null,
      reviewer_id: null,
      reject_reason: null,
    });

    await expect(
      controller.getContactInfo({ user: { userId: 'viewer-1' } }, '5', 'true'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.searchPost.findUnique).toHaveBeenCalled();
  });
});
