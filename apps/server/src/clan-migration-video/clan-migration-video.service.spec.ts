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
      migrationEvent: { findMany: jest.fn().mockResolvedValue([]) },
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
      data: {
        type: 'video',
        status: 'pending',
        userId: 'user-1',
        clanId: 7n,
        payload: { kind: 'clan-migration', projectId: '21' },
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
      id: 21n,
      clan_id: 7n,
      title: '全族迁徙历史',
      status: VideoProjectStatus.queued,
      created_at: new Date('2026-01-01T00:00:00.000Z'),
      completed_at: null,
    };
    const prisma = {
      migrationEvent: { findMany: jest.fn().mockResolvedValue([]) },
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
});
