import { BadRequestException } from '@nestjs/common';
import { FamilyEventType } from '@prisma/client';
import { parse } from 'csv-parse/sync';
import { CreateFamilyEventDto } from './dto/create-family-event.dto';

const EVENT_TYPES: FamilyEventType[] = [
  FamilyEventType.ancestor_worship,
  FamilyEventType.genealogy,
  FamilyEventType.building,
  FamilyEventType.birth,
  FamilyEventType.death,
  FamilyEventType.gathering,
  FamilyEventType.other,
];
const EVENT_TYPE_SET = new Set<string>(EVENT_TYPES);

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export type FamilyEventCsvRowError = { line: number; reason: string };

export interface ParsedFamilyEventCsv {
  events: CreateFamilyEventDto[];
  /** 与 events 对齐的 CSV 行号（含表头，从 1 开始）。 */
  lineNumbers: number[];
  errors: FamilyEventCsvRowError[];
}

type CsvInfoRow = {
  record?: Record<string, unknown>;
  info?: { lines?: number };
};

/**
 * 把带表头的 CSV 文本映射成 CreateFamilyEventDto。
 * 解析抛错时整份文件拒绝；某一行不合法只记入 errors，不进入 events。
 */
export function parseFamilyEventCsv(text: string): ParsedFamilyEventCsv {
  let rows: CsvInfoRow[];
  try {
    rows = parse(text, {
      columns: (headers: string[]) => headers.map((header) => header.trim()),
      skip_empty_lines: true,
      bom: true,
      trim: true,
      relax_column_count: true,
      info: true,
    }) as CsvInfoRow[];
  } catch (error) {
    throw new BadRequestException(csvParseFailureMessage(error));
  }
  if (!Array.isArray(rows)) {
    throw new BadRequestException('CSV 解析失败：文件不是合法的 CSV');
  }

  const events: CreateFamilyEventDto[] = [];
  const lineNumbers: number[] = [];
  const errors: FamilyEventCsvRowError[] = [];
  rows.forEach((row, index) => {
    const line = typeof row?.info?.lines === 'number' ? row.info.lines : index + 2;
    const record = row?.record;
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      errors.push({ line, reason: '无法读取这一行' });
      return;
    }
    const mapped = mapRecord(record);
    if ('reason' in mapped) {
      errors.push({ line, reason: mapped.reason });
      return;
    }
    events.push(mapped.dto);
    lineNumbers.push(line);
  });
  return { events, lineNumbers, errors };
}

function csvParseFailureMessage(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? String((error as { code?: unknown }).code) : '';
  const reasonByCode: Record<string, string> = {
    CSV_QUOTE_NOT_CLOSED: '引号未闭合',
    CSV_INVALID_CLOSING_QUOTE: '引号未正确闭合',
    CSV_INVALID_OPENING_QUOTE: '引号位置无效',
    INVALID_OPENING_QUOTE: '引号位置无效',
    CSV_RECORD_INCONSISTENT_COLUMNS: '列数不一致',
    CSV_MAX_RECORD_SIZE: '单行内容过长',
    CSV_NON_TRIMABLE_CHAR: '存在无法识别的字符',
  };
  const reason = reasonByCode[code] ?? '文件不是合法的 CSV';
  return `CSV 解析失败：${reason}`;
}

function cell(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (value == null) return '';
  return String(value).trim();
}

function mapRecord(record: Record<string, unknown>): { dto: CreateFamilyEventDto } | { reason: string } {
  const eventName = cell(record, 'event_name');
  if (!eventName) return { reason: 'event_name 不能为空' };
  if (eventName.length > 100) return { reason: 'event_name 最长 100 个字符' };

  const eventType = cell(record, 'event_type');
  if (!eventType) return { reason: 'event_type 不能为空' };
  if (!EVENT_TYPE_SET.has(eventType)) {
    return {
      reason: `event_type「${eventType}」不在允许范围内，必须是 ${EVENT_TYPES.join('、')} 之一`,
    };
  }

  const dateRaw = cell(record, 'event_date');
  const yearRaw = cell(record, 'event_year');
  let eventDate: string | undefined;
  let eventYear: number | undefined;
  if (dateRaw) {
    const parsedDate = readEventDate(dateRaw);
    if (!parsedDate) return { reason: 'event_date 必须是 YYYY-MM-DD 或 ISO 日期' };
    eventDate = parsedDate.value;
    eventYear = parsedDate.year;
  }
  if (yearRaw) {
    const parsedYear = readYear(yearRaw);
    if (parsedYear == null) return { reason: 'event_year 必须是 1–9999 的整数' };
    eventYear = parsedYear;
  }
  if (!eventDate && eventYear == null) {
    return { reason: 'event_date 与 event_year 必须至少填写一个' };
  }

  const dto: CreateFamilyEventDto = {
    event_name: eventName,
    event_type: eventType as FamilyEventType,
  };
  if (eventDate) dto.event_date = eventDate;
  if (eventYear != null) dto.event_year = eventYear;

  const location = cell(record, 'location');
  if (location) {
    if (location.length > 200) return { reason: 'location 最长 200 个字符' };
    dto.location = location;
  }

  const description = cell(record, 'description');
  if (description) dto.description = description;

  const personId = cell(record, 'person_id');
  if (personId) {
    if (!/^\d+$/.test(personId)) return { reason: 'person_id 必须是数字' };
    dto.person_id = personId;
  }

  const mediaRaw = cell(record, 'media_ids');
  if (mediaRaw) {
    const mediaIds = readMediaIds(mediaRaw);
    if (!mediaIds) return { reason: 'media_ids 必须是英文逗号分隔的数字' };
    dto.media_ids = mediaIds;
  }

  return { dto };
}

/** 年份取日期字符串开头的公历年，不用时区换算。 */
function readEventDate(raw: string): { value: string; year: number } | null {
  const match = DATE_ONLY.exec(raw) ?? ISO_DATE.exec(raw);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || year > 9999 || month < 1 || month > 12 || !isRealDay(year, month, day)) return null;
  return { value: raw, year };
}

function isRealDay(year: number, month: number, day: number): boolean {
  const days = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const max = month === 2 && leap ? 29 : days[month];
  return day >= 1 && day <= max;
}

function readYear(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const year = Number(raw);
  if (!Number.isInteger(year) || year < 1 || year > 9999) return null;
  return year;
}

function readMediaIds(raw: string): number[] | null {
  const ids: number[] = [];
  const seen = new Set<number>();
  for (const part of raw.split(',')) {
    const text = part.trim();
    if (!/^\d+$/.test(text)) return null;
    const id = Number(text);
    if (!Number.isSafeInteger(id) || id <= 0) return null;
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}
