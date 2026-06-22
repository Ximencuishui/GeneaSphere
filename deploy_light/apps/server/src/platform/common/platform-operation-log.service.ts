import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@geneasphere/db';

export interface LogOperationParams {
  adminId: string;
  actionType: string;
  targetType?: string;
  targetId?: string;
  detail?: any;
  ipAddress?: string | null;
  status?: 'success' | 'failed';
}

@Injectable()
export class PlatformOperationLogService {
  private readonly logger = new Logger(PlatformOperationLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(params: LogOperationParams): Promise<void> {
    try {
      // 若 adminId 无效（非数字或不存在），跳过日志记录
      const adminIdNum = Number(params.adminId);
      if (!Number.isFinite(adminIdNum) || adminIdNum <= 0) {
        this.logger.warn(
          `跳过日志记录：adminId=${params.adminId} action=${params.actionType}`,
        );
        return;
      }
      await this.prisma.platformOperationLog.create({
        data: {
          admin_id: BigInt(params.adminId),
          action_type: params.actionType,
          target_type: params.targetType ?? null,
          target_id: params.targetId ?? null,
          detail: params.detail
            ? typeof params.detail === 'string'
              ? JSON.parse(params.detail)
              : params.detail
            : undefined,
          ip_address: params.ipAddress ?? null,
          status: params.status ?? 'success',
        },
      });
    } catch (err) {
      this.logger.error(
        `记录平台操作日志失败: action=${params.actionType}, err=${(err as Error).message}`,
      );
    }
  }
}
