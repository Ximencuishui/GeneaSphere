import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '@geneasphere/db';
import { VerificationStatus, InviteQrcodeStatus } from '@prisma/client';

/**
 * 兜底定时清理任务
 * - 5 分钟一次：把过期的 PENDING 会话与 ACTIVE 二维码标记为 EXPIRED
 * 仅作为懒清理的兜底，单次进入接口时已经过滤过。
 */
@Injectable()
export class InviteCleanupService {
  private readonly logger = new Logger(InviteCleanupService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async cleanup() {
    try {
      const [sessions, qrcodes] = await Promise.all([
        this.prisma.verificationSession.updateMany({
          where: {
            status: VerificationStatus.PENDING,
            expire_at: { lt: new Date() },
          },
          data: { status: VerificationStatus.EXPIRED },
        }),
        this.prisma.inviteQrcode.updateMany({
          where: {
            status: InviteQrcodeStatus.ACTIVE,
            expire_at: { lt: new Date() },
          },
          data: { status: InviteQrcodeStatus.EXPIRED },
        }),
      ]);
      this.logger.log(
        `[cleanup] 标记过期会话 ${sessions.count} 条，过期二维码 ${qrcodes.count} 个`,
      );
    } catch (e) {
      this.logger.warn(`[cleanup] 失败：${(e as Error).message}`);
    }
  }
}
