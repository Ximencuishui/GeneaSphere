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
