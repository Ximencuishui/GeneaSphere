import { Injectable } from '@nestjs/common';
import { PrismaService } from '@geneasphere/db';

@Injectable()
export class GenealogyDigitizeService {
  constructor(private readonly prisma: PrismaService) {}

  async list(clanId: bigint) {
    const rows = await this.prisma.pdfImportLog.findMany({
      where: { clan_id: clanId },
      include: {
        _count: { select: { temp_records: true } },
      },
      orderBy: { created_at: 'desc' },
    });
    return rows.map((row) => ({
      id: row.id.toString(),
      task_id: row.task_id,
      clan_id: row.clan_id.toString(),
      name: row.file_name,
      source_file: row.file_name,
      source: row.parse_mode,
      status: row.status,
      status_label: this.statusLabel(row.status),
      imported_records: row.total_records,
      corrected_records: row._count.temp_records,
      saved_persons: row.success_records,
      created_at: row.created_at,
      updated_at: row.completed_at ?? row.created_at,
    }));
  }

  private statusLabel(status: string): string {
    const labels: Record<string, string> = {
      pending: '等待处理',
      parsing: '解析中',
      preview: '待校对',
      correcting: '校对中',
      importing: '导入中',
      completed: '已完成',
      failed: '失败',
    };
    return labels[status] ?? status;
  }
}
