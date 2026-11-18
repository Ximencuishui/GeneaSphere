import { NotFoundException } from '@nestjs/common';
import { AdminAlbumController } from './admin-album.controller';

describe('AdminAlbumController clan isolation', () => {
  const admin = {
    requireAdminBySlug: jest.fn(),
    resolveMediaActor: jest.fn(),
    logAction: jest.fn(),
  };
  const prisma = {
    clanAlbum: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    mediaArchive: {
      count: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    user: {
      findMany: jest.fn(),
    },
  };
  const controller = new AdminAlbumController(admin as never, prisma as never);
  const req = { user: { userId: 'admin-a' } };

  beforeEach(() => {
    jest.clearAllMocks();
    admin.requireAdminBySlug.mockResolvedValue(1n);
    admin.logAction.mockResolvedValue(undefined);
  });

  it('rejects cross-clan album delete with 404 and does not clear photos', async () => {
    prisma.clanAlbum.findFirst.mockResolvedValue(null);

    await expect(controller.deleteAlbum(req, '50', 'clan-a')).rejects.toBeInstanceOf(NotFoundException);

    expect(admin.requireAdminBySlug).toHaveBeenCalledWith('clan-a', 'admin-a');
    expect(prisma.clanAlbum.findFirst).toHaveBeenCalledWith({
      where: { id: 50n, clan_id: 1n },
      select: { id: true },
    });
    expect(prisma.mediaArchive.updateMany).not.toHaveBeenCalled();
    expect(prisma.mediaArchive.update).not.toHaveBeenCalled();
    expect(prisma.mediaArchive.delete).not.toHaveBeenCalled();
    expect(prisma.clanAlbum.create).not.toHaveBeenCalled();
    expect(prisma.clanAlbum.delete).not.toHaveBeenCalled();
    expect(prisma.clanAlbum.deleteMany).not.toHaveBeenCalled();
    expect(prisma.clanAlbum.update).not.toHaveBeenCalled();
    expect(prisma.clanAlbum.updateMany).not.toHaveBeenCalled();
    expect(admin.logAction).not.toHaveBeenCalled();
  });

  it('moves photos into the clan 未分类 album and updates both photo counts', async () => {
    prisma.clanAlbum.findFirst
      .mockResolvedValueOnce({ id: 50n })
      .mockResolvedValueOnce({ id: 8n });
    prisma.mediaArchive.count.mockResolvedValue(3);
    prisma.mediaArchive.updateMany.mockResolvedValue({ count: 3 });
    prisma.clanAlbum.updateMany.mockResolvedValue({ count: 1 });
    prisma.clanAlbum.deleteMany.mockResolvedValue({ count: 1 });

    await controller.deleteAlbum(req, '50', 'clan-a');

    expect(prisma.clanAlbum.findFirst).toHaveBeenNthCalledWith(2, {
      where: { clan_id: 1n, name: '未分类', id: { not: 50n } },
      select: { id: true },
    });
    expect(prisma.clanAlbum.create).not.toHaveBeenCalled();
    expect(prisma.mediaArchive.updateMany).toHaveBeenCalledWith({
      where: { album_id: 50n, clan_id: 1n },
      data: { album_id: 8n },
    });
    expect(prisma.mediaArchive.updateMany.mock.calls[0][0].data.deleted_at).toBeUndefined();
    expect(prisma.mediaArchive.delete).not.toHaveBeenCalled();
    expect(prisma.clanAlbum.updateMany).toHaveBeenCalledWith({
      where: { id: 8n, clan_id: 1n },
      data: { photo_count: { increment: 3 } },
    });
    expect(prisma.clanAlbum.updateMany).toHaveBeenCalledWith({
      where: { id: 50n, clan_id: 1n },
      data: { photo_count: 0 },
    });
    expect(prisma.clanAlbum.deleteMany).toHaveBeenCalledWith({
      where: { id: 50n, clan_id: 1n },
    });
  });

  it('creates 未分类 in the current clan when none exists', async () => {
    prisma.clanAlbum.findFirst
      .mockResolvedValueOnce({ id: 50n })
      .mockResolvedValueOnce(null);
    prisma.clanAlbum.create.mockResolvedValue({ id: 9n });
    prisma.mediaArchive.count.mockResolvedValue(2);
    prisma.mediaArchive.updateMany.mockResolvedValue({ count: 2 });
    prisma.clanAlbum.updateMany.mockResolvedValue({ count: 1 });
    prisma.clanAlbum.deleteMany.mockResolvedValue({ count: 1 });

    await controller.deleteAlbum(req, '50', 'clan-a');

    expect(prisma.clanAlbum.create).toHaveBeenCalledWith({
      data: {
        clan_id: 1n,
        name: '未分类',
        default_privacy: 'clan',
        creator_id: 'admin-a',
      },
      select: { id: true },
    });
    expect(prisma.mediaArchive.updateMany).toHaveBeenCalledWith({
      where: { album_id: 50n, clan_id: 1n },
      data: { album_id: 9n },
    });
  });

  it('reads clanSlug from the path when creating an album and does not use body.clanSlug', async () => {
    prisma.clanAlbum.create.mockResolvedValue({
      id: 3n,
      name: '新相册',
      created_at: new Date('2026-01-01'),
    });

    await controller.createAlbum(req, 'clan-a', { clanSlug: 'clan-b', name: '新相册' });

    expect(admin.requireAdminBySlug).toHaveBeenCalledTimes(1);
    expect(admin.requireAdminBySlug).toHaveBeenCalledWith('clan-a', 'admin-a');
    expect(admin.requireAdminBySlug).not.toHaveBeenCalledWith('clan-b', expect.anything());
    expect(prisma.clanAlbum.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ clan_id: 1n, name: '新相册' }),
    }));
  });

  it('includes the creator name and leaves a missing creator empty', async () => {
    admin.resolveMediaActor.mockResolvedValue({ clanId: 1n });
    prisma.clanAlbum.findMany.mockResolvedValue([
      {
        id: 3n,
        name: '老照片',
        description: null,
        cover_url: null,
        default_privacy: 'clan',
        photo_count: 1,
        creator_id: 'admin-a',
        created_at: new Date('2026-01-01'),
      },
      {
        id: 4n,
        name: '无名',
        description: null,
        cover_url: null,
        default_privacy: 'clan',
        photo_count: 0,
        creator_id: 'missing',
        created_at: new Date('2026-01-02'),
      },
    ]);
    prisma.user.findMany.mockResolvedValue([
      { id: 'admin-a', nickname: '族长', phone: '13800000000' },
    ]);

    const result = await controller.getAlbums(req, 'clan-a');

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['admin-a', 'missing'] } },
      select: { id: true, nickname: true, phone: true },
    });
    expect(result.data.map((row) => row.creator_name)).toEqual(['族长', null]);
  });
});
