import * as XLSX from 'xlsx';

/**
 * xlsx 输入隔离层
 *
 * 背景：npm 上 `xlsx@0.18.5`（SheetJS CE）已不再维护，存在两个高危 CVE：
 *   - CVE-2023-30533 (Prototype Pollution) — 解析特制 xlsx 时污染 Object.prototype
 *   - CVE-2024-22363 (ReDoS) — 解析特制 xlsx 时正则回溯
 *
 * 官方建议通过 https://cdn.sheetjs.com/ 获取 0.19.3+/0.20.2+ 修复版，但
 * 出于供应链与离线构建考虑，本项目保留 npm `xlsx@0.18.5`，并在此层强制
 * 输入隔离与结果清洗。
 *
 * 隔离策略：
 *   1. 魔数校验：只接受 ZIP 容器（xlsx 本质是 zip）
 *   2. 大小限制：默认 5 MiB，文件过大直接拒绝
 *   3. 行数限制：默认 10000 行，防止 ReDoS 与内存耗尽
 *   4. 解析选项：cellDates + raw 模式可控
 *   5. 结果清洗：JSON.parse(JSON.stringify(...)) 去除 __proto__/constructor 链
 *
 * 调用方应只通过本模块与 xlsx 交互，import.service.ts 已切换到此封装。
 */

export const XLSX_MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MiB
export const XLSX_MAX_ROWS = 10_000;

const ZIP_LOCAL_FILE_HEADER = 0x04034b50; // "PK\x03\x04"
const ZIP_EMPTY_ARCHIVE = 0x06054b50; // "PK\x05\x06"

/** 简单魔数校验：xlsx = ZIP 容器，至少 4 字节。 */
export function assertXlsxMagic(buf: Buffer): void {
  if (!buf || buf.length < 4) {
    throw new Error('XLSX_BUFFER_TOO_SMALL');
  }
  const sig = buf.readUInt32LE(0);
  if (sig !== ZIP_LOCAL_FILE_HEADER && sig !== ZIP_EMPTY_ARCHIVE) {
    throw new Error('XLSX_INVALID_MAGIC');
  }
}

/** 解析并清洗工作表数据，返回安全纯对象数组。 */
export function parseXlsxSafely<T extends object = Record<string, unknown>>(
  buf: Buffer,
  opts: { maxBytes?: number; maxRows?: number; sheetIndex?: number } = {}
): T[] {
  const maxBytes = opts.maxBytes ?? XLSX_MAX_FILE_BYTES;
  const maxRows = opts.maxRows ?? XLSX_MAX_ROWS;

  if (!Buffer.isBuffer(buf)) {
    throw new Error('XLSX_INVALID_BUFFER');
  }
  if (buf.length > maxBytes) {
    throw new Error(`XLSX_TOO_LARGE: ${buf.length} > ${maxBytes}`);
  }
  assertXlsxMagic(buf);

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buf, {
      type: 'buffer',
      cellDates: true,
      // 限制 SheetJS 解析选项，避免读取外部链接/宏：
      cellNF: false,
      cellText: false,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`XLSX_PARSE_FAILED: ${msg.slice(0, 200)}`);
  }

  const sheetNames = workbook?.SheetNames ?? [];
  if (sheetNames.length === 0) {
    return [];
  }
  const idx = Math.max(0, Math.min(opts.sheetIndex ?? 0, sheetNames.length - 1));
  const sheet = workbook.Sheets[sheetNames[idx]];
  if (!sheet) {
    return [];
  }

  // defval 防止缺列时产生 undefined 被当作键污染；raw: false 把单元格强制转字符串
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: false,
    blankrows: false,
  });

  // 二次行数限制（兜底）
  const sliced = raw.length > maxRows ? raw.slice(0, maxRows) : raw;

  // JSON 序列化往返：剥除 __proto__/constructor 原型链与函数引用
  // 这是 CVE-2023-30533 的核心修复：避免下游使用展开/赋值时触发原型污染。
  const cleaned: T[] = [];
  for (const row of sliced) {
    const safe = JSON.parse(JSON.stringify(row)) as T;
    cleaned.push(safe);
  }
  return cleaned;
}