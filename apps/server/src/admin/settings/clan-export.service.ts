import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createReadStream } from 'fs';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '@geneasphere/db';
import { NotificationService } from '../../common/notification.service';
import { CosService } from '../../cos/cos.service';
import { entriesForMedia, writeMediaZip, ZipEntry } from '../media/media-zip';
import {
  EXPORT_RETENTION_MS,
  ExportFormat,
  ExportType,
  readExportObject,
  singleExportBody,
  zipTextEntries,
} from './clan-export-format';

export function exportDirectory(): string {
  return path.resolve(process.env.CLAN_EXPORT_DIR || path.join(process.cwd(), 'storage', 'exports'));
}

@Injectable()
export class ClanExportService {
  private readonly logger = new Logger(ClanExportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notify: NotificationService,
    private readonly cosService: CosService,
  ) {}

  async createPending(clanId: bigint, userId: string, clanSlug: string, type: ExportType, format: ExportFormat) {
    const now = new Date();
    const task = await this.prisma.clanExportTask.create({
      data: {
        clan_id: clanId,
        requested_by: userId,
        export_type: type,
        format,
        status: 'pending',
        expires_at: new Date(now.getTime() + EXPORT_RETENTION_MS),
      },
    });
    void this.run(task.id, clanSlug).catch((error) => {
      this.logger.warn(`导出任务 ${task.id.toString()} 失败: ${(error as Error).message}`);
    });
    return task;
  }

  async list(clanId: bigint) {
    return this.prisma.clanExportTask.findMany({
      where: { clan_id: clanId },
      orderBy: { created_at: 'desc' },
      take: 50,
    });
  }

  async openDownload(clanId: bigint, taskId: bigint) {
    const task = await this.prisma.clanExportTask.findFirst({
      where: { id: taskId, clan_id: clanId },
    });
    if (!task || task.status !== 'completed' || !task.file_path || !task.file_name) {
      throw new NotFoundException('导出文件不存在');
    }
    if (task.expires_at.getTime() <= Date.now()) {
      throw new NotFoundException('导出文件已超过 7 天保留期');
    }
    const root = exportDirectory();
    const abs = path.resolve(task.file_path);
    const relative = path.relative(root, abs);
    if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(abs)) {
      throw new NotFoundException('导出文件不存在');
    }
    const contentType = task.file_name.endsWith('.json')
      ? 'application/json; charset=utf-8'
      : task.file_name.endsWith('.zip')
        ? 'application/zip'
        : 'text/csv; charset=utf-8';
    return {
      stream: createReadStream(abs),
      filename: task.file_name,
      contentType,
    };
  }

  async run(taskId: bigint, clanSlug: string) {
    const task = await this.prisma.clanExportTask.findUnique({ where: { id: taskId } });
    if (!task || task.status === 'completed') return;
    await this.prisma.clanExportTask.update({
      where: { id: taskId },
      data: { status: 'processing' },
    });
    try {
      const bundle = await this.collect(task.clan_id);
      const written = await this.write(task.clan_id, task.id, task.export_type as ExportType, task.format as ExportFormat, bundle);
      await this.prisma.clanExportTask.update({
        where: { id: taskId },
        data: {
          status: 'completed',
          file_path: written.filePath,
          file_name: written.fileName,
          completed_at: new Date(),
          error_message: null,
        },
      });
      await this.notify.notify({
        userId: task.requested_by,
        clanId: task.clan_id,
        type: 'SYSTEM',
        title: '家族数据导出已完成',
        content: `可以下载：/api/admin/settings/exports/${task.id.toString()}/download?clanSlug=${encodeURIComponent(clanSlug)}`,
        targetType: 'ClanExportTask',
        targetId: task.id.toString(),
      });
    } catch (error) {
      const message = (error as Error).message || '导出失败';
      await this.prisma.clanExportTask.update({
        where: { id: taskId },
        data: { status: 'failed', error_message: message, completed_at: new Date() },
      });
      await this.notify.notify({
        userId: task.requested_by,
        clanId: task.clan_id,
        type: 'SYSTEM',
        title: '家族数据导出失败',
        content: message,
        targetType: 'ClanExportTask',
        targetId: task.id.toString(),
      });
      throw error;
    }
  }

  async purgeExpired(now = new Date()): Promise<number> {
    const rows = await this.prisma.clanExportTask.findMany({
      where: { expires_at: { lt: now } },
    });
    for (const row of rows) {
      if (row.file_path) {
        const root = exportDirectory();
        const abs = path.resolve(row.file_path);
        const relative = path.relative(root, abs);
        if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
          await fs.promises.unlink(abs).catch(() => undefined);
        }
      }
      await this.prisma.clanExportTask.delete({ where: { id: row.id } });
    }
    return rows.length;
  }

  private async collect(clanId: bigint) {
    const [persons, families, children, ancestry, media, migrations, logs] = await Promise.all([
      this.prisma.person.findMany({
        where: { clan_id: clanId, deleted_at: null },
        include: { bio: { select: { biography: true } } },
      }),
      this.prisma.familyUnit.findMany({ where: { clan_id: clanId } }),
      this.prisma.familyChild.findMany({ where: { family: { clan_id: clanId } } }),
      this.prisma.personAncestry.findMany({ where: { ancestor: { clan_id: clanId } } }),
      this.prisma.mediaArchive.findMany({ where: { clan_id: clanId, deleted_at: null } }),
      this.prisma.migrationEvent.findMany({ where: { clan_id: clanId }, orderBy: { event_year: 'asc' } }),
      this.prisma.auditLog.findMany({
        where: { clan_id: clanId },
        include: { user: { select: { phone: true } } },
        orderBy: { created_at: 'desc' },
      }),
    ]);
    return {
      persons: persons.map((person) => ({
        id: person.id.toString(),
        full_name: person.full_name,
        gender: person.gender,
        birth_date: person.birth_date,
        death_date: person.death_date,
        is_living: person.is_living,
        birth_place: person.birth_place,
        death_place: person.death_place,
        biography: person.bio?.biography || '',
      })),
      families: families.map((family) => ({
        id: family.id.toString(),
        husband_id: family.husband_id?.toString() || '',
        wife_id: family.wife_id?.toString() || '',
      })),
      children: children.map((child) => ({
        family_id: child.family_id.toString(),
        child_id: child.child_id.toString(),
        birth_order: child.birth_order,
        child_type: child.child_type,
      })),
      ancestry: ancestry.map((link) => ({
        ancestor_id: link.ancestor_id.toString(),
        descendant_id: link.descendant_id.toString(),
        depth: link.depth,
      })),
      media: media.map((item) => ({
        id: item.id.toString(),
        media_type: item.media_type,
        file_size: Number(item.file_size || 0),
        file_url: item.file_url,
        display_url: item.display_url,
        original_key: item.original_key,
        download_url: item.file_url,
        packed: false,
      })),
      migrations: migrations.map((event) => ({
        id: event.id.toString(),
        person_id: event.person_id?.toString() || '',
        from_location: event.from_location,
        to_location: event.to_location,
        event_year: event.event_year,
        reason: event.reason,
        description: event.description,
      })),
      logs: logs.map((log) => ({
        id: log.id.toString(),
        user_id: log.user_id,
        user_phone: log.user.phone,
        action: log.action,
        target_type: log.target_type,
        target_id: log.target_id,
        details: log.details,
        ip_address: log.ip_address,
        created_at: log.created_at,
      })),
      mediaRows: media,
    };
  }

  private async write(clanId: bigint, taskId: bigint, type: ExportType, format: ExportFormat, collected: Awaited<ReturnType<ClanExportService['collect']>>) {
    const dir = exportDirectory();
    await fs.promises.mkdir(dir, { recursive: true });
    const bundle = collected;
    if (type === 'all') {
      const readObject = this.cosService?.readObject
        ? (key: string) => readExportObject((objectKey, bucket) => this.cosService.readObject(objectKey, bucket), key)
        : undefined;
      const packed = await entriesForMedia(collected.mediaRows, readObject);
      const packedIds = new Set(packed.entries.map((entry) => entry.name.split('-')[0]));
      bundle.media = bundle.media.map((item) => ({
        ...item,
        packed: packedIds.has(item.id) || packed.entries.some((entry) => entry.name.startsWith(`${item.id}-`)),
      }));
      const fileName = `export-${clanId.toString()}-${taskId.toString()}.zip`;
      const filePath = path.join(dir, fileName);
      const entries: ZipEntry[] = zipTextEntries(format, bundle).map((entry) => ({
        kind: 'buffer' as const,
        body: Buffer.from(entry.body, 'utf8'),
        name: entry.name,
      }));
      for (const entry of packed.entries) {
        entries.push(entry.kind === 'file'
          ? { kind: 'file', abs: entry.abs, name: `photos/${entry.name}` }
          : { kind: 'buffer', body: entry.body, name: `photos/${entry.name}` });
      }
      await writeMediaZip(filePath, entries);
      if (!fs.existsSync(filePath)) {
        throw new Error('导出压缩包没有写入');
      }
      return { filePath, fileName };
    }
    const file = singleExportBody(type, format, bundle);
    const fileName = `export-${clanId.toString()}-${taskId.toString()}-${file.filename}`;
    const filePath = path.join(dir, fileName);
    await fs.promises.writeFile(filePath, file.body);
    return { filePath, fileName };
  }
}
