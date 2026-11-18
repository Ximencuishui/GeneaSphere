import { BadRequestException } from '@nestjs/common';
import { csvCell, toCsv } from '../logs/csv-export';

export const EXPORT_TYPES = ['members', 'relationships', 'media', 'migration', 'logs', 'all'] as const;
export const EXPORT_FORMATS = ['csv', 'json'] as const;
export type ExportType = (typeof EXPORT_TYPES)[number];
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const EXPORT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/** 原图在冷存储，展示图在热存储。先读冷，读不到再读热。 */
export async function readExportObject(
  read: (key: string, bucket: 'hot' | 'cold') => Promise<Buffer>,
  key: string,
): Promise<Buffer> {
  try {
    return await read(key, 'cold');
  } catch {
    return read(key, 'hot');
  }
}

export function assertExportRequest(type: string, format: string): { type: ExportType; format: ExportFormat } {
  if (format === 'excel' || format === 'xlsx') {
    throw new BadRequestException('不支持 Excel，请使用 csv 或 json');
  }
  if (!(EXPORT_TYPES as readonly string[]).includes(type)) {
    throw new BadRequestException('导出类型无效');
  }
  if (!(EXPORT_FORMATS as readonly string[]).includes(format)) {
    throw new BadRequestException('导出格式无效');
  }
  return { type: type as ExportType, format: format as ExportFormat };
}

export function iso(value: Date | string | null | undefined): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

export interface ExportBundle {
  persons: any[];
  families: any[];
  children: any[];
  ancestry: any[];
  media: any[];
  migrations: any[];
  logs: any[];
}

export function membersRows(persons: any[]): unknown[][] {
  return persons.map((person) => [
    person.id,
    person.full_name,
    person.gender,
    iso(person.birth_date),
    iso(person.death_date),
    person.is_living,
    person.birth_place || '',
    person.death_place || '',
    person.biography || '',
  ]);
}

export function membersCsv(persons: any[]): string {
  return toCsv(
    ['id', 'full_name', 'gender', 'birth_date', 'death_date', 'is_living', 'birth_place', 'death_place', 'biography'],
    membersRows(persons),
  );
}

export function relationshipsCsv(bundle: Pick<ExportBundle, 'families' | 'children' | 'ancestry'>): string {
  const rows: unknown[][] = [];
  for (const family of bundle.families) {
    rows.push(['family', family.id, family.husband_id || '', family.wife_id || '', '', '']);
  }
  for (const child of bundle.children) {
    rows.push(['child', child.family_id, child.child_id, '', child.birth_order ?? '', child.child_type || '']);
  }
  for (const link of bundle.ancestry) {
    rows.push(['ancestry', link.ancestor_id, link.descendant_id, link.depth, '', '']);
  }
  return toCsv(['record_type', 'id_a', 'id_b', 'value', 'extra', 'note'], rows);
}

export function migrationCsv(events: any[]): string {
  return toCsv(
    ['id', 'person_id', 'from_location', 'to_location', 'event_year', 'reason', 'description'],
    events.map((event) => [
      event.id,
      event.person_id || '',
      event.from_location,
      event.to_location,
      event.event_year,
      event.reason || '',
      event.description || '',
    ]),
  );
}

export function auditLogsCsv(logs: any[]): string {
  return toCsv(
    ['id', 'user_id', 'user_phone', 'action', 'target_type', 'target_id', 'details', 'ip_address', 'created_at'],
    logs.map((log) => [
      log.id,
      log.user_id,
      log.user_phone || '',
      log.action,
      log.target_type || '',
      log.target_id || '',
      log.details || '',
      log.ip_address || '',
      iso(log.created_at),
    ]),
  );
}

export function mediaManifestCsv(media: any[]): string {
  return toCsv(
    ['id', 'media_type', 'file_size', 'file_url', 'download_url', 'packed', 'pack_reason'],
    media.map((item) => [
      item.id,
      item.media_type || '',
      item.file_size ?? 0,
      item.file_url || '',
      item.download_url || item.file_url || '',
      item.packed ? 'yes' : 'no',
      item.packed ? '' : (item.pack_reason || ''),
    ]),
  );
}

/** 有影像行但一个原文件都没读到时，全量导出不能算完成。没有影像行则可以完成。 */
export function missingOriginalExportError(
  mediaCount: number,
  packedCount: number,
  skipped: Array<{ id: string; reason: string }>,
): string | null {
  if (mediaCount === 0 || packedCount > 0) return null;
  const detail = skipped.map((item) => `${item.id}（${item.reason}）`).join('、');
  return `影像原文件都读不到：${detail || '没有可读取的文件'}`;
}

export function genealogyJson(bundle: ExportBundle) {
  return {
    exported_at: new Date().toISOString(),
    persons: bundle.persons,
    families: bundle.families,
    family_children: bundle.children,
    ancestry: bundle.ancestry,
  };
}

export function singleExportBody(type: ExportType, format: ExportFormat, bundle: ExportBundle): { filename: string; body: string | Buffer; contentType: string } {
  if (type === 'members') {
    if (format === 'csv') return { filename: 'members.csv', body: membersCsv(bundle.persons), contentType: 'text/csv; charset=utf-8' };
    return { filename: 'members.json', body: JSON.stringify({ persons: bundle.persons }, null, 2), contentType: 'application/json; charset=utf-8' };
  }
  if (type === 'relationships') {
    if (format === 'csv') return { filename: 'relationships.csv', body: relationshipsCsv(bundle), contentType: 'text/csv; charset=utf-8' };
    return {
      filename: 'relationships.json',
      body: JSON.stringify({ families: bundle.families, family_children: bundle.children, ancestry: bundle.ancestry }, null, 2),
      contentType: 'application/json; charset=utf-8',
    };
  }
  if (type === 'media') {
    if (format === 'csv') return { filename: 'media_manifest.csv', body: mediaManifestCsv(bundle.media), contentType: 'text/csv; charset=utf-8' };
    return { filename: 'media.json', body: JSON.stringify({ media: bundle.media }, null, 2), contentType: 'application/json; charset=utf-8' };
  }
  if (type === 'migration') {
    if (format === 'csv') return { filename: 'migration.csv', body: migrationCsv(bundle.migrations), contentType: 'text/csv; charset=utf-8' };
    return { filename: 'migration.json', body: JSON.stringify({ migrations: bundle.migrations }, null, 2), contentType: 'application/json; charset=utf-8' };
  }
  if (format === 'csv') return { filename: 'audit_logs.csv', body: auditLogsCsv(bundle.logs), contentType: 'text/csv; charset=utf-8' };
  return { filename: 'audit_logs.json', body: JSON.stringify({ logs: bundle.logs }, null, 2), contentType: 'application/json; charset=utf-8' };
}

export function zipTextEntries(format: ExportFormat, bundle: ExportBundle): Array<{ name: string; body: string }> {
  const genealogy = format === 'json'
    ? [{ name: 'genealogy.json', body: JSON.stringify(genealogyJson(bundle), null, 2) }]
    : [
      { name: 'genealogy.csv', body: membersCsv(bundle.persons) },
      { name: 'relationships.csv', body: relationshipsCsv(bundle) },
    ];
  return [
    ...genealogy,
    { name: 'migration.csv', body: migrationCsv(bundle.migrations) },
    { name: 'audit_logs.csv', body: auditLogsCsv(bundle.logs) },
    { name: 'media_manifest.csv', body: mediaManifestCsv(bundle.media) },
  ];
}

export { csvCell };
