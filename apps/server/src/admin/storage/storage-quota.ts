export const DEFAULT_CLAN_STORAGE_QUOTA_BYTES = 5 * 1024 * 1024 * 1024;

export const CLAN_QUOTA_EXCEEDED_MESSAGE = '家族云存储空间不足，请提交扩容申请后再上传';

export type StorageBucket = 'photos' | 'videos' | 'others';

export function clanStorageQuotaBytes(settings: unknown): number {
  if (!settings || typeof settings !== 'object') return DEFAULT_CLAN_STORAGE_QUOTA_BYTES;
  const raw = (settings as { storage_quota_bytes?: unknown }).storage_quota_bytes;
  const value = typeof raw === 'bigint' ? Number(raw) : typeof raw === 'string' ? Number(raw) : raw;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  return DEFAULT_CLAN_STORAGE_QUOTA_BYTES;
}

export function quotaExceeded(usedBytes: number, incomingBytes: number, quotaBytes: number): boolean {
  return usedBytes + incomingBytes > quotaBytes;
}

export function mediaTypeBucket(mediaType: string | null | undefined): StorageBucket {
  const text = (mediaType || '').toLowerCase();
  if (text === 'image' || text === 'photo' || text.startsWith('image')) return 'photos';
  if (text === 'video' || text.startsWith('video')) return 'videos';
  return 'others';
}

export function summarizeMediaUsage(rows: Array<{ media_type: string | null; count: number; bytes: number }>) {
  const breakdown = {
    photos: 0,
    videos: 0,
    others: 0,
    photos_bytes: 0,
    videos_bytes: 0,
    others_bytes: 0,
  };
  let used = 0;
  for (const row of rows) {
    const bucket = mediaTypeBucket(row.media_type);
    breakdown[bucket] += row.count;
    breakdown[`${bucket}_bytes`] += row.bytes;
    used += row.bytes;
  }
  return { used, breakdown };
}
