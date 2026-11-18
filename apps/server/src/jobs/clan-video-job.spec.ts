import {
  CLAN_VIDEO_MAX_SECONDS,
  clanVideoSlideSeconds,
  readClanVideoResult,
  resolveClanVideoDestination,
} from './clan-video-job';

describe('clanVideoSlideSeconds', () => {
  it('nostalgic 为 8 秒、modern 为 6 秒、solemn 为 10 秒', () => {
    expect(clanVideoSlideSeconds('nostalgic', 1)).toBe(8);
    expect(clanVideoSlideSeconds('modern', 2)).toBe(6);
    expect(clanVideoSlideSeconds('solemn', 3)).toBe(10);
    expect(clanVideoSlideSeconds(undefined, 1)).toBe(8);
  });

  it('事件很多时单帧缩短，总时长不超过 600 秒', () => {
    const seconds = clanVideoSlideSeconds('nostalgic', 76);
    expect(seconds * 76).toBeLessThanOrEqual(CLAN_VIDEO_MAX_SECONDS);
    expect(seconds).toBeCloseTo(CLAN_VIDEO_MAX_SECONDS / 76);
    expect(clanVideoSlideSeconds('solemn', 100) * 100).toBeLessThanOrEqual(CLAN_VIDEO_MAX_SECONDS);
  });
});

describe('resolveClanVideoDestination', () => {
  it('本地驱动不生成 upload_url，地址沿用 /media/', async () => {
    const uploader = {
      getDriverType: () => 'local' as const,
      getPresignedPutUrl: jest.fn(),
      getCdnUrl: jest.fn(),
    };

    const dest = await resolveClanVideoDestination(uploader, 'clan-event', '15');

    expect(dest.public_url).toBe('/media/videos_clan-event_15.mp4');
    expect(dest.storage_path).toContain('videos_clan-event_15.mp4');
    expect(dest.upload_url).toBeUndefined();
    expect(uploader.getPresignedPutUrl).not.toHaveBeenCalled();
  });

  it('COS 驱动可用时带上预签名 upload_url 和 CDN 地址', async () => {
    const uploader = {
      getDriverType: () => 'cos' as const,
      getPresignedPutUrl: jest.fn().mockResolvedValue('https://bucket.cos.example/videos/clan-event/15.mp4?sign=1'),
      getCdnUrl: jest.fn().mockReturnValue('https://cdn.example/videos/clan-event/15.mp4'),
    };

    const dest = await resolveClanVideoDestination(uploader, 'clan-event', '15');

    expect(uploader.getPresignedPutUrl).toHaveBeenCalledWith('videos/clan-event/15.mp4');
    expect(dest.upload_url).toBe('https://bucket.cos.example/videos/clan-event/15.mp4?sign=1');
    expect(dest.public_url).toBe('https://cdn.example/videos/clan-event/15.mp4');
  });

  it('预签名失败时退回本地 /media 路径', async () => {
    const uploader = {
      getDriverType: () => 'cos' as const,
      getPresignedPutUrl: jest.fn().mockRejectedValue(new Error('no secret')),
      getCdnUrl: jest.fn(),
    };

    const dest = await resolveClanVideoDestination(uploader, 'clan-migration', '21');

    expect(dest.upload_url).toBeUndefined();
    expect(dest.public_url).toBe('/media/videos_clan-migration_21.mp4');
    expect(uploader.getCdnUrl).not.toHaveBeenCalled();
  });
});

describe('readClanVideoResult', () => {
  it('读取 video_url 与 videoUrl，空地址返回 null', () => {
    expect(readClanVideoResult({ video_url: ' https://cdn.example/a.mp4 ', duration_seconds: 8, file_size: 4 })).toEqual({
      video_url: 'https://cdn.example/a.mp4',
      duration_seconds: 8,
      file_size: 4n,
    });
    expect(readClanVideoResult({ videoUrl: 'https://cdn.example/b.mp4', durationSeconds: 6, fileSize: '9' })).toEqual({
      video_url: 'https://cdn.example/b.mp4',
      duration_seconds: 6,
      file_size: 9n,
    });
    expect(readClanVideoResult({ video_url: '   ' })).toBeNull();
    expect(readClanVideoResult({})).toBeNull();
  });
});
