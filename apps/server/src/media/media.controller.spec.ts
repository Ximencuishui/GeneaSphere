import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ReviewStatus } from '@prisma/client';

jest.mock('./media.service', () => ({ MediaService: class MediaService {} }));
jest.mock('@geneasphere/db', () => ({ PrismaService: class PrismaService {} }));

import { MediaController } from './media.controller';
import { coverMediaWhere } from './media-visibility';

describe('MediaController upload', () => {
  const media = { uploadFile: jest.fn() };
  const prisma = {
    clan: { findUnique: jest.fn() },
    clanMember: { findUnique: jest.fn() },
    clanAlbum: { findFirst: jest.fn(), updateMany: jest.fn() },
    mediaArchive: {
      updateMany: jest.fn(),
      aggregate: jest.fn(),
    },
    mediaReview: { create: jest.fn() },
  };
  const controller = new MediaController(media as never, prisma as never);
  const req = { user: { userId: 'user-1' } };
  const file = {
    buffer: Buffer.from('img'),
    size: 12,
    mimetype: 'image/jpeg',
    originalname: 'a.jpg',
  } as Express.Multer.File;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.clan.findUnique.mockResolvedValue({ admin_user_id: 'owner' });
    prisma.clanMember.findUnique.mockResolvedValue({ role: 'EDITOR' });
    media.uploadFile.mockResolvedValue({ id: 8n, file_url: '/media/a.jpg' });
    prisma.mediaReview.create.mockResolvedValue({ id: 1n });
    prisma.mediaArchive.aggregate.mockResolvedValue({ _sum: { file_size: 0n } });
  });

  it('queues a pending review and ignores the uploader id in the body', async () => {
    const saved = await controller.uploadFile(req, file, {
      clan_id: 4,
      uploader_id: 'someone-else',
      description: '老宅',
    });

    expect(media.uploadFile).toHaveBeenCalledWith(
      file,
      4n,
      'user-1',
      undefined,
      undefined,
      '老宅',
      undefined,
      null,
    );
    expect(prisma.mediaReview.create).toHaveBeenCalledWith({
      data: { media_id: 8n, status: ReviewStatus.PENDING },
    });
    expect(saved.id).toBe('8');
  });

  it('rejects an image larger than 50MB before storing it', async () => {
    const big = { ...file, size: 50 * 1024 * 1024 + 1 };

    await expect(controller.uploadFile(req, big, { clan_id: 4 })).rejects.toBeInstanceOf(BadRequestException);

    expect(media.uploadFile).not.toHaveBeenCalled();
    expect(prisma.mediaReview.create).not.toHaveBeenCalled();
  });

  it('rejects upload when the clan quota would be exceeded', async () => {
    prisma.mediaArchive.aggregate.mockResolvedValue({ _sum: { file_size: 5 * 1024 * 1024 * 1024 } });

    await expect(controller.uploadFile(req, file, { clan_id: 4 })).rejects.toBeInstanceOf(BadRequestException);

    expect(media.uploadFile).not.toHaveBeenCalled();
  });

  it('rejects upload when the user is not a member of the clan', async () => {
    prisma.clanMember.findUnique.mockResolvedValue(null);

    await expect(controller.uploadFile(req, file, { clan_id: 4 })).rejects.toBeInstanceOf(ForbiddenException);

    expect(media.uploadFile).not.toHaveBeenCalled();
    expect(prisma.mediaReview.create).not.toHaveBeenCalled();
  });

  it('increments album photo_count when upload includes album_id', async () => {
    prisma.clanAlbum.findFirst.mockResolvedValue({ id: 7n });
    prisma.clanAlbum.updateMany.mockResolvedValue({ count: 1 });

    await controller.uploadFile(req, file, { clan_id: 4, album_id: 7 });

    expect(media.uploadFile).toHaveBeenCalledWith(
      file,
      4n,
      'user-1',
      undefined,
      undefined,
      undefined,
      undefined,
      7n,
    );
    expect(prisma.clanAlbum.updateMany).toHaveBeenCalledWith({
      where: { id: 7n, clan_id: 4n },
      data: { photo_count: { increment: 1 } },
    });
  });

  it('uses the album default privacy when the request omits privacy_level', async () => {
    prisma.clanAlbum.findFirst.mockResolvedValue({ id: 7n, default_privacy: 'lineage' });
    prisma.clanAlbum.updateMany.mockResolvedValue({ count: 1 });
    prisma.mediaArchive.updateMany.mockResolvedValue({ count: 1 });

    const saved = await controller.uploadFile(req, file, { clan_id: 4, album_id: 7 });

    expect(prisma.clanAlbum.findFirst).toHaveBeenCalledWith({
      where: { id: 7n, clan_id: 4n },
      select: { id: true, default_privacy: true },
    });
    expect(prisma.mediaArchive.updateMany).toHaveBeenCalledWith({
      where: { id: 8n, clan_id: 4n },
      data: { privacy_level: 'lineage' },
    });
    expect(saved.id).toBe('8');
  });

  it('keeps an explicit privacy level instead of the album default', async () => {
    prisma.clanAlbum.findFirst.mockResolvedValue({ id: 7n, default_privacy: 'lineage' });
    prisma.clanAlbum.updateMany.mockResolvedValue({ count: 1 });
    prisma.mediaArchive.updateMany.mockResolvedValue({ count: 1 });

    await controller.uploadFile(req, file, { clan_id: 4, album_id: 7, privacy_level: 'public' });

    expect(prisma.mediaArchive.updateMany).toHaveBeenCalledWith({
      where: { id: 8n, clan_id: 4n },
      data: { privacy_level: 'public' },
    });
  });

  it('passes taken_on through and stores that year', async () => {
    await controller.uploadFile(req, file, {
      clan_id: 4,
      taken_on: '1984-06-07',
      taken_year: 1970,
      latitude: 26.1,
      longitude: 118.2,
    });

    expect(media.uploadFile).toHaveBeenCalledWith(
      file,
      4n,
      'user-1',
      1984,
      undefined,
      undefined,
      undefined,
      null,
      {
        taken_on: new Date(Date.UTC(1984, 5, 7)),
        latitude: 26.1,
        longitude: 118.2,
      },
    );
  });

  it('returns 400 and does not store when coordinates are out of range', async () => {
    await expect(controller.uploadFile(req, file, {
      clan_id: 4,
      latitude: 91,
      longitude: 10,
    })).rejects.toBeInstanceOf(BadRequestException);

    expect(media.uploadFile).not.toHaveBeenCalled();
  });

  it('returns 400 and does not store when only latitude is sent', async () => {
    await expect(controller.uploadFile(req, file, {
      clan_id: 4,
      latitude: 26.1,
    })).rejects.toBeInstanceOf(BadRequestException);

    expect(media.uploadFile).not.toHaveBeenCalled();
  });
});

describe('MediaController delete', () => {
  const media = { deleteMedia: jest.fn() };
  const prisma = {
    clan: { findUnique: jest.fn() },
    clanMember: { findUnique: jest.fn() },
    clanAlbum: { updateMany: jest.fn() },
    mediaArchive: { findUnique: jest.fn(), updateMany: jest.fn(), delete: jest.fn() },
  };
  const controller = new MediaController(media as never, prisma as never);
  const req = { user: { userId: 'user-1' } };
  const row = {
    id: 9n,
    clan_id: 4n,
    uploader_id: 'other',
    album_id: 3n,
    deleted_at: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 404 and does not write deleted_at when the media does not exist', async () => {
    prisma.mediaArchive.findUnique.mockResolvedValue(null);

    await expect(controller.deleteMedia(req, '99')).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.mediaArchive.updateMany).not.toHaveBeenCalled();
    expect(prisma.mediaArchive.delete).not.toHaveBeenCalled();
    expect(media.deleteMedia).not.toHaveBeenCalled();
    expect(prisma.clanAlbum.updateMany).not.toHaveBeenCalled();
  });

  it('returns 404 and does not write when the caller is outside the clan', async () => {
    prisma.mediaArchive.findUnique.mockResolvedValue(row);
    prisma.clan.findUnique.mockResolvedValue({ admin_user_id: 'owner' });
    prisma.clanMember.findUnique.mockResolvedValue(null);

    await expect(controller.deleteMedia(req, '9')).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.mediaArchive.updateMany).not.toHaveBeenCalled();
    expect(prisma.clanAlbum.updateMany).not.toHaveBeenCalled();
  });

  it('returns 403 and does not write when a member deletes someone else media', async () => {
    prisma.mediaArchive.findUnique.mockResolvedValue(row);
    prisma.clan.findUnique.mockResolvedValue({ admin_user_id: 'owner' });
    prisma.clanMember.findUnique.mockResolvedValue({ role: 'EDITOR' });

    await expect(controller.deleteMedia(req, '9')).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.mediaArchive.updateMany).not.toHaveBeenCalled();
    expect(prisma.clanAlbum.updateMany).not.toHaveBeenCalled();
    expect(media.deleteMedia).not.toHaveBeenCalled();
  });

  it('soft-deletes clan media for an admin and decrements the album count', async () => {
    prisma.mediaArchive.findUnique.mockResolvedValue(row);
    prisma.clan.findUnique.mockResolvedValue({ admin_user_id: 'owner' });
    prisma.clanMember.findUnique.mockResolvedValue({ role: 'ADMIN' });
    prisma.mediaArchive.updateMany.mockResolvedValue({ count: 1 });
    prisma.clanAlbum.updateMany.mockResolvedValue({ count: 1 });

    await controller.deleteMedia(req, '9');

    expect(prisma.mediaArchive.updateMany).toHaveBeenCalledWith({
      where: { id: 9n, clan_id: 4n, deleted_at: null },
      data: expect.objectContaining({ deleted_by: 'user-1' }),
    });
    expect(prisma.mediaArchive.delete).not.toHaveBeenCalled();
    expect(media.deleteMedia).not.toHaveBeenCalled();
    expect(prisma.clanAlbum.updateMany).toHaveBeenCalledWith({
      where: { id: 3n, clan_id: 4n, photo_count: { gt: 0 } },
      data: { photo_count: { decrement: 1 } },
    });
  });
});

describe('MediaController covers', () => {
  const prisma = { mediaArchive: { findMany: jest.fn() } };
  const controller = new MediaController({} as never, prisma as never);

  it('lists covers only for the requested clan and hides pending reviews', async () => {
    prisma.mediaArchive.findMany.mockResolvedValue([
      { id: 5n, file_url: '/media/a.jpg', clan_id: 3n, is_cover: true },
    ]);

    const rows = await controller.listCovers('3');

    expect(prisma.mediaArchive.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: coverMediaWhere(3n),
    }));
    const where = coverMediaWhere(3n) as {
      clan_id: bigint;
      is_cover: boolean;
      NOT: { reviews: { some: { status: { in: string[] } } } };
    };
    expect(where.clan_id).toBe(3n);
    expect(where.is_cover).toBe(true);
    expect(where.NOT.reviews.some.status.in).toEqual(['PENDING', 'REJECTED']);
    expect(rows).toEqual([
      { id: '5', file_url: '/media/a.jpg', clan_id: '3', is_cover: true },
    ]);
  });
});
