import { UnauthorizedException } from '@nestjs/common';
import { LoginLockService } from './login-lock.service';

/**
 * LoginLockService 通过 PrismaService 操作 loginAttempt 表。
 * 这里用一个最小化的 mock，避免拉起真实数据库。
 */
interface FakeLoginAttempt {
  failed_count: number;
  locked_until: Date | null;
  last_attempt_at: Date;
}

function buildPrismaMock() {
  const store = new Map<string, FakeLoginAttempt>();

  const makeKey = (t: string, k: string) => `${t}::${k}`;

  return {
    store,
    prisma: {
      loginAttempt: {
        findUnique: jest.fn(async ({ where }: { where: { subject_type_subject_key: { subject_type: string; subject_key: string } } }) => {
          const key = makeKey(where.subject_type_subject_key.subject_type, where.subject_type_subject_key.subject_key);
          return store.get(key) ?? null;
        }),
        upsert: jest.fn(async ({ where, create, update }: {
          where: { subject_type_subject_key: { subject_type: string; subject_key: string } };
          create: FakeLoginAttempt;
          update: Partial<FakeLoginAttempt>;
        }) => {
          const key = makeKey(where.subject_type_subject_key.subject_type, where.subject_type_subject_key.subject_key);
          const existing = store.get(key);
          const merged: FakeLoginAttempt = {
            failed_count: update.failed_count ?? create.failed_count,
            locked_until: update.locked_until !== undefined ? update.locked_until : create.locked_until,
            last_attempt_at: update.last_attempt_at ?? create.last_attempt_at,
          };
          store.set(key, merged);
          return existing ? merged : create;
        }),
        update: jest.fn(async ({ where, data }: { where: { subject_type_subject_key: { subject_type: string; subject_key: string } }; data: Partial<FakeLoginAttempt> }) => {
          const key = makeKey(where.subject_type_subject_key.subject_type, where.subject_type_subject_key.subject_key);
          const cur = store.get(key);
          if (!cur) throw new Error('not found');
          const next = { ...cur, ...data };
          store.set(key, next);
          return next;
        }),
        delete: jest.fn(async ({ where }: { where: { subject_type_subject_key: { subject_type: string; subject_key: string } } }) => {
          const key = makeKey(where.subject_type_subject_key.subject_type, where.subject_type_subject_key.subject_key);
          if (!store.has(key)) throw new Error('not found');
          store.delete(key);
          return {} as never;
        }),
      },
    },
  };
}

describe('LoginLockService', () => {
  const fixedNow = new Date('2026-06-23T12:00:00.000Z').getTime();
  let nowSpy: jest.SpyInstance<number, []>;

  beforeEach(() => {
    nowSpy = jest.spyOn(Date, 'now').mockReturnValue(fixedNow);
  });

  afterEach(() => {
    nowSpy.mockRestore();
  });

  describe('checkLock', () => {
    it('未失败过 → 直接放行', async () => {
      const { prisma, store } = buildPrismaMock();
      const svc = new LoginLockService(prisma as never);

      await expect(svc.checkLock('USER', '13800000000')).resolves.toBeUndefined();
      expect(store.size).toBe(0);
    });

    it('锁定窗口未过期 → 抛出 UnauthorizedException 包含剩余分钟数', async () => {
      const { prisma, store } = buildPrismaMock();
      store.set('USER::13800000000', {
        failed_count: 5,
        locked_until: new Date(fixedNow + 10 * 60 * 1000), // 10 分钟后
        last_attempt_at: new Date(fixedNow - 60 * 1000),
      });
      const svc = new LoginLockService(prisma as never);

      await expect(svc.checkLock('USER', '13800000000')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      try {
        await svc.checkLock('USER', '13800000000');
      } catch (err) {
        expect((err as UnauthorizedException).message).toMatch(/账号已锁定，请 \d+ 分钟后再试/);
      }
    });

    it('锁定窗口已过期 → 自动重置 failed_count = 0', async () => {
      const { prisma, store } = buildPrismaMock();
      store.set('USER::13800000000', {
        failed_count: 5,
        locked_until: new Date(fixedNow - 60 * 1000), // 1 分钟前过期
        last_attempt_at: new Date(fixedNow - 120 * 1000),
      });
      const svc = new LoginLockService(prisma as never);

      await svc.checkLock('USER', '13800000000');

      expect(store.get('USER::13800000000')?.failed_count).toBe(0);
      expect(store.get('USER::13800000000')?.locked_until).toBeNull();
    });
  });

  describe('recordFailure', () => {
    it('第 1-4 次失败：locked=false，failed_count 递增', async () => {
      const { prisma, store } = buildPrismaMock();
      const svc = new LoginLockService(prisma as never);

      for (let i = 1; i <= 4; i++) {
        const result = await svc.recordFailure('USER', '13800000000');
        expect(result).toEqual({ locked: false, failed_count: i });
        expect(store.get('USER::13800000000')?.locked_until).toBeNull();
      }
    });

    it('第 5 次失败：locked=true，locked_until = now + 30min', async () => {
      const { prisma, store } = buildPrismaMock();
      const svc = new LoginLockService(prisma as never);

      for (let i = 0; i < 4; i++) {
        await svc.recordFailure('USER', '13800000000');
      }
      const fifth = await svc.recordFailure('USER', '13800000000');

      expect(fifth.locked).toBe(true);
      expect(fifth.failed_count).toBe(5);
      const lockedUntil = store.get('USER::13800000000')?.locked_until;
      expect(lockedUntil).toBeInstanceOf(Date);
      expect(lockedUntil!.getTime()).toBe(fixedNow + 30 * 60 * 1000);
    });
  });

  describe('clearFailures', () => {
    it('存在记录 → 删除', async () => {
      const { prisma, store } = buildPrismaMock();
      store.set('USER::13800000000', {
        failed_count: 3,
        locked_until: null,
        last_attempt_at: new Date(fixedNow),
      });
      const svc = new LoginLockService(prisma as never);

      await svc.clearFailures('USER', '13800000000');
      expect(store.has('USER::13800000000')).toBe(false);
    });

    it('记录不存在 → 静默忽略（不抛错）', async () => {
      const { prisma } = buildPrismaMock();
      const svc = new LoginLockService(prisma as never);

      await expect(svc.clearFailures('USER', '999')).resolves.toBeUndefined();
    });
  });

  describe('组合场景', () => {
    it('5 次失败 → 锁定 → 30 分钟后解锁', async () => {
      const { prisma, store } = buildPrismaMock();
      const svc = new LoginLockService(prisma as never);

      // 5 次失败
      for (let i = 0; i < 5; i++) {
        await svc.recordFailure('USER', '13800000000');
      }
      // 锁定中：checkLock 应抛错
      await expect(svc.checkLock('USER', '13800000000')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );

      // 时间推进 31 分钟，模拟窗口过期
      nowSpy.mockReturnValue(fixedNow + 31 * 60 * 1000);
      await svc.checkLock('USER', '13800000000');
      expect(store.get('USER::13800000000')?.failed_count).toBe(0);

      // 成功登录 → 清理
      await svc.clearFailures('USER', '13800000000');
      expect(store.has('USER::13800000000')).toBe(false);
    });
  });
});
