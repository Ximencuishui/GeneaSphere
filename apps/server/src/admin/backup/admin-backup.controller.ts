import {
  Controller,
  Post,
  Get,
  Query,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminService } from '../admin.service';
import { DatabaseBackupService } from '../../cos/database-backup.service';

/**
 * 备份管理端点
 *
 * - POST /api/admin/backup/trigger — 手动触发一次数据库备份（pg_dump → gzip → COS）
 * - GET  /api/admin/backup/status  — 返回当前备份配置（启用/保留天数/驱动类型）
 *
 * 注意：仅 OWNER 触发；操作幂等，由 cron + 手动触发共享同一份逻辑。
 */
@ApiTags('admin/backup')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/admin/backup')
export class AdminBackupController {
  constructor(
    private readonly adminService: AdminService,
    private readonly backupService: DatabaseBackupService,
  ) {}

  @Get('status')
  @ApiOperation({ summary: '查看备份配置状态' })
  async status(@Request() req) {
    const userId = req.user.userId;
    const owns = await this.adminService['prisma']?.clan.count?.({
      where: { admin_user_id: userId },
    });
    if (!owns) {
      throw new BadRequestException('仅家族 OWNER 可查看备份状态');
    }
    return {
      cron: 'EVERY_DAY_AT_3AM',
      retention_days: parseInt(process.env.DB_BACKUP_RETENTION_DAYS || '30', 10),
      backup_enabled: process.env.DB_BACKUP_ENABLED !== 'false',
      storage_driver: process.env.STORAGE_DRIVER || 'local',
      bucket: process.env.COS_COLD_BUCKET || 'xungenlu-cold',
      timestamp: new Date().toISOString(),
    };
  }

  @Post('trigger')
  @ApiOperation({ summary: '手动触发数据库备份' })
  async trigger(@Request() req) {
    const userId = req.user.userId;
    const owns = await this.adminService['prisma']?.clan.count?.({
      where: { admin_user_id: userId },
    });
    if (!owns) {
      throw new BadRequestException('仅家族 OWNER 可触发备份');
    }

    const startedAt = Date.now();
    try {
      // performBackup() 内部已 try/catch 错误（不会抛），但仍 wrap 一层
      const message = await this.backupService.triggerBackup();
      return {
        ok: true,
        message,
        durationMs: Date.now() - startedAt,
        triggered_by: userId,
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      return {
        ok: false,
        message: (err as Error).message,
        durationMs: Date.now() - startedAt,
      };
    }
  }
}