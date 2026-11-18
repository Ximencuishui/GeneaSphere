import { VideoProjectStatus } from '@prisma/client';
import { JobsService } from './jobs.service';

function failedJob(payload: unknown) {
  return {
    id: 9n,
    type: 'video',
    status: 'failed',
    payload,
    errorMessage: '视频生成尚未实现',
    completedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

describe('JobsService.failJob', () => {
  it('failJob 收到 clan-event payload 时把项目 status 写成 failed', async () => {
    const prisma = {
      heavyJob: {
        update: jest.fn().mockResolvedValue(failedJob({ kind: 'clan-event', projectId: '15' })),
      },
      clanEventVideo: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      clanMigrationVideo: { updateMany: jest.fn() },
    };
    const service = new JobsService(prisma as never);

    await service.failJob('9', '视频生成尚未实现');

    expect(prisma.heavyJob.update).toHaveBeenCalled();
    expect(prisma.clanEventVideo.updateMany).toHaveBeenCalledWith({
      where: { id: 15n },
      data: { status: VideoProjectStatus.failed },
    });
    expect(prisma.clanMigrationVideo.updateMany).not.toHaveBeenCalled();
  });

  it('failJob 收到 clan-migration payload 时把项目 status 写成 failed', async () => {
    const prisma = {
      heavyJob: {
        update: jest.fn().mockResolvedValue(failedJob({ kind: 'clan-migration', projectId: '21' })),
      },
      clanEventVideo: { updateMany: jest.fn() },
      clanMigrationVideo: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const service = new JobsService(prisma as never);

    await service.failJob('9', '视频生成尚未实现');

    expect(prisma.clanMigrationVideo.updateMany).toHaveBeenCalledWith({
      where: { id: 21n },
      data: { status: VideoProjectStatus.failed },
    });
    expect(prisma.clanEventVideo.updateMany).not.toHaveBeenCalled();
  });

  it('failJob 在项目不存在时仍回写任务行且不抛错', async () => {
    const prisma = {
      heavyJob: {
        update: jest.fn().mockResolvedValue(failedJob({ kind: 'clan-event', projectId: '15' })),
      },
      clanEventVideo: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      clanMigrationVideo: { updateMany: jest.fn() },
    };
    const service = new JobsService(prisma as never);

    await expect(service.failJob('9', '视频生成尚未实现')).resolves.toMatchObject({ status: 'failed' });
    expect(prisma.heavyJob.update).toHaveBeenCalled();
    expect(prisma.clanEventVideo.updateMany).toHaveBeenCalled();
  });
});

function completedJob(payload: unknown) {
  return {
    id: 9n,
    type: 'video',
    status: 'completed',
    payload,
    completedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

describe('JobsService.completeJob', () => {
  it('completeJob 收到 clan-event 且带 video_url 时把项目更新为 completed 并写入地址、时长、体积', async () => {
    const prisma = {
      heavyJob: {
        update: jest.fn().mockResolvedValue(completedJob({ kind: 'clan-event', projectId: '15' })),
      },
      clanEventVideo: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      clanMigrationVideo: { updateMany: jest.fn() },
    };
    const service = new JobsService(prisma as never);

    await service.completeJob('9', {
      video_url: 'https://cdn.example/clan-event.mp4',
      duration_seconds: 16,
      file_size: 4096,
    });

    expect(prisma.heavyJob.update).toHaveBeenCalled();
    expect(prisma.clanEventVideo.updateMany).toHaveBeenCalledWith({
      where: { id: 15n },
      data: {
        status: VideoProjectStatus.completed,
        video_url: 'https://cdn.example/clan-event.mp4',
        duration_seconds: 16,
        file_size: 4096n,
        completed_at: expect.any(Date),
      },
    });
    expect(prisma.clanMigrationVideo.updateMany).not.toHaveBeenCalled();
  });

  it('completeJob 收到 clan-migration 且带 videoUrl 时把项目更新为 completed 并写入地址、时长、体积', async () => {
    const prisma = {
      heavyJob: {
        update: jest.fn().mockResolvedValue(completedJob({ kind: 'clan-migration', projectId: '21' })),
      },
      clanEventVideo: { updateMany: jest.fn() },
      clanMigrationVideo: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const service = new JobsService(prisma as never);

    await service.completeJob('9', {
      videoUrl: 'https://cdn.example/migration.mp4',
      durationSeconds: 10,
      fileSize: 100,
    });

    expect(prisma.clanMigrationVideo.updateMany).toHaveBeenCalledWith({
      where: { id: 21n },
      data: {
        status: VideoProjectStatus.completed,
        video_url: 'https://cdn.example/migration.mp4',
        duration_seconds: 10,
        file_size: 100n,
        completed_at: expect.any(Date),
      },
    });
    expect(prisma.clanEventVideo.updateMany).not.toHaveBeenCalled();
  });

  it('completeJob 没有视频地址时把 clan-event 项目标为 failed', async () => {
    const prisma = {
      heavyJob: {
        update: jest.fn().mockResolvedValue(completedJob({ kind: 'clan-event', projectId: '15' })),
      },
      clanEventVideo: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      clanMigrationVideo: { updateMany: jest.fn() },
    };
    const service = new JobsService(prisma as never);

    await expect(service.completeJob('9', { duration_seconds: 8, video_url: '  ' })).resolves.toMatchObject({
      status: 'completed',
    });
    expect(prisma.clanEventVideo.updateMany).toHaveBeenCalledWith({
      where: { id: 15n },
      data: { status: VideoProjectStatus.failed },
    });
    expect(prisma.clanMigrationVideo.updateMany).not.toHaveBeenCalled();
  });

  it('completeJob 没有视频地址时把 clan-migration 项目标为 failed', async () => {
    const prisma = {
      heavyJob: {
        update: jest.fn().mockResolvedValue(completedJob({ kind: 'clan-migration', projectId: '21' })),
      },
      clanEventVideo: { updateMany: jest.fn() },
      clanMigrationVideo: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const service = new JobsService(prisma as never);

    await service.completeJob('9', {});

    expect(prisma.clanMigrationVideo.updateMany).toHaveBeenCalledWith({
      where: { id: 21n },
      data: { status: VideoProjectStatus.failed },
    });
    expect(prisma.clanEventVideo.updateMany).not.toHaveBeenCalled();
  });

  it('completeJob 收到其他 kind 时不更新大事件或迁徙视频表', async () => {
    const prisma = {
      heavyJob: {
        update: jest.fn().mockResolvedValue(completedJob({ kind: 'puppeteer', projectId: '4' })),
      },
      clanEventVideo: { updateMany: jest.fn() },
      clanMigrationVideo: { updateMany: jest.fn() },
    };
    const service = new JobsService(prisma as never);

    await service.completeJob('9', { video_url: 'https://cdn.example/other.mp4', duration_seconds: 3, file_size: 9 });

    expect(prisma.heavyJob.update).toHaveBeenCalled();
    expect(prisma.clanEventVideo.updateMany).not.toHaveBeenCalled();
    expect(prisma.clanMigrationVideo.updateMany).not.toHaveBeenCalled();
  });

  it('completeJob 在项目已删除或无法写入时仍回写任务行且不抛错', async () => {
    const prisma = {
      heavyJob: {
        update: jest.fn().mockResolvedValue(completedJob({ kind: 'clan-event', projectId: '15' })),
      },
      clanEventVideo: { updateMany: jest.fn().mockRejectedValue(new Error('record gone')) },
      clanMigrationVideo: { updateMany: jest.fn() },
    };
    const service = new JobsService(prisma as never);

    await expect(
      service.completeJob('9', { video_url: 'https://cdn.example/clan-event.mp4', duration_seconds: 8, file_size: 1 }),
    ).resolves.toMatchObject({ status: 'completed' });
    expect(prisma.heavyJob.update).toHaveBeenCalled();
  });
});
