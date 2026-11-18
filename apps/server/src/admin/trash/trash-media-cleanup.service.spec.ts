import { unlink } from 'fs/promises';
import * as path from 'path';
import { TrashMediaCleanupService } from './trash-media-cleanup.service';

jest.mock('fs/promises', () => ({
  unlink: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../cos/cos.service', () => ({
  CosService: class CosService {},
}));

describe('TrashMediaCleanupService', () => {
  const prisma = {
    mediaArchive: {
      findMany: jest.fn(),
      delete: jest.fn(),
    },
    mediaPersonLink: {
      deleteMany: jest.fn(),
    },
    mediaReview: {
      deleteMany: jest.fn(),
    },
    clanAlbum: {
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const cos = { deleteFile: jest.fn() };
  const service = new TrashMediaCleanupService(prisma as never, cos as never);
  const unlinkMock = unlink as jest.Mock;
  const originalStorage = process.env.STORAGE_PATH;
  const storageRoot = path.resolve('storage-test-trash');

  beforeEach(() => {
    jest.clearAllMocks();
    unlinkMock.mockResolvedValue(undefined);
    prisma.mediaPersonLink.deleteMany.mockResolvedValue({ count: 0 });
    prisma.mediaReview.deleteMany.mockResolvedValue({ count: 0 });
    prisma.mediaArchive.delete.mockResolvedValue({});
    cos.deleteFile.mockResolvedValue(undefined);
    process.env.STORAGE_PATH = storageRoot;
  });

  afterAll(() => {
    process.env.STORAGE_PATH = originalStorage;
  });

  it('purges media deleted more than 30 days before the injected now and does not decrement photo_count', async () => {
    const now = new Date('2020-01-31T00:00:00.000Z');
    const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    prisma.mediaArchive.findMany.mockResolvedValue([
      {
        id: 1n,
        file_url: '/media/old.jpg',
        display_url: null,
        thumb_url: null,
        original_key: null,
      },
    ]);

    const removed = await service.purgeExpired(now);

    expect(removed).toBe(1);
    expect(prisma.mediaArchive.findMany).toHaveBeenCalledWith({
      where: { deleted_at: { not: null, lt: cutoff } },
      select: {
        id: true,
        file_url: true,
        display_url: true,
        thumb_url: true,
        original_key: true,
      },
    });
    expect(prisma.mediaPersonLink.deleteMany).toHaveBeenCalledWith({ where: { media_id: 1n } });
    expect(prisma.mediaReview.deleteMany).toHaveBeenCalledWith({ where: { media_id: 1n } });
    expect(prisma.mediaArchive.delete).toHaveBeenCalledWith({ where: { id: 1n } });
    expect(prisma.mediaPersonLink.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.mediaArchive.delete.mock.invocationCallOrder[0],
    );
    expect(prisma.mediaReview.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.mediaArchive.delete.mock.invocationCallOrder[0],
    );
    expect(prisma.clanAlbum.update).not.toHaveBeenCalled();
    expect(prisma.clanAlbum.updateMany).not.toHaveBeenCalled();
    expect(unlinkMock).toHaveBeenCalledWith(path.resolve(storageRoot, 'old.jpg'));
  });

  it('unlinks local /media files and calls CosService.deleteFile for remote objects', async () => {
    prisma.mediaArchive.findMany.mockResolvedValue([
      {
        id: 2n,
        file_url: 'https://cdn.example.com/media/display/1/abc.jpg',
        display_url: 'https://cdn.example.com/media/display/1/abc.jpg',
        thumb_url: 'https://cdn.example.com/media/thumb/1/abc.webp',
        original_key: 'media/original/1/abc.jpg',
      },
      {
        id: 3n,
        file_url: '/media/thumbnails/keep.jpg',
        display_url: null,
        thumb_url: null,
        original_key: null,
      },
      {
        id: 4n,
        file_url: 'not-a-key',
        display_url: null,
        thumb_url: null,
        original_key: null,
      },
    ]);

    const removed = await service.purgeExpired(new Date('2026-11-15T00:00:00.000Z'));

    expect(removed).toBe(3);
    expect(unlinkMock).toHaveBeenCalledWith(path.resolve(storageRoot, 'thumbnails', 'keep.jpg'));
    expect(cos.deleteFile).toHaveBeenCalledWith('media/original/1/abc.jpg', 'cold');
    expect(cos.deleteFile).toHaveBeenCalledWith('media/display/1/abc.jpg', 'hot');
    expect(cos.deleteFile).toHaveBeenCalledWith('media/thumb/1/abc.webp', 'hot');
    expect(cos.deleteFile).toHaveBeenCalledTimes(3);
    expect(unlinkMock).not.toHaveBeenCalledWith(expect.stringContaining('not-a-key'));
    expect(prisma.clanAlbum.update).not.toHaveBeenCalled();
    expect(prisma.clanAlbum.updateMany).not.toHaveBeenCalled();
  });
});
