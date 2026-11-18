jest.mock('../cos/cos.service', () => ({
  CosService: class CosService {},
}));

import { BadRequestException } from '@nestjs/common';
import { VideoProjectStatus } from '@prisma/client';
import { ClanMigrationVideoService } from './clan-migration-video.service';

type ResponseReader = {
  toResponse: (row: Record<string, unknown>) => Record<string, unknown>;
};

describe('ClanMigrationVideoService.toResponse', () => {
  const service = new ClanMigrationVideoService({} as never);

  it('toResponse 输出可被 JSON.stringify 且 id 类字段是字符串', () => {
    const output = (service as unknown as ResponseReader).toResponse({
      id: 21n,
      clan_id: 7n,
      file_size: 4096n,
      title: '全族迁徙历史',
      created_at: new Date('2026-01-01T00:00:00.000Z'),
      completed_at: null,
      extra_id: 99n,
    });

    expect(() => JSON.stringify(output)).not.toThrow();
    expect(JSON.stringify(output)).toContain('"clan_id":"7"');
    expect(output.id).toBe('21');
    expect(output.clan_id).toBe('7');
    expect(output.extra_id).toBe('99');
    expect(output.file_size).toBe(4096);
    for (const value of Object.values(output)) {
      expect(typeof value).not.toBe('bigint');
    }
  });
});

describe('ClanMigrationVideoService.create', () => {
  it('create 写入 type 为 video 的 HeavyJob，项目保持 queued 且没有假地址', async () => {
    const project = {
      id: 21n,
      clan_id: 7n,
      title: '全族迁徙历史',
      status: VideoProjectStatus.queued,
      video_url: null,
      file_size: null,
      created_at: new Date('2026-01-01T00:00:00.000Z'),
      completed_at: null,
    };
    const prisma = {
      migrationEvent: { findMany: jest.fn().mockResolvedValue([{ id: 1n }]) },
      clanMigrationVideo: {
        create: jest.fn().mockResolvedValue(project),
        update: jest.fn(),
      },
      heavyJob: { create: jest.fn().mockResolvedValue({ id: 2n }) },
    };
    const service = new ClanMigrationVideoService(prisma as never);

    const output = await service.create(7n, 'user-1', { title: '全族迁徙历史' });

    const created = prisma.clanMigrationVideo.create.mock.calls[0][0].data;
    expect(created.status).toBe(VideoProjectStatus.queued);
    expect(created.video_url).toBeUndefined();
    expect(created.file_size).toBeUndefined();
    expect(created.duration_seconds).toBeUndefined();
    expect(prisma.clanMigrationVideo.update).not.toHaveBeenCalled();

    expect(prisma.heavyJob.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'video',
        status: 'pending',
        userId: 'user-1',
        clanId: 7n,
        payload: expect.objectContaining({
          kind: 'clan-migration',
          projectId: '21',
          style: 'nostalgic',
          slide_seconds: 8,
          public_url: '/media/videos_clan-migration_21.mp4',
          events: [
            expect.objectContaining({
              title: '迁徙',
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
      'videos_clan-migration_21.mp4',
    );

    expect(output.status).toBe(VideoProjectStatus.queued);
    expect(output.status).not.toBe(VideoProjectStatus.completed);
    const text = JSON.stringify(output);
    expect(text).not.toContain('cdn.xungenlu.cn');
    expect(text).not.toContain('/storage/');
  });

  it('heavyJob.create 抛错时把项目标为 failed', async () => {
    const project = {
      id: 21n,
      clan_id: 7n,
      title: '全族迁徙历史',
      status: VideoProjectStatus.queued,
      created_at: new Date('2026-01-01T00:00:00.000Z'),
      completed_at: null,
    };
    const prisma = {
      migrationEvent: { findMany: jest.fn().mockResolvedValue([{ id: 1n }]) },
      clanMigrationVideo: {
        create: jest.fn().mockResolvedValue(project),
        update: jest.fn().mockResolvedValue({ ...project, status: VideoProjectStatus.failed }),
      },
      heavyJob: { create: jest.fn().mockRejectedValue(new Error('queue down')) },
    };
    const service = new ClanMigrationVideoService(prisma as never);

    await expect(service.create(7n, 'user-1', { title: '全族迁徙历史' })).rejects.toThrow('queue down');
    expect(prisma.clanMigrationVideo.update).toHaveBeenCalledWith({
      where: { id: 21n },
      data: { status: VideoProjectStatus.failed },
    });
  });

  it('同时传 start_year 与 end_year 时 findMany 的 where 包含 event_year gte 与 lte', async () => {
    const project = {
      id: 21n,
      clan_id: 7n,
      title: '全族迁徙历史',
      status: VideoProjectStatus.queued,
      created_at: new Date('2026-01-01T00:00:00.000Z'),
      completed_at: null,
    };
    const prisma = {
      migrationEvent: { findMany: jest.fn().mockResolvedValue([{ id: 1n }]) },
      clanMigrationVideo: { create: jest.fn().mockResolvedValue(project) },
      heavyJob: { create: jest.fn().mockResolvedValue({ id: 2n }) },
    };
    const service = new ClanMigrationVideoService(prisma as never);

    await service.create(7n, 'user-1', { title: '全族迁徙历史', start_year: 1600, end_year: 1900 });

    expect(prisma.migrationEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clan_id: 7n,
          event_year: { gte: 1600, lte: 1900 },
        }),
      }),
    );
  });

  it('匹配事件为空时 create 抛错且不调用 clanMigrationVideo.create 与 heavyJob.create', async () => {
    const prisma = {
      migrationEvent: { findMany: jest.fn().mockResolvedValue([]) },
      clanMigrationVideo: { create: jest.fn() },
      heavyJob: { create: jest.fn() },
    };
    const service = new ClanMigrationVideoService(prisma as never);

    await expect(
      service.create(7n, 'user-1', { title: '全族迁徙历史', start_year: 1600, end_year: 1900 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.clanMigrationVideo.create).not.toHaveBeenCalled();
    expect(prisma.heavyJob.create).not.toHaveBeenCalled();
  });

  it('create 把迁徙起止、描述、图片和本地成片地址写进 HeavyJob payload', async () => {
    const project = {
      id: 21n,
      clan_id: 7n,
      title: '全族迁徙历史',
      status: VideoProjectStatus.queued,
      created_at: new Date('2026-01-01T00:00:00.000Z'),
      completed_at: null,
    };
    const prisma = {
      migrationEvent: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 1n,
            event_year: 1600,
            from_location: '汀州',
            to_location: '重庆',
            description: '入川',
            reason: '避乱',
          },
          {
            id: 2n,
            event_year: 1800,
            from_location: '重庆',
            to_location: '成都',
            description: null,
            reason: '经商',
          },
        ]),
      },
      migrationLocationMedia: {
        findMany: jest.fn().mockResolvedValue([
          {
            location_name: '重庆',
            display_order: 0,
            media: {
              display_url: '/media/cq.jpg',
              file_url: '/media/cq-full.jpg',
              thumb_url: null,
              deleted_at: null,
            },
          },
        ]),
      },
      clanMigrationVideo: { create: jest.fn().mockResolvedValue(project) },
      heavyJob: { create: jest.fn().mockResolvedValue({ id: 2n }) },
    };
    const service = new ClanMigrationVideoService(prisma as never);

    await service.create(7n, 'user-1', { title: '全族迁徙历史', style: 'modern' });

    const payload = prisma.heavyJob.create.mock.calls[0][0].data.payload;
    expect(payload).toMatchObject({
      kind: 'clan-migration',
      projectId: '21',
      title: '全族迁徙历史',
      style: 'modern',
      slide_seconds: 6,
      public_url: '/media/videos_clan-migration_21.mp4',
      events: [
        {
          title: '汀州 → 重庆',
          year: 1600,
          place: '汀州 → 重庆',
          description: '入川',
          image_url: '/media/cq.jpg',
        },
        {
          title: '重庆 → 成都',
          year: 1800,
          place: '重庆 → 成都',
          description: '经商',
          image_url: '/media/cq.jpg',
        },
      ],
    });
    expect(payload.storage_path).toContain('videos_clan-migration_21.mp4');
    expect(payload.upload_url).toBeUndefined();
    expect(prisma.clanMigrationVideo.create.mock.calls[0][0].data.video_url).toBeUndefined();
  });
});

describe('ClanMigrationVideoService.preview', () => {
  it('同时传 start_year 与 end_year 时查询条件合并 gte 与 lte，无事件仍返回 event_count 0', async () => {
    const count = jest.fn().mockResolvedValue(0);
    const aggregate = jest.fn().mockResolvedValue({
      _min: { event_year: null },
      _max: { event_year: null },
    });
    const prisma = {
      migrationEvent: { count, aggregate },
      $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    const service = new ClanMigrationVideoService(prisma as never);

    const result = await service.preview(7n, { start_year: 1600, end_year: 1900 });

    const where = { clan_id: 7n, event_year: { gte: 1600, lte: 1900 } };
    expect(count).toHaveBeenCalledWith({ where });
    expect(aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where }),
    );
    expect(result.event_count).toBe(0);
  });
});
