import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '@geneasphere/db';

/**
 * 登录失败计数与锁定服务（需求 v1.0 §3.1）
 *
 * 规则：连续失败 5 次后锁定账号 30 分钟。
 * 锁定窗口结束后自动允许再次尝试；登录成功后立即清零失败计数。
 *
 * subject_type:
 *   - USER：家族管理员/普通用户（手机号登录）
 *   - PLATFORM_ADMIN：平台管理员（用户名登录）
 */
@Injectable()
export class LoginLockService {
  private readonly MAX_FAILURES = 5;
  private readonly LOCK_DURATION_MS = 30 * 60 * 1000;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 检查账号是否处于锁定状态，若已锁定则抛出 UnauthorizedException
   */
  async checkLock(
    subjectType: 'USER' | 'PLATFORM_ADMIN',
    subjectKey: string,
  ): Promise<void> {
    const record = await this.prisma.loginAttempt.findUnique({
      where: {
        subject_type_subject_key: {
          subject_type: subjectType,
          subject_key: subjectKey,
        },
      },
    });

    if (!record) return;

    if (record.locked_until && record.locked_until.getTime() > Date.now()) {
      const remainMinutes = Math.ceil(
        (record.locked_until.getTime() - Date.now()) / 60000,
      );
      throw new UnauthorizedException(
        `账号已锁定，请 ${remainMinutes} 分钟后再试`,
      );
    }

    // 锁定窗口已过期，重置失败计数
    if (record.locked_until && record.locked_until.getTime() <= Date.now()) {
      await this.prisma.loginAttempt.update({
        where: {
          subject_type_subject_key: {
            subject_type: subjectType,
            subject_key: subjectKey,
          },
        },
        data: { failed_count: 0, locked_until: null },
      });
    }
  }

  /**
   * 记录一次登录失败。失败次数达到阈值后置 locked_until = now + 30min。
   */
  async recordFailure(
    subjectType: 'USER' | 'PLATFORM_ADMIN',
    subjectKey: string,
  ): Promise<{ locked: boolean; failed_count: number }> {
    const existing = await this.prisma.loginAttempt.findUnique({
      where: {
        subject_type_subject_key: {
          subject_type: subjectType,
          subject_key: subjectKey,
        },
      },
    });

    const failedCount = (existing?.failed_count ?? 0) + 1;
    const locked = failedCount >= this.MAX_FAILURES;
    const lockedUntil = locked ? new Date(Date.now() + this.LOCK_DURATION_MS) : null;

    await this.prisma.loginAttempt.upsert({
      where: {
        subject_type_subject_key: {
          subject_type: subjectType,
          subject_key: subjectKey,
        },
      },
      create: {
        subject_type: subjectType,
        subject_key: subjectKey,
        failed_count: failedCount,
        locked_until: lockedUntil,
        last_attempt_at: new Date(),
      },
      update: {
        failed_count: failedCount,
        locked_until: lockedUntil,
        last_attempt_at: new Date(),
      },
    });

    return { locked, failed_count: failedCount };
  }

  /**
   * 登录成功后清零失败计数与锁定时间。
   */
  async clearFailures(
    subjectType: 'USER' | 'PLATFORM_ADMIN',
    subjectKey: string,
  ): Promise<void> {
    await this.prisma.loginAttempt
      .delete({
        where: {
          subject_type_subject_key: {
            subject_type: subjectType,
            subject_key: subjectKey,
          },
        },
      })
      .catch(() => {
        // 没有记录时忽略
      });
  }
}