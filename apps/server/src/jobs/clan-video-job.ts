import * as path from 'path';

/** 与预览 estimated_duration_seconds 的上限一致。 */
export const CLAN_VIDEO_MAX_SECONDS = 600;

/**
 * 每条事件一帧。秒数落在产品说明的 5–10 秒，并用风格拉开节奏：
 * modern 短、nostalgic 居中、solemn 更慢。总时长不超过 600 秒。
 */
const SLIDE_SECONDS: Record<string, number> = {
  nostalgic: 8,
  modern: 6,
  solemn: 10,
};

export interface ClanVideoSlide {
  title: string;
  year: number | null;
  place: string;
  description: string;
  image_url: string | null;
}

export interface ClanVideoDestination {
  public_url: string;
  storage_path: string;
  upload_url?: string;
}

export interface ClanVideoUploader {
  getDriverType(): 'local' | 'cos';
  getPresignedPutUrl(key: string, expiresIn?: number): Promise<string>;
  getCdnUrl(key: string): string;
}

export function clipText(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  const text = value.replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return text.slice(0, max);
}

export function clanVideoObjectKey(kind: 'clan-event' | 'clan-migration', projectId: string): string {
  return `videos/${kind}/${projectId}.mp4`;
}

/**
 * 与 LocalCosDriver 一致：key 里的斜杠换成下划线，URL 为 /media/<文件名>，
 * 文件落在 STORAGE_PATH（默认 storage/media）。
 */
export function localClanVideoDestination(
  kind: 'clan-event' | 'clan-migration',
  projectId: string,
): ClanVideoDestination {
  const storedName = clanVideoObjectKey(kind, projectId).replace(/\//g, '_');
  const storageRoot = process.env.STORAGE_PATH || path.join(process.cwd(), 'storage', 'media');
  return {
    public_url: `/media/${storedName}`,
    storage_path: path.join(storageRoot, storedName),
  };
}

export function clanVideoSlideSeconds(style: string | undefined, eventCount: number): number {
  const per = SLIDE_SECONDS[style ?? ''] ?? SLIDE_SECONDS.nostalgic;
  const count = Math.max(1, Math.floor(Number(eventCount) || 0));
  if (per * count <= CLAN_VIDEO_MAX_SECONDS) return per;
  return CLAN_VIDEO_MAX_SECONDS / count;
}

export async function resolveClanVideoDestination(
  uploader: ClanVideoUploader | undefined,
  kind: 'clan-event' | 'clan-migration',
  projectId: string,
): Promise<ClanVideoDestination> {
  const local = localClanVideoDestination(kind, projectId);
  if (!uploader || uploader.getDriverType() !== 'cos') return local;
  try {
    const key = clanVideoObjectKey(kind, projectId);
    const uploadUrl = (await uploader.getPresignedPutUrl(key))?.trim();
    const publicUrl = uploader.getCdnUrl(key)?.trim();
    if (!uploadUrl || !publicUrl) return local;
    return {
      public_url: publicUrl,
      storage_path: local.storage_path,
      upload_url: uploadUrl,
    };
  } catch {
    return local;
  }
}

export interface ClanVideoResultFields {
  video_url: string;
  duration_seconds: number | null;
  file_size: bigint | null;
}

function readDuration(row: Record<string, unknown>): number | null {
  const raw = row.duration_seconds ?? row.durationSeconds;
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.min(CLAN_VIDEO_MAX_SECONDS, Math.round(value));
}

function readFileSize(row: Record<string, unknown>): bigint | null {
  const raw = row.file_size ?? row.fileSize;
  if (typeof raw === 'bigint') return raw >= 0n ? raw : null;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) return BigInt(Math.floor(raw));
  if (typeof raw === 'string' && /^\d+$/.test(raw)) return BigInt(raw);
  return null;
}

/** 回调里视频地址沿用 video_url，并兼容生成器的 videoUrl。空字符串视为没有地址。 */
export function readClanVideoResult(result: unknown): ClanVideoResultFields | null {
  if (!result || typeof result !== 'object') return null;
  const row = result as Record<string, unknown>;
  const raw = row.video_url ?? row.videoUrl;
  if (typeof raw !== 'string') return null;
  const videoUrl = raw.trim();
  if (!videoUrl) return null;
  return {
    video_url: videoUrl,
    duration_seconds: readDuration(row),
    file_size: readFileSize(row),
  };
}
