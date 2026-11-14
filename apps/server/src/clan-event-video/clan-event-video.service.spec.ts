import { VideoProjectStatus } from '@prisma/client';
import { ClanEventVideoService } from './clan-event-video.service';

type ResponseReader = {
  toResponse: (row: Record<string, unknown>) => Record<string, unknown>;
};

describe('ClanEventVideoService.toResponse', () => {
  const service = new ClanEventVideoService({} as never);

  it('toResponse 输出可被 JSON.stringify 且 id 类字段是字符串', () => {
    const output = (service as unknown as ResponseReader).toResponse({
      id: 15n,
      clan_id: 7n,
      file_size: 2048n,
      title: '家族大事件·精选回顾',
      event_type_filter: null,
      created_at: new Date('2026-01-01T00:00:00.000Z'),
      completed_at: null,
      extra_id: 99n,
    });

    expect(() => JSON.stringify(output)).not.toThrow();
    expect(JSON.stringify(output)).toContain('"id":"15"');
    expect(output.id).toBe('15');
    expect(output.clan_id).toBe('7');
    expect(output.extra_id).toBe('99');
    expect(output.file_size).toBe(2048);
    for (const value of Object.values(output)) {
      expect(typeof value).not.toBe('bigint');
    }
  });
});

describe('ClanEventVideoService.create', () => {
  it('create 写入 type 为 video 的 HeavyJob，项目保持 queued 且没有假地址', async () => {
    const project = {
      id: 15n,
      clan_id: 7n,
      title: '家族大事件',
      status: VideoProjectStatus.queued,
      video_url: null,
      file_size: null,
      event_type_filter: null,
      created_at: new Date('2026-01-01T00:00:00.000Z'),
      completed_at: null,
    };
    const prisma = {
      familyEvent: { findMany: jest.fn().mockResolvedValue([]) },
      clanEventVideo: {
        create: jest.fn().mockResolvedValue(project),
        update: jest.fn(),
      },
      heavyJob: { create: jest.fn().mockResolvedValue({ id: 1n }) },
    };
    const service = new ClanEventVideoService(prisma as never);

    const output = await service.create(7n, 'user-1', { title: '家族大事件' });

    const created = prisma.clanEventVideo.create.mock.calls[0][0].data;
    expect(created.status).toBe(VideoProjectStatus.queued);
    expect(created.video_url).toBeUndefined();
    expect(created.file_size).toBeUndefined();
    expect(created.duration_seconds).toBeUndefined();
    expect(prisma.clanEventVideo.update).not.toHaveBeenCalled();

    expect(prisma.heavyJob.create).toHaveBeenCalledWith({
      data: {
        type: 'video',
        status: 'pending',
        userId: 'user-1',
        clanId: 7n,
        payload: { kind: 'clan-event', projectId: '15' },
      },
    });

    expect(output.status).toBe(VideoProjectStatus.queued);
    expect(output.status).not.toBe(VideoProjectStatus.completed);
    const text = JSON.stringify(output);
    expect(text).not.toContain('cdn.xungenlu.cn');
    expect(text).not.toContain('/storage/');
  });

  it('heavyJob.create 抛错时把项目标为 failed', async () => {
    const project = {
      id: 15n,
      clan_id: 7n,
      title: '家族大事件',
      status: VideoProjectStatus.queued,
      event_type_filter: null,
      created_at: new Date('2026-01-01T00:00:00.000Z'),
      completed_at: null,
    };
    const prisma = {
      familyEvent: { findMany: jest.fn().mockResolvedValue([]) },
      clanEventVideo: {
        create: jest.fn().mockResolvedValue(project),
        update: jest.fn().mockResolvedValue({ ...project, status: VideoProjectStatus.failed }),
      },
      heavyJob: { create: jest.fn().mockRejectedValue(new Error('queue down')) },
    };
    const service = new ClanEventVideoService(prisma as never);

    await expect(service.create(7n, 'user-1', { title: '家族大事件' })).rejects.toThrow('queue down');
    expect(prisma.clanEventVideo.update).toHaveBeenCalledWith({
      where: { id: 15n },
      data: { status: VideoProjectStatus.failed },
    });
  });
});
