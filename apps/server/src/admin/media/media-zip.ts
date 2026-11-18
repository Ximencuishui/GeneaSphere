import * as fs from 'fs';
import { randomBytes } from 'crypto';
import * as os from 'os';
import * as path from 'path';

type ZipArchiveLike = {
  pipe(dest: NodeJS.WritableStream): unknown;
  file(filepath: string, data: { name: string }): unknown;
  append(source: Buffer, data: { name: string }): unknown;
  on(event: 'error', cb: (err: Error) => void): unknown;
  finalize(): Promise<void>;
};

export interface ZipMediaRow {
  id: bigint | number | string;
  file_url?: string | null;
  display_url?: string | null;
  original_key?: string | null;
}

export type ZipEntry =
  | { kind: 'file'; abs: string; name: string }
  | { kind: 'buffer'; body: Buffer; name: string };

export function storageRoot(): string {
  return path.resolve(process.env.STORAGE_PATH || path.join(process.cwd(), 'storage', 'media'));
}

export function zipDirectory(): string {
  return path.resolve(os.tmpdir(), 'geneasphere-media-zips');
}

/** 与回收站清理相同：只接受 /media/ 下、不越出 STORAGE_PATH 的路径。 */
export function resolveLocalMediaPath(fileUrl?: string | null, root = storageRoot()): string | null {
  if (!fileUrl || !fileUrl.startsWith('/media/')) return null;
  const rel = fileUrl.slice('/media/'.length);
  if (!rel || rel.includes('..') || rel.includes('\\') || path.isAbsolute(rel)) return null;
  const abs = path.resolve(root, ...rel.split('/').filter(Boolean));
  const relative = path.relative(root, abs);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return abs;
}

export function isSafeObjectKey(key?: string | null): key is string {
  if (!key || key.length > 512) return false;
  if (key.includes('..') || key.includes('\\') || key.startsWith('/') || path.isAbsolute(key)) return false;
  return true;
}

/** 只从影像自己的地址里解析对象 key，不接受调用方另外传入的 URL。 */
export function objectKeyFromStoredUrl(url?: string | null): string | null {
  if (!url || url.startsWith('/')) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) {
    try {
      const key = decodeURIComponent(new URL(url).pathname.replace(/^\/+/, ''));
      return isSafeObjectKey(key) ? key : null;
    } catch {
      return null;
    }
  }
  return isSafeObjectKey(url) ? url : null;
}

function entryName(id: string, filename: string): string {
  const base = path.basename(filename).replace(/[\\/]/g, '').replace(/^\.+/, '');
  return `${id}-${base || 'file'}`;
}

export async function entriesForMedia(
  rows: ZipMediaRow[],
  readObject?: (key: string) => Promise<Buffer>,
): Promise<{ entries: ZipEntry[]; skipped: { id: string; reason: string }[] }> {
  const entries: ZipEntry[] = [];
  const skipped: { id: string; reason: string }[] = [];

  for (const row of rows) {
    const id = String(row.id);
    let packed = false;
    for (const url of [row.file_url, row.display_url]) {
      const abs = resolveLocalMediaPath(url);
      if (!abs || !fs.existsSync(abs)) continue;
      entries.push({ kind: 'file', abs, name: entryName(id, path.basename(abs)) });
      packed = true;
      break;
    }
    if (packed) continue;

    const keys: string[] = [];
    if (isSafeObjectKey(row.original_key)) keys.push(row.original_key);
    for (const url of [row.file_url, row.display_url]) {
      const key = objectKeyFromStoredUrl(url);
      if (key && !keys.includes(key)) keys.push(key);
    }

    if (readObject && keys.length > 0) {
      for (const key of keys) {
        try {
          const body = await readObject(key);
          if (!body?.length) continue;
          entries.push({ kind: 'buffer', body, name: entryName(id, path.basename(key)) });
          packed = true;
          break;
        } catch {
          // 现有存储服务读不到这个 key，换下一个或跳过。
        }
      }
    }
    if (packed) continue;

    const hadLocal = [row.file_url, row.display_url].some((url) => typeof url === 'string' && url.startsWith('/media/'));
    skipped.push({
      id,
      reason: keys.length > 0 ? '远程文件无法读取' : hadLocal ? '本地文件不存在' : '没有可用的文件地址',
    });
  }

  return { entries, skipped };
}

export function createZipFilename(clanId: bigint): string {
  return `media-${clanId.toString()}-${Date.now()}-${randomBytes(3).toString('hex')}.zip`;
}

export function resolveZipPath(filename: string, clanId: bigint): string | null {
  if (!/^media-\d+-\d+-[a-f0-9]{6}\.zip$/.test(filename)) return null;
  if (!filename.startsWith(`media-${clanId.toString()}-`)) return null;
  const dir = zipDirectory();
  const abs = path.resolve(dir, filename);
  const relative = path.relative(dir, abs);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return abs;
}

export async function writeMediaZip(dest: string, entries: ZipEntry[]): Promise<void> {
  if (entries.length === 0) return;
  await fs.promises.mkdir(path.dirname(dest), { recursive: true });
  const specifier = 'archiver';
  const loaded = await import(specifier) as {
    ZipArchive: new (options?: { zlib?: { level?: number } }) => ZipArchiveLike;
  };
  try {
    await new Promise<void>((resolve, reject) => {
      const output = fs.createWriteStream(dest);
      const archive = new loaded.ZipArchive({ zlib: { level: 9 } });
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        if (!output.writableEnded) output.end();
        resolve();
      };
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        reject(error);
      };
      output.on('close', finish);
      output.on('error', fail);
      archive.on('error', fail);
      archive.pipe(output);
      for (const entry of entries) {
        if (entry.kind === 'file') archive.file(entry.abs, { name: entry.name });
        else archive.append(entry.body, { name: entry.name });
      }
      archive.finalize().then(finish).catch(fail);
    });
  } catch (error) {
    await fs.promises.unlink(dest).catch(() => undefined);
    throw error;
  }
}
