import { clanStorageQuotaBytes, mediaTypeBucket, quotaExceeded, summarizeMediaUsage } from './storage-quota';

describe('clan storage quota', () => {
  it('reads the clan quota and keeps the 5GB default', () => {
    expect(clanStorageQuotaBytes(null)).toBe(5 * 1024 * 1024 * 1024);
    expect(clanStorageQuotaBytes({ storage_quota_bytes: 20 })).toBe(20);
    expect(clanStorageQuotaBytes({ storage_quota_bytes: '0' })).toBe(5 * 1024 * 1024 * 1024);
  });

  it('groups photos, videos and other files separately', () => {
    const summary = summarizeMediaUsage([
      { media_type: 'image', count: 2, bytes: 100 },
      { media_type: 'video', count: 1, bytes: 50 },
      { media_type: 'pdf', count: 3, bytes: 7 },
    ]);
    expect(mediaTypeBucket('video/mp4')).toBe('videos');
    expect(summary.breakdown.photos).toBe(2);
    expect(summary.breakdown.videos).toBe(1);
    expect(summary.breakdown.others).toBe(3);
    expect(summary.breakdown.videos_bytes).toBe(50);
    expect(summary.used).toBe(157);
  });

  it('blocks an upload that would pass the quota', () => {
    expect(quotaExceeded(100, 1, 100)).toBe(true);
    expect(quotaExceeded(50, 50, 100)).toBe(false);
  });
});
