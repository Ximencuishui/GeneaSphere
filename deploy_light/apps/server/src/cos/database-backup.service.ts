import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { CosService } from './cos.service';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';

@Injectable()
export class DatabaseBackupService {
  private readonly logger = new Logger(DatabaseBackupService.name);
  private readonly backupEnabled: boolean;
  private readonly retentionDays: number;

  constructor(
    private readonly cosService: CosService,
    private readonly configService: ConfigService,
  ) {
    this.backupEnabled = this.configService.get<string>('DB_BACKUP_ENABLED') === 'true'
      || (this.cosService.getDriverType() === 'cos' && this.configService.get<string>('DB_BACKUP_ENABLED') !== 'false');
    this.retentionDays = parseInt(this.configService.get<string>('DB_BACKUP_RETENTION_DAYS') || '30', 10);
  }

  /**
   * 每日凌晨3点执行数据库备份
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async performBackup(): Promise<void> {
    if (!this.backupEnabled) {
      this.logger.log('数据库备份未启用（DB_BACKUP_ENABLED=false），跳过');
      return;
    }

    if (this.cosService.getDriverType() !== 'cos') {
      this.logger.warn('当前为本地存储模式，不支持数据库备份至 COS，跳过');
      return;
    }

    const dateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const backupKey = `backup/db/${dateStr}/dump.sql.gz`;

    this.logger.log(`开始数据库备份: ${backupKey}`);

    // 临时文件路径
    const tmpDir = path.join(process.cwd(), 'tmp');
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    const tmpSqlFile = path.join(tmpDir, `backup_${dateStr}.sql`);
    const tmpGzFile = tmpSqlFile + '.gz';

    try {
      // 1. pg_dump
      const databaseUrl = this.configService.get<string>('DATABASE_URL');
      if (!databaseUrl) {
        throw new Error('DATABASE_URL 未配置');
      }

      this.logger.log('执行 pg_dump...');
      execSync(
        `pg_dump "${databaseUrl}" --no-owner --no-acl -f "${tmpSqlFile}"`,
        { timeout: 300000 }, // 5分钟超时
      );

      // 2. gzip 压缩
      this.logger.log('压缩备份文件...');
      const sqlContent = fs.readFileSync(tmpSqlFile);
      const gzipped = zlib.gzipSync(sqlContent);
      fs.writeFileSync(tmpGzFile, gzipped);

      // 3. 上传至 COS 冷 Bucket
      this.logger.log('上传至 COS...');
      const result = await this.cosService.uploadFile(backupKey, fs.readFileSync(tmpGzFile), {
        contentType: 'application/gzip',
        bucketType: 'cold',
      });

      this.logger.log(`数据库备份完成: ${result.url}`);

      // 4. 清理旧备份（删除30天前的）
      await this.cleanOldBackups();
    } catch (error: any) {
      this.logger.error(`数据库备份失败: ${error.message}`, error.stack);
    } finally {
      // 清理临时文件
      try {
        if (fs.existsSync(tmpSqlFile)) fs.unlinkSync(tmpSqlFile);
        if (fs.existsSync(tmpGzFile)) fs.unlinkSync(tmpGzFile);
      } catch {
        // ignore cleanup errors
      }
    }
  }

  /**
   * 删除超过保留天数的旧备份
   */
  private async cleanOldBackups(): Promise<void> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);
      const cutoffStr = cutoffDate.toISOString().split('T')[0];

      // COS 没有简单的 "list objects in prefix with filter"，
      // 这里我们尝试列出 backup/db/ 下的前缀目录
      const cosModule = require('cos-nodejs-sdk-v5');
      const cos = new cosModule({
        SecretId: this.configService.get<string>('TENCENT_CLOUD_SECRET_ID'),
        SecretKey: this.configService.get<string>('TENCENT_CLOUD_SECRET_KEY'),
      });

      const bucket = (this.configService.get<string>('COS_COLD_BUCKET') || 'xungenlu-cold')
        + '-' + (this.configService.get<string>('TENCENT_CLOUD_APPID') || '');
      const region = this.configService.get<string>('TENCENT_CLOUD_REGION') || 'ap-guangzhou';

      const result: any = await new Promise((resolve, reject) => {
        cos.getBucket(
          { Bucket: bucket, Region: region, Prefix: 'backup/db/', Delimiter: '/' },
          (err: any, data: any) => {
            if (err) reject(err);
            else resolve(data);
          },
        );
      });

      const prefixes: string[] = result.CommonPrefixes || [];
      for (const prefix of prefixes) {
        const prefixName = (typeof prefix === 'string') ? prefix : (prefix as any).Prefix || prefix;
        const datePart = prefixName.replace('backup/db/', '').replace('/', '');
        if (datePart < cutoffStr) {
          this.logger.log(`清理过期备份: ${prefixName}`);
          // 列出该前缀下所有文件并逐个删除
          const files: any = await new Promise((resolve, reject) => {
            cos.getBucket(
              { Bucket: bucket, Region: region, Prefix: prefixName },
              (err: any, data: any) => {
                if (err) reject(err);
                else resolve(data);
              },
            );
          });

          const objects = (files.Contents || []).map((f: any) => ({ Key: f.Key }));
          if (objects.length > 0) {
            await new Promise((resolve, reject) => {
              cos.deleteMultipleObject(
                { Bucket: bucket, Region: region, Objects: objects },
                (err: any) => {
                  if (err) reject(err);
                  else resolve(undefined);
                },
              );
            });
          }
        }
      }
    } catch (error: any) {
      this.logger.error(`清理旧备份失败: ${error.message}`);
    }
  }

  /**
   * 手动触发备份（用于测试）
   */
  async triggerBackup(): Promise<string> {
    await this.performBackup();
    return '备份完成';
  }
}
