import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BuddyMatchStatus, PhotoClaimStatus } from '@prisma/client';
import { BuddyService } from './buddy.service';
import { ClaimPhotoDto } from './dto/claim-photo.dto';
import { RespondMatchDto } from './dto/respond-match.dto';

/**
 * BuddyService 在 BuddiesPage 的"按照片找 / 谁在找我 / 照片认领"闭环中
 * 承担隐私过滤与匹配记录维护的职责。这里用最小化的 mock 覆盖以下关键不变量：
 * - getInboundMatches 仅返回 matched_user_id = 当前用户的记录，避免越权看到别人收到的招呼；
 * - findByPhoto 在缺失入参时显式抛错；尊重 allow_photo_find_me 与 allow_cross_clan_friend_finding；
 * - claimPhoto / approvePhotoClaim 守住"照片不存在 / 重复认领 / 重复审核"的状态机。
 */

interface FakeBuddyMatchRecord {
  id: bigint;
  requester_id: string;
  matched_user_id: string;
  status: BuddyMatchStatus;
  created_at: Date;
}

interface FakePhotoClaimRecord {
  id: bigint;
  media_id: bigint;
  claimer_user_id: string;
  status: PhotoClaimStatus;
  position_description: string | null;
  verified_by: string | null;
  created_at: Date;
}

interface FakeUserSetting {
  user_id: string;
  allow_photo_find_me?: boolean;
  allow_cross_clan_friend_finding?: boolean;
}

function buildPrismaMock() {
  const matches = new Map<bigint, FakeBuddyMatchRecord>();
  const photoClaims = new Map<bigint, FakePhotoClaimRecord>();
  const userSettings = new Map<string, FakeUserSetting>();
  const mediaArchive = new Map<bigint, { id: bigint; deleted_at: Date | null }>();
  const notifications: any[] = [];

  let nextId = BigInt(1);
  const allocateId = () => {
    const id = nextId;
    nextId = nextId + BigInt(1);
    return id;
  };

  return {
    state: { matches, photoClaims, userSettings, mediaArchive, notifications },
    prisma: {
      buddyMatchRecord: {
        findFirst: jest.fn(async ({ where }: any) => {
          const { id, requester_id, matched_user_id, status } = where ?? {};
          for (const r of matches.values()) {
            if (id !== undefined && r.id !== id) continue;
            if (requester_id !== undefined && r.requester_id !== requester_id) continue;
            if (matched_user_id !== undefined && r.matched_user_id !== matched_user_id) continue;
            if (status !== undefined && r.status !== status) continue;
            return {
              ...r,
              requester: {
                id: r.requester_id,
                nickname: 'requester',
                avatar_url: null,
              },
              matched_user: {
                id: r.matched_user_id,
                nickname: 'matched',
                avatar_url: null,
              },
            };
          }
          return null;
        }),
        findMany: jest.fn(async ({ where }: any) => {
          const items: any[] = [];
          for (const r of matches.values()) {
            const w = where ?? {};
            if (w.matched_user_id !== undefined && r.matched_user_id !== w.matched_user_id) continue;
            if (w.requester_id !== undefined && r.requester_id !== w.requester_id) continue;
            if (w.status !== undefined && r.status !== w.status) continue;
            if (w.OR) {
              const ok = w.OR.some(
                (sub: any) =>
                  sub.requester_id === r.requester_id ||
                  sub.matched_user_id === r.matched_user_id,
              );
              if (!ok) continue;
            }
            items.push({
              ...r,
              requester: {
                id: r.requester_id,
                nickname: 'requester',
                avatar_url: null,
              },
              matched_user: {
                id: r.matched_user_id,
                nickname: 'matched',
                avatar_url: null,
              },
            });
          }
          return items;
        }),
        create: jest.fn(async ({ data }: any) => {
          const rec: FakeBuddyMatchRecord = {
            id: allocateId(),
            requester_id: data.requester_id,
            matched_user_id: data.matched_user_id,
            status: data.status ?? BuddyMatchStatus.PENDING,
            created_at: new Date(),
          };
          matches.set(rec.id, rec);
          return rec;
        }),
        update: jest.fn(async ({ where, data }: any) => {
          const cur = matches.get(where.id);
          if (!cur) throw new Error('not found');
          const next = { ...cur, ...data };
          matches.set(cur.id, next);
          return next;
        }),
      },
      photoClaimRecord: {
        findFirst: jest.fn(async ({ where }: any) => {
          for (const c of photoClaims.values()) {
            const w = where ?? {};
            if (w.media_id !== undefined && c.media_id !== w.media_id) continue;
            if (w.claimer_user_id !== undefined && c.claimer_user_id !== w.claimer_user_id) continue;
            if (w.status !== undefined && c.status !== w.status) continue;
            return {
              ...c,
              claimer: { id: c.claimer_user_id, nickname: 'claimer', avatar_url: null },
            };
          }
          return null;
        }),
        findMany: jest.fn(async ({ where }: any) => {
          const items: any[] = [];
          for (const c of photoClaims.values()) {
            const w = where ?? {};
            if (w.media_id !== undefined && c.media_id !== w.media_id) continue;
            if (w.claimer_user_id !== undefined && c.claimer_user_id !== w.claimer_user_id) continue;
            items.push({
              ...c,
              claimer: { id: c.claimer_user_id, nickname: 'claimer', avatar_url: null },
            });
          }
          return items;
        }),
        create: jest.fn(async ({ data }: any) => {
          const rec: FakePhotoClaimRecord = {
            id: allocateId(),
            media_id: BigInt(data.media_id),
            claimer_user_id: data.claimer_user_id,
            status: data.status ?? PhotoClaimStatus.PENDING,
            position_description: data.position_description ?? null,
            verified_by: data.verified_by ?? null,
            created_at: new Date(),
          };
          photoClaims.set(rec.id, rec);
          return rec;
        }),
        findUnique: jest.fn(async ({ where }: any) => {
          const cur = photoClaims.get(where.id);
          if (!cur) return null;
          return cur;
        }),
        update: jest.fn(async ({ where, data }: any) => {
          const cur = photoClaims.get(where.id);
          if (!cur) throw new Error('not found');
          const next = { ...cur, ...data };
          photoClaims.set(cur.id, next);
          return next;
        }),
      },
      userSetting: {
        findUnique: jest.fn(async ({ where }: any) => {
          return userSettings.get(where.user_id) ?? null;
        }),
      },
      mediaArchive: {
        findUnique: jest.fn(async ({ where }: any) => {
          const cur = mediaArchive.get(where.id);
          return cur ? { id: cur.id, deleted_at: cur.deleted_at } : null;
        }),
        findMany: jest.fn(async ({ where }: any) => {
          const items: any[] = [];
          for (const m of mediaArchive.values()) {
            const w = where ?? {};
            if (w.deleted_at !== undefined && m.deleted_at !== w.deleted_at) continue;
            items.push({
              id: m.id,
              taken_year: 1990,
              taken_location: '北京',
              file_url: `https://example.com/${m.id}.jpg`,
              thumb_url: `https://example.com/${m.id}_thumb.jpg`,
            });
          }
          return items;
        }),
      },
      mediaPersonLink: {
        findMany: jest.fn(async () => []),
      },
      notification: {
        create: jest.fn(async ({ data }: any) => {
          notifications.push(data);
          return data;
        }),
      },
    },
  };
}

describe('BuddyService', () => {
  describe('getInboundMatches（谁在找我）', () => {
    it('仅返回 matched_user_id = 当前用户的记录，越权记录被过滤', async () => {
      const { prisma, state } = buildPrismaMock();
      const svc = new BuddyService(prisma as never);

      state.matches.set(BigInt(1), {
        id: BigInt(1),
        requester_id: 'userA',
        matched_user_id: 'me',
        status: BuddyMatchStatus.PENDING,
        created_at: new Date(),
      });
      state.matches.set(BigInt(2), {
        id: BigInt(2),
        requester_id: 'userB',
        matched_user_id: 'someone-else',
        status: BuddyMatchStatus.PENDING,
        created_at: new Date(),
      });
      state.matches.set(BigInt(3), {
        id: BigInt(3),
        requester_id: 'me',
        matched_user_id: 'userC',
        status: BuddyMatchStatus.PENDING,
        created_at: new Date(),
      });

      const inbound = await svc.getInboundMatches('me');
      expect(inbound).toHaveLength(1);
      expect(inbound[0].id).toBe(BigInt(1));
      expect(inbound[0].matched_user_id).toBe('me');
    });

    it('status 参数会作为附加过滤条件', async () => {
      const { prisma, state } = buildPrismaMock();
      const svc = new BuddyService(prisma as never);

      state.matches.set(BigInt(1), {
        id: BigInt(1),
        requester_id: 'userA',
        matched_user_id: 'me',
        status: BuddyMatchStatus.PENDING,
        created_at: new Date(),
      });
      state.matches.set(BigInt(2), {
        id: BigInt(2),
        requester_id: 'userB',
        matched_user_id: 'me',
        status: BuddyMatchStatus.DECLINED,
        created_at: new Date(),
      });

      const pending = await svc.getInboundMatches('me', 'PENDING');
      expect(pending).toHaveLength(1);
      expect(pending[0].id).toBe(BigInt(1));

      const declined = await svc.getInboundMatches('me', 'DECLINED');
      expect(declined).toHaveLength(1);
      expect(declined[0].id).toBe(BigInt(2));
    });
  });

  describe('findByPhoto（按照片找）', () => {
    it('没有任何 media_id / taken_year / taken_location → 抛 BadRequestException', async () => {
      const { prisma } = buildPrismaMock();
      const svc = new BuddyService(prisma as never);

      await expect(svc.findByPhoto('me', {})).rejects.toBeInstanceOf(BadRequestException);
    });

    it('当用户关闭 allow_photo_find_me 时，对应候选用户被过滤掉', async () => {
      const { prisma } = buildPrismaMock();
      prisma.userSetting.findUnique.mockResolvedValue({
        user_id: 'me',
        allow_cross_clan_friend_finding: true,
      });
      // 模拟一张照片关联到一个隐私关闭的人
      prisma.mediaPersonLink.findMany.mockResolvedValue([
        {
          media: {
            id: BigInt(10),
            file_url: 'https://example.com/10.jpg',
            thumb_url: 'https://example.com/10_thumb.jpg',
            taken_year: 1990,
            taken_location: '北京',
          },
          person: {
            id: BigInt(20),
            full_name: '张三',
            clan_id: BigInt(1),
            user_links: [
              {
                user: {
                  id: 'closed-user',
                  nickname: '已关闭照片寻人',
                  avatar_url: null,
                  birth_date: null,
                  setting: {
                    allow_photo_find_me: false,
                    allow_cross_clan_friend_finding: true,
                  },
                },
              },
            ],
          },
        },
      ]);

      const svc = new BuddyService(prisma as never);
      const result = await svc.findByPhoto('me', { media_id: 10 });
      expect(result).toHaveLength(0);
    });

    it('当前用户不允许跨族寻找时，对方关闭跨族的人被过滤；双方都允许跨族时保留', async () => {
      const { prisma } = buildPrismaMock();
      prisma.userSetting.findUnique.mockResolvedValue({
        user_id: 'me',
        allow_cross_clan_friend_finding: false,
      });

      prisma.mediaPersonLink.findMany.mockResolvedValue([
        {
          media: {
            id: BigInt(10),
            file_url: 'https://example.com/10.jpg',
            thumb_url: 'https://example.com/10_thumb.jpg',
            taken_year: 1990,
            taken_location: '北京',
          },
          person: {
            id: BigInt(20),
            full_name: '李四',
            clan_id: BigInt(99), // 跨族
            user_links: [
              {
                user: {
                  id: 'cross-closed',
                  nickname: '跨族关闭',
                  avatar_url: null,
                  birth_date: null,
                  setting: {
                    allow_photo_find_me: true,
                    allow_cross_clan_friend_finding: false,
                  },
                },
              },
            ],
          },
        },
        {
          media: {
            id: BigInt(11),
            file_url: 'https://example.com/11.jpg',
            thumb_url: 'https://example.com/11_thumb.jpg',
            taken_year: 1990,
            taken_location: '北京',
          },
          person: {
            id: BigInt(21),
            full_name: '王五',
            clan_id: BigInt(99), // 跨族
            user_links: [
              {
                user: {
                  id: 'cross-open',
                  nickname: '跨族开放',
                  avatar_url: null,
                  birth_date: null,
                  setting: {
                    allow_photo_find_me: true,
                    allow_cross_clan_friend_finding: true,
                  },
                },
              },
            ],
          },
        },
      ]);

      const svc = new BuddyService(prisma as never);
      const result = await svc.findByPhoto('me', { media_id: 10 });
      // 跨族关闭被过滤；跨族开放被保留（因为我自己禁止跨族，但对方允许，不影响）
      // 这里的设计：当用户自己 allowCrossClan=false，代码依然过滤 allow_cross_clan_friend_finding=false 的人。
      // 实际上看实现：当 allowCrossClan=false 时直接 continue skip allow_cross_clan_friend_finding=false 的人。
      // 因此最终应留下"跨族开放"。
      const ids = result.map((c: any) => c.matched_user.id);
      expect(ids).toContain('cross-open');
      expect(ids).not.toContain('cross-closed');
    });

    it('不返回当前用户自己（去重自身）', async () => {
      const { prisma } = buildPrismaMock();
      prisma.userSetting.findUnique.mockResolvedValue({
        user_id: 'me',
        allow_cross_clan_friend_finding: true,
      });
      prisma.mediaPersonLink.findMany.mockResolvedValue([
        {
          media: {
            id: BigInt(10),
            file_url: 'https://example.com/10.jpg',
            thumb_url: 'https://example.com/10_thumb.jpg',
            taken_year: 1990,
            taken_location: '北京',
          },
          person: {
            id: BigInt(20),
            full_name: '本人',
            clan_id: BigInt(1),
            user_links: [
              {
                user: {
                  id: 'me', // 自己
                  nickname: '自己',
                  avatar_url: null,
                  birth_date: null,
                  setting: {
                    allow_photo_find_me: true,
                    allow_cross_clan_friend_finding: true,
                  },
                },
              },
            ],
          },
        },
      ]);

      const svc = new BuddyService(prisma as never);
      const result = await svc.findByPhoto('me', { media_id: 10 });
      expect(result).toHaveLength(0);
    });
  });

  describe('claimPhoto / approvePhotoClaim', () => {
    it('认领不存在的照片 → 抛 NotFoundException', async () => {
      const { prisma } = buildPrismaMock();
      const svc = new BuddyService(prisma as never);

      const dto = new ClaimPhotoDto();
      dto.media_id = 999;

      await expect(svc.claimPhoto('me', dto)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('重复认领同一张照片（已有 PENDING） → 抛 BadRequestException', async () => {
      const { prisma, state } = buildPrismaMock();
      state.mediaArchive.set(BigInt(10), { id: BigInt(10), deleted_at: null });
      state.photoClaims.set(BigInt(1), {
        id: BigInt(1),
        media_id: BigInt(10),
        claimer_user_id: 'me',
        status: PhotoClaimStatus.PENDING,
        position_description: null,
        verified_by: null,
        created_at: new Date(),
      });

      const svc = new BuddyService(prisma as never);
      const dto = new ClaimPhotoDto();
      dto.media_id = 10;

      await expect(svc.claimPhoto('me', dto)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('管理员审核不存在的认领 → 抛 NotFoundException', async () => {
      const { prisma } = buildPrismaMock();
      const svc = new BuddyService(prisma as never);

      await expect(svc.approvePhotoClaim('admin1', 999, 'approve')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('审核通过 → 状态置为 APPROVED 并写通知', async () => {
      const { prisma, state } = buildPrismaMock();
      state.photoClaims.set(BigInt(1), {
        id: BigInt(1),
        media_id: BigInt(10),
        claimer_user_id: 'claimer1',
        status: PhotoClaimStatus.PENDING,
        position_description: '后排右二',
        verified_by: null,
        created_at: new Date(),
      });

      const svc = new BuddyService(prisma as never);
      const updated = await svc.approvePhotoClaim('admin1', 1, 'approve');

      expect(updated.status).toBe(PhotoClaimStatus.APPROVED);
      expect(updated.verified_by).toBe('admin1');
      expect(state.notifications).toHaveLength(1);
      expect(state.notifications[0].user_id).toBe('claimer1');
      expect(state.notifications[0].type).toBe('PHOTO_CLAIM_APPROVED');
    });
  });

  describe('respondMatch / sendGreeting', () => {
    it('respondMatch：记录不存在或状态非 PENDING → NotFoundException', async () => {
      const { prisma, state } = buildPrismaMock();
      state.matches.set(BigInt(1), {
        id: BigInt(1),
        requester_id: 'userA',
        matched_user_id: 'me',
        status: BuddyMatchStatus.ACCEPTED, // 非 PENDING
        created_at: new Date(),
      });

      const svc = new BuddyService(prisma as never);
      const dto = new RespondMatchDto();
      dto.action = 'accept';
      await expect(svc.respondMatch('me', 1, dto)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('respondMatch：ignore 直接静默成功，不写通知', async () => {
      const { prisma, state } = buildPrismaMock();
      state.matches.set(BigInt(1), {
        id: BigInt(1),
        requester_id: 'userA',
        matched_user_id: 'me',
        status: BuddyMatchStatus.PENDING,
        created_at: new Date(),
      });

      const svc = new BuddyService(prisma as never);
      const dto = new RespondMatchDto();
      dto.action = 'ignore';
      const r = await svc.respondMatch('me', 1, dto);
      expect(r).toEqual({ success: true });
      expect(state.notifications).toHaveLength(0);
    });

    it('sendGreeting：已存在匹配记录 → 抛 BadRequestException', async () => {
      const { prisma, state } = buildPrismaMock();
      state.matches.set(BigInt(1), {
        id: BigInt(1),
        requester_id: 'me',
        matched_user_id: 'target',
        status: BuddyMatchStatus.PENDING,
        created_at: new Date(),
      });

      const svc = new BuddyService(prisma as never);
      await expect(svc.sendGreeting('me', 'target', '你好')).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});