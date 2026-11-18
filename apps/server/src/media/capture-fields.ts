import { BadRequestException } from '@nestjs/common';

export interface MediaCaptureInput {
  taken_on?: Date;
  latitude?: number;
  longitude?: number;
}

/** 空字符串视为未填写。null 表示清空。非法数字拒绝。 */
export function parseTakenYear(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || (typeof value === 'string' && value.trim() === '')) return null;
  const year = typeof value === 'number' ? value : parseInt(String(value), 10);
  if (!Number.isInteger(year) || year < 1 || year > 9999) {
    throw new BadRequestException('拍摄年份无效');
  }
  return year;
}

/** 拍摄日只收 YYYY-MM-DD，存成 UTC 当天 00:00。空字符串表示不修改。 */
export function parseTakenOn(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') throw new BadRequestException('拍摄日期无效');
  const text = value.trim();
  if (!text) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) throw new BadRequestException('拍摄日期无效');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || year > 9999) throw new BadRequestException('拍摄日期无效');
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new BadRequestException('拍摄日期无效');
  }
  return date;
}

export function shiftTakenOnYear(takenOn: Date, year: number): Date {
  const month = takenOn.getUTCMonth();
  const day = takenOn.getUTCDate();
  const shifted = new Date(Date.UTC(year, month, day));
  if (shifted.getUTCMonth() !== month || shifted.getUTCDate() !== day) {
    return new Date(Date.UTC(year, month + 1, 0));
  }
  return shifted;
}

function coerceDate(value: unknown): Date | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

/**
 * 写入拍摄日时，年份跟拍摄日走。
 * 只改年份时保留已有拍摄日；年份冲突则只改拍摄日的年份，月日保留。
 * clearBlankYear 为 false 时，空年份表示批量场景下的「不修改」。
 */
export function assignTakenFields(
  updateData: Record<string, unknown>,
  input: { taken_on?: unknown; taken_year?: unknown },
  existingTakenOn: unknown,
  clearBlankYear: boolean,
) {
  const takenOn = parseTakenOn(input.taken_on);
  if (takenOn instanceof Date) {
    updateData.taken_on = takenOn;
    updateData.taken_year = takenOn.getUTCFullYear();
    return;
  }
  if (takenOn === null) updateData.taken_on = null;
  if (input.taken_year === undefined) return;
  const year = parseTakenYear(input.taken_year);
  if (year === undefined) return;
  if (year === null && !clearBlankYear) return;
  updateData.taken_year = year;
  if (typeof year !== 'number' || takenOn !== undefined) return;
  const current = coerceDate(existingTakenOn);
  if (!current || current.getUTCFullYear() === year) return;
  updateData.taken_on = shiftTakenOnYear(current, year);
}

function parseCoord(value: unknown, min: number, max: number, label: string): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'string' && value.trim() === '') return undefined;
  if (typeof value !== 'number' && typeof value !== 'string') {
    throw new BadRequestException(`${label}无效`);
  }
  const text = typeof value === 'number' ? String(value) : value.trim();
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(text)) {
    throw new BadRequestException(`${label}无效`);
  }
  const num = Number(text);
  if (!Number.isFinite(num) || num < min || num > max) {
    throw new BadRequestException(`${label}无效`);
  }
  return num;
}

/** 坐标必须成对。空字符串表示不修改，显式 null 才清空。只传一个则拒绝。 */
export function parseCoordinatePair(
  latitude: unknown,
  longitude: unknown,
): { latitude: number | null; longitude: number | null } | undefined {
  const lat = parseCoord(latitude, -90, 90, '纬度');
  const lng = parseCoord(longitude, -180, 180, '经度');
  if (lat === undefined && lng === undefined) return undefined;
  if (lat === undefined || lng === undefined || (lat === null) !== (lng === null)) {
    throw new BadRequestException('经纬度必须同时提供');
  }
  return { latitude: lat, longitude: lng };
}

export function assignCoordinates(
  updateData: Record<string, unknown>,
  latitude: unknown,
  longitude: unknown,
) {
  const pair = parseCoordinatePair(latitude, longitude);
  if (!pair) return;
  updateData.latitude = pair.latitude;
  updateData.longitude = pair.longitude;
}

export function originalFilename(name?: string | null): string | undefined {
  if (!name) return undefined;
  const base = name.replace(/\\/g, '/').split('/').pop()?.trim() || '';
  if (!base || base === '.' || base === '..') return undefined;
  return Array.from(base).slice(0, 255).join('');
}
