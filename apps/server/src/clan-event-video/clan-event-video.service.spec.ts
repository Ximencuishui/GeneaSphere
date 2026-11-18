jest.mock('../cos/cos.service', () => ({
  CosService: class CosService {},
}));

import { BadRequestException } from '@nestjs/common';
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
      familyEvent: { findMany: jest.fn().mockResolvedValue([{ id: 1n }]) },
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
      data: expect.objectContaining({
        type: 'video',
        status: 'pending',
        userId: 'user-1',
        clanId: 7n,
        payload: expect.objectContaining({
          kind: 'clan-event',
          projectId: '15',
          style: 'nostalgic',
          slide_seconds: 8,
          public_url: '/media/videos_clan-event_15.mp4',
          events: [
            expect.objectContaining({
              title: '家族事件',
              year: null,
              place: '',
              description: '',
              image_url: null,
            }),
          ],
        }),
      }),
    });
    expect(prisma.heavyJob.create.mock.calls[0][0].data.payload.upload_url).toBeUndefined();
    expect(prisma.heavyJob.create.mock.calls[0][0].data.payload.storage_path).toContain(
      'videos_clan-event_15.mp4',
    );

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
      familyEvent: { findMany: jest.fn().mockResolvedValue([{ id: 1n }]) },
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

  it('同时传 start_year 与 end_year 时 findMany 的 where 包含 event_year gte 与 lte', async () => {
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
      familyEvent: { findMany: jest.fn().mockResolvedValue([{ id: 1n }]) },
      clanEventVideo: { create: jest.fn().mockResolvedValue(project) },
      heavyJob: { create: jest.fn().mockResolvedValue({ id: 1n }) },
    };
    const service = new ClanEventVideoService(prisma as never);

    await service.create(7n, 'user-1', { title: '家族大事件', start_year: 1600, end_year: 1900 });

    expect(prisma.familyEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clan_id: 7n,
          event_year: { gte: 1600, lte: 1900 },
        }),
      }),
    );
  });

  it('匹配事件为空时 create 抛错且不调用 clanEventVideo.create 与 heavyJob.create', async () => {
    const prisma = {
      familyEvent: { findMany: jest.fn().mockResolvedValue([]) },
      clanEventVideo: { create: jest.fn() },
      heavyJob: { create: jest.fn() },
    };
    const service = new ClanEventVideoService(prisma as never);

    await expect(
      service.create(7n, 'user-1', { title: '家族大事件', start_year: 1600, end_year: 1900 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.clanEventVideo.create).not.toHaveBeenCalled();
    expect(prisma.heavyJob.create).not.toHaveBeenCalled();
  });

  it('create 把事件快照、风格和本地成片地址写进 HeavyJob payload', async () => {
    const project = {
      id: 15n,
      clan_id: 7n,
      title: '家族大事件',
      status: VideoProjectStatus.queued,
      event_type_filter: ['ancestor_worship'],
      created_at: new Date('2026-01-01T00:00:00.000Z'),
      completed_at: null,
    };
    const prisma = {
      familyEvent: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 3n,
            event_name: '春祭',
            event_year: 1680,
            location: '祠堂',
            description: '合族祭祖',
            media_ids: [9, 10],
          },
          {
            id: 4n,
            event_name: '修谱',
            event_year: 1720,
            location: '宗祠',
            description: '第三次修谱',
            media_ids: [],
          },
        ]),
      },
      mediaArchive: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 9n,
            display_url: '/media/spring.jpg',
            file_url: '/media/spring-full.jpg',
            thumb_url: null,
          },
        ]),
      },
      clanEventVideo: { create: jest.fn().mockResolvedValue(project) },
      heavyJob: { create: jest.fn().mockResolvedValue({ id: 1n }) },
    };
    const service = new ClanEventVideoService(prisma as never);

    await service.create(7n, 'user-1', { title: '家族大事件', style: 'solemn' });

    const payload = prisma.heavyJob.create.mock.calls[0][0].data.payload;
    expect(payload).toMatchObject({
      kind: 'clan-event',
      projectId: '15',
      title: '家族大事件',
      style: 'solemn',
      slide_seconds: 10,
      public_url: '/media/videos_clan-event_15.mp4',
      events: [
        {
          title: '春祭',
          year: 1680,
          place: '祠堂',
          description: '合族祭祖',
          image_url: '/media/spring.jpg',
        },
        {
          title: '修谱',
          year: 1720,
          place: '宗祠',
          description: '第三次修谱',
          image_url: null,
        },
      ],
    });
    expect(payload.storage_path).toContain('videos_clan-event_15.mp4');
    expect(payload.upload_url).toBeUndefined();
    expect(prisma.mediaArchive.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ clan_id: 7n, deleted_at: null }),
      }),
    );
    expect(prisma.clanEventVideo.create.mock.calls[0][0].data.video_url).toBeUndefined();
  });
});

describe('ClanEventVideoService.preview', () => {
  it('同时传 start_year 与 end_year 时查询条件合并 gte 与 lte，无事件仍返回 event_count 0', async () => {
    const count = jest.fn().mockResolvedValue(0);
    const aggregate = jest.fn().mockResolvedValue({
      _min: { event_year: null },
      _max: { event_year: null },
    });
    const prisma = {
      familyEvent: { count, aggregate },
      $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    const service = new ClanEventVideoService(prisma as never);

    const result = await service.preview(7n, { start_year: 1600, end_year: 1900 });

    const where = { clan_id: 7n, event_year: { gte: 1600, lte: 1900 } };
    expect(count).toHaveBeenCalledWith({ where });
    expect(aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where }),
    );
    expect(result.event_count).toBe(0);
  });
});
