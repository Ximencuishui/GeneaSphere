import { readFileSync } from 'fs';
import { join } from 'path';
import { BadRequestException, NotFoundException, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';

jest.mock('../../cos/cos.service', () => ({ CosService: class CosService {} }));
jest.mock('../../cos/image-processor.service', () => ({ ImageProcessorService: class ImageProcessorService {} }));

import { AdminMediaController } from './admin-media.controller';

function routeOf(methodName: string) {
  const handler = (AdminMediaController.prototype as any)[methodName];
  const path = Reflect.getMetadata(PATH_METADATA, handler);
  const method = Reflect.getMetadata(METHOD_METADATA, handler);
  const raw = Array.isArray(path) ? path[0] : path;
  return { path: String(raw).replace(/^\//, ''), method };
}

function decoratorIndex(source: string, decorator: string) {
  const indexes = [`${decorator}\n`, `${decorator}\r\n`]
    .map((item) => source.indexOf(item))
    .filter((index) => index >= 0);
  return indexes.length ? Math.min(...indexes) : -1;
}

describe('AdminMediaController clan isolation', () => {
  const admin = {
    resolveMediaActor: jest.fn(),
    requireAdminBySlug: jest.fn(),
    logAction: jest.fn(),
  };
  const prisma = {
    mediaArchive: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    clanAlbum: {
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    person: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    mediaPersonLink: {
      create: jest.fn(),
      createMany: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
  const controller = new AdminMediaController(admin as never, prisma as never);
  const req = { user: { userId: 'admin-a' } };

  beforeEach(() => {
    jest.clearAllMocks();
    admin.resolveMediaActor.mockResolvedValue({ clanId: 1n, role: 'ADMIN' });
    admin.requireAdminBySlug.mockResolvedValue(1n);
    admin.logAction.mockResolvedValue(undefined);
  });

  it('rejects cross-clan media delete with 404 and does not soft-delete', async () => {
    prisma.mediaArchive.findFirst.mockResolvedValue(null);

    await expect(controller.deleteMedia(req, '99', 'clan-a')).rejects.toBeInstanceOf(NotFoundException);

    expect(admin.resolveMediaActor).toHaveBeenCalledWith('clan-a', 'admin-a');
    expect(prisma.mediaArchive.findFirst).toHaveBeenCalledWith({
      where: { id: 99n, clan_id: 1n, deleted_at: null },
      select: { album_id: true, uploader_id: true },
    });
    expect(prisma.mediaArchive.update).not.toHaveBeenCalled();
    expect(prisma.mediaArchive.updateMany).not.toHaveBeenCalled();
    expect(prisma.mediaArchive.delete).not.toHaveBeenCalled();
    expect(prisma.clanAlbum.update).not.toHaveBeenCalled();
    expect(prisma.clanAlbum.updateMany).not.toHaveBeenCalled();
    expect(admin.logAction).not.toHaveBeenCalled();
  });

  it('reads clanSlug from the path for batch delete and does not use body.clanSlug', async () => {
    prisma.mediaArchive.findMany.mockResolvedValue([
      { id: 9n, album_id: null, uploader_id: 'admin-a' },
    ]);
    prisma.mediaArchive.updateMany.mockResolvedValue({ count: 1 });

    const result = await controller.batchDelete(req, 'clan-a', { ids: ['9'], clanSlug: 'clan-b' });

    expect(admin.resolveMediaActor).toHaveBeenCalledTimes(1);
    expect(admin.resolveMediaActor).toHaveBeenCalledWith('clan-a', 'admin-a');
    expect(admin.resolveMediaActor).not.toHaveBeenCalledWith('clan-b', expect.anything());
    expect(prisma.mediaArchive.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: [9n] }, clan_id: 1n, deleted_at: null },
      data: expect.objectContaining({ deleted_by: 'admin-a' }),
    }));
    expect(result).toEqual({ success: true, count: 1 });
  });

  it('returns 404 when batch delete matches no media in the current clan', async () => {
    prisma.mediaArchive.findMany.mockResolvedValue([]);

    await expect(controller.batchDelete(req, 'clan-a', { ids: ['99'] })).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.mediaArchive.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: [99n] }, clan_id: 1n, deleted_at: null },
    }));
    expect(prisma.mediaArchive.updateMany).not.toHaveBeenCalled();
    expect(prisma.clanAlbum.updateMany).not.toHaveBeenCalled();
    expect(admin.logAction).not.toHaveBeenCalled();
  });

  it('rejects media update when the target album belongs to another clan', async () => {
    prisma.mediaArchive.findFirst.mockResolvedValue({ album_id: 3n });
    prisma.clanAlbum.findFirst.mockResolvedValue(null);

    await expect(
      controller.updateMedia(req, 'clan-a', '9', { album_id: '80', clanSlug: 'clan-b' }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(admin.resolveMediaActor).toHaveBeenCalledWith('clan-a', 'admin-a');
    expect(prisma.clanAlbum.findFirst).toHaveBeenCalledWith({
      where: { id: 80n, clan_id: 1n },
      select: { id: true },
    });
    expect(prisma.mediaArchive.update).not.toHaveBeenCalled();
    expect(prisma.mediaArchive.updateMany).not.toHaveBeenCalled();
    expect(prisma.clanAlbum.update).not.toHaveBeenCalled();
    expect(prisma.clanAlbum.updateMany).not.toHaveBeenCalled();
  });

  it('filters the library by the year and category sent from the page', async () => {
    prisma.mediaArchive.findMany.mockResolvedValue([]);
    prisma.mediaArchive.count.mockResolvedValue(0);

    await controller.getMediaList(
      req,
      'clan-a',
      '1',
      '30',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      '1980',
      '村寨风貌',
    );

    expect(prisma.mediaArchive.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        clan_id: 1n,
        deleted_at: null,
        taken_year: 1980,
        category: '村寨风貌',
      }),
      orderBy: { created_at: 'desc' },
    }));
  });

  it('skips blank batch fields and stores taken_year as an integer', async () => {
    prisma.mediaArchive.updateMany.mockResolvedValue({ count: 1 });

    prisma.mediaArchive.findMany.mockResolvedValue([]);

    await controller.batchUpdate(req, 'clan-a', {
      ids: ['9'],
      taken_year: '1980',
      taken_on: '',
      taken_location: '',
      latitude: '',
      longitude: '',
      description: '',
      category: '祭祀活动',
    });

    expect(prisma.mediaArchive.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: [9n] }, clan_id: 1n },
      data: { taken_year: 1980, category: '祭祀活动' },
    }));
  });

  it('rejects a batch update that only contains blank fields', async () => {
    await expect(controller.batchUpdate(req, 'clan-a', {
      ids: ['9'],
      taken_year: '',
      taken_location: '  ',
      category: '',
    })).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.mediaArchive.updateMany).not.toHaveBeenCalled();
  });

  it('declares person search before the :id route and keeps link routes distinct', () => {
    const source = readFileSync(join(__dirname, 'admin-media.controller.ts'), 'utf8');
    const searchAt = decoratorIndex(source, "@Get(':clanSlug/persons')");
    const detailAt = decoratorIndex(source, "@Get(':id')");
    expect(searchAt).toBeGreaterThan(-1);
    expect(detailAt).toBeGreaterThan(searchAt);

    expect(routeOf('searchPersons')).toEqual({
      path: ':clanSlug/persons',
      method: RequestMethod.GET,
    });
    expect(routeOf('linkPerson')).toEqual({
      path: ':clanSlug/:id/persons',
      method: RequestMethod.POST,
    });
    expect(routeOf('unlinkPerson')).toEqual({
      path: ':clanSlug/:id/persons/:personId',
      method: RequestMethod.DELETE,
    });
    expect(routeOf('batchUpdate').path).toBe(':clanSlug/batch-update');
    expect(routeOf('setAsCover').path).toBe(':id/set-cover');
    expect(routeOf('linkPerson').path).not.toBe(routeOf('batchUpdate').path);
    expect(routeOf('linkPerson').path).not.toBe(routeOf('setAsCover').path);
  });

  it('returns 404 and does not write a link when the media belongs to another clan', async () => {
    prisma.mediaArchive.findFirst.mockResolvedValue(null);

    await expect(
      controller.linkPerson(req, 'clan-a', '9', { personId: '3' }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(admin.resolveMediaActor).toHaveBeenCalledWith('clan-a', 'admin-a');
    expect(prisma.mediaArchive.findFirst).toHaveBeenCalledWith({
      where: { id: 9n, clan_id: 1n },
      select: { id: true, uploader_id: true },
    });
    expect(prisma.person.findFirst).not.toHaveBeenCalled();
    expect(prisma.mediaPersonLink.create).not.toHaveBeenCalled();
    expect(prisma.mediaPersonLink.createMany).not.toHaveBeenCalled();
    expect(prisma.mediaPersonLink.delete).not.toHaveBeenCalled();
    expect(prisma.mediaPersonLink.deleteMany).not.toHaveBeenCalled();
    expect(admin.logAction).not.toHaveBeenCalled();
  });

  it('returns 404 and does not write a link when the person does not belong to the clan', async () => {
    prisma.mediaArchive.findFirst.mockResolvedValue({ id: 9n });
    prisma.person.findFirst.mockResolvedValue(null);

    await expect(
      controller.linkPerson(req, 'clan-a', '9', { personId: '3' }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.person.findFirst).toHaveBeenCalledWith({
      where: { id: 3n, clan_id: 1n, deleted_at: null },
      select: { id: true },
    });
    expect(prisma.mediaPersonLink.create).not.toHaveBeenCalled();
    expect(prisma.mediaPersonLink.createMany).not.toHaveBeenCalled();
    expect(admin.logAction).not.toHaveBeenCalled();
  });

  it('writes a MediaPersonLink when the media and person belong to the current clan', async () => {
    prisma.mediaArchive.findFirst.mockResolvedValue({ id: 9n });
    prisma.person.findFirst.mockResolvedValue({ id: 3n });
    prisma.mediaPersonLink.createMany.mockResolvedValue({ count: 1 });

    const result = await controller.linkPerson(req, 'clan-a', '9', { personId: '3', clanSlug: 'clan-b' } as any);

    expect(admin.resolveMediaActor).toHaveBeenCalledWith('clan-a', 'admin-a');
    expect(admin.resolveMediaActor).not.toHaveBeenCalledWith('clan-b', expect.anything());
    expect(prisma.mediaArchive.findFirst.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.person.findFirst.mock.invocationCallOrder[0],
    );
    expect(prisma.person.findFirst.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.mediaPersonLink.createMany.mock.invocationCallOrder[0],
    );
    expect(prisma.mediaPersonLink.createMany).toHaveBeenCalledWith({
      data: [{ media_id: 9n, person_id: 3n }],
      skipDuplicates: true,
    });
    expect(prisma.mediaPersonLink.create).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true });
  });

  it('returns 404 and does not delete a link when the media belongs to another clan', async () => {
    prisma.mediaArchive.findFirst.mockResolvedValue(null);

    await expect(controller.unlinkPerson(req, 'clan-a', '9', '3')).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.mediaArchive.findFirst).toHaveBeenCalledWith({
      where: { id: 9n, clan_id: 1n },
      select: { id: true, uploader_id: true },
    });
    expect(prisma.mediaPersonLink.delete).not.toHaveBeenCalled();
    expect(prisma.mediaPersonLink.deleteMany).not.toHaveBeenCalled();
    expect(admin.logAction).not.toHaveBeenCalled();
  });

  it('deletes the person link only after the media is confirmed in the current clan', async () => {
    prisma.mediaArchive.findFirst.mockResolvedValue({ id: 9n });
    prisma.mediaPersonLink.deleteMany.mockResolvedValue({ count: 1 });

    const result = await controller.unlinkPerson(req, 'clan-a', '9', '3');

    expect(prisma.mediaArchive.findFirst.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.mediaPersonLink.deleteMany.mock.invocationCallOrder[0],
    );
    expect(prisma.mediaPersonLink.deleteMany).toHaveBeenCalledWith({
      where: { media_id: 9n, person_id: 3n },
    });
    expect(prisma.mediaPersonLink.delete).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true });
  });

  it('returns location suggestions only for the current clan', async () => {
    prisma.mediaArchive.findMany.mockResolvedValue([
      { taken_location: '福建建阳' },
      { taken_location: '  ' },
      { taken_location: null },
    ]);

    const result = await controller.listLocations(req, 'clan-a', '建');

    expect(admin.resolveMediaActor).toHaveBeenCalledWith('clan-a', 'admin-a');
    expect(prisma.mediaArchive.findMany).toHaveBeenCalledWith({
      where: {
        clan_id: 1n,
        deleted_at: null,
        AND: [
          { taken_location: { not: null } },
          { NOT: { taken_location: '' } },
          { taken_location: { contains: '建' } },
        ],
      },
      distinct: ['taken_location'],
      select: { taken_location: true },
      orderBy: { taken_location: 'asc' },
      take: 20,
    });
    expect(result).toEqual({ data: ['福建建阳'] });
  });

  it('searches only non-deleted persons in the current clan', async () => {
    prisma.person.findMany.mockResolvedValue([{ id: 3n, full_name: '张三' }]);

    const result = await controller.searchPersons(req, 'clan-a', ' 张 ');

    expect(prisma.person.findMany).toHaveBeenCalledWith({
      where: { clan_id: 1n, deleted_at: null, full_name: { contains: '张' } },
      select: { id: true, full_name: true },
      orderBy: { full_name: 'asc' },
      take: 20,
    });
    expect(result).toEqual({ data: [{ id: '3', full_name: '张三' }] });
  });

  it('updates media metadata without clearing person links', async () => {
    prisma.mediaArchive.findFirst.mockResolvedValue({ album_id: null });
    prisma.mediaArchive.updateMany.mockResolvedValue({ count: 1 });

    await controller.updateMedia(req, 'clan-a', '9', { description: '说明', tagged_persons: [] });

    expect(prisma.mediaArchive.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 9n, clan_id: 1n },
      data: { description: '说明' },
    }));
    expect(prisma.mediaPersonLink.create).not.toHaveBeenCalled();
    expect(prisma.mediaPersonLink.createMany).not.toHaveBeenCalled();
    expect(prisma.mediaPersonLink.delete).not.toHaveBeenCalled();
    expect(prisma.mediaPersonLink.deleteMany).not.toHaveBeenCalled();
  });

  it('soft-deletes matching media and lowers album counts without going negative', async () => {
    prisma.mediaArchive.findMany.mockResolvedValue([
      { id: 9n, album_id: 3n, uploader_id: 'admin-a' },
      { id: 10n, album_id: 3n, uploader_id: 'admin-a' },
    ]);
    prisma.mediaArchive.updateMany.mockResolvedValue({ count: 2 });
    prisma.clanAlbum.findFirst.mockResolvedValue({ photo_count: 1 });
    prisma.clanAlbum.updateMany.mockResolvedValue({ count: 1 });

    await controller.batchDelete(req, 'clan-a', { ids: ['9', '10'] });

    expect(prisma.mediaArchive.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ clan_id: 1n, deleted_at: null }),
    }));
    expect(prisma.clanAlbum.updateMany).toHaveBeenCalledWith({
      where: { id: 3n, clan_id: 1n },
      data: { photo_count: 0 },
    });
  });

  it('returns 404 and does not update when the batch album belongs to another clan', async () => {
    prisma.clanAlbum.findFirst.mockResolvedValue(null);

    await expect(controller.batchUpdate(req, 'clan-a', {
      ids: ['9'],
      album_id: '80',
    })).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.clanAlbum.findFirst).toHaveBeenCalledWith({
      where: { id: 80n, clan_id: 1n },
      select: { id: true },
    });
    expect(prisma.mediaArchive.findMany).not.toHaveBeenCalled();
    expect(prisma.mediaArchive.updateMany).not.toHaveBeenCalled();
    expect(prisma.clanAlbum.updateMany).not.toHaveBeenCalled();
  });

  it('filters by review status and sorts by the requested field', async () => {
    prisma.mediaArchive.findMany.mockResolvedValue([]);
    prisma.mediaArchive.count.mockResolvedValue(0);

    await controller.getMediaList(
      req,
      'clan-a',
      '1',
      '30',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'old.jpg',
      undefined,
      undefined,
      'file_size',
      'asc',
      'PENDING',
    );

    expect(prisma.mediaArchive.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        clan_id: 1n,
        deleted_at: null,
        reviews: { some: { status: 'PENDING' } },
        OR: expect.arrayContaining([
          { file_url: { contains: 'old.jpg' } },
          { original_key: { contains: 'old.jpg' } },
          { original_filename: { contains: 'old.jpg' } },
        ]),
      }),
      orderBy: { file_size: 'asc' },
    }));
  });

  it('filters the library by upload dates on created_at inside the current clan', async () => {
    prisma.mediaArchive.findMany.mockResolvedValue([]);
    prisma.mediaArchive.count.mockResolvedValue(0);

    await controller.getMediaList(
      req,
      'clan-a',
      '1',
      '30',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      '2026-01-02',
      '2026-01-03',
    );

    expect(prisma.mediaArchive.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        clan_id: 1n,
        deleted_at: null,
        created_at: {
          gte: new Date(2026, 0, 2, 0, 0, 0, 0),
          lte: new Date(2026, 0, 3, 23, 59, 59, 999),
        },
      }),
    }));
  });

  it('rejects an illegal upload date before querying', async () => {
    await expect(controller.getMediaList(
      req,
      'clan-a',
      '1',
      '30',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      '2026-02-31',
      undefined,
    )).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.mediaArchive.findMany).not.toHaveBeenCalled();
  });

  it('rejects set-cover when the category is not a settlement or ritual scene', async () => {
    prisma.mediaArchive.findFirst.mockResolvedValue({ album_id: 3n, category: 'portrait' });

    await expect(controller.setAsCover(req, '9', 'clan-a')).rejects.toBeInstanceOf(BadRequestException);

    expect(admin.requireAdminBySlug).toHaveBeenCalledWith('clan-a', 'admin-a');
    expect(prisma.mediaArchive.update).not.toHaveBeenCalled();
    expect(prisma.mediaArchive.updateMany).not.toHaveBeenCalled();
    expect(admin.logAction).not.toHaveBeenCalled();
  });

  it('returns 404 when regenerating a thumbnail for media outside the clan', async () => {
    prisma.mediaArchive.findFirst.mockResolvedValue(null);

    await expect(controller.regenerateThumb(req, 'clan-a', '9')).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.mediaArchive.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 9n, clan_id: 1n },
    }));
    expect(prisma.mediaArchive.update).not.toHaveBeenCalled();
    expect(prisma.mediaArchive.updateMany).not.toHaveBeenCalled();
  });

  it('returns 400 and does not change a video when regenerating a thumbnail', async () => {
    prisma.mediaArchive.findFirst.mockResolvedValue({
      id: 9n,
      media_type: 'video',
      file_url: '/media/a.mp4',
    });

    await expect(controller.regenerateThumb(req, 'clan-a', '9')).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.mediaArchive.update).not.toHaveBeenCalled();
    expect(prisma.mediaArchive.updateMany).not.toHaveBeenCalled();
  });

  it('returns 400 and does not update when only latitude is sent', async () => {
    prisma.mediaArchive.findFirst.mockResolvedValue({ album_id: null, uploader_id: 'admin-a', taken_on: null });

    await expect(controller.updateMedia(req, 'clan-a', '9', { latitude: 26.1 })).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.mediaArchive.updateMany).not.toHaveBeenCalled();
    expect(admin.logAction).not.toHaveBeenCalled();
  });

  it('returns 400 and does not update when longitude is out of range', async () => {
    prisma.mediaArchive.findFirst.mockResolvedValue({ album_id: null, uploader_id: 'admin-a', taken_on: null });

    await expect(controller.updateMedia(req, 'clan-a', '9', {
      latitude: 26,
      longitude: 181,
    })).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.mediaArchive.updateMany).not.toHaveBeenCalled();
  });

  it('returns 400 and does not batch-update when latitude is sent alone', async () => {
    await expect(controller.batchUpdate(req, 'clan-a', {
      ids: ['9'],
      latitude: 26,
    })).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.mediaArchive.updateMany).not.toHaveBeenCalled();
  });

  it('writes taken_year from taken_on', async () => {
    prisma.mediaArchive.findFirst.mockResolvedValue({ album_id: null, uploader_id: 'admin-a', taken_on: null });
    prisma.mediaArchive.updateMany.mockResolvedValue({ count: 1 });

    await controller.updateMedia(req, 'clan-a', '9', { taken_on: '1982-03-04' });

    expect(prisma.mediaArchive.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 9n, clan_id: 1n },
      data: { taken_on: new Date(Date.UTC(1982, 2, 4)), taken_year: 1982 },
    }));
  });

  it('shifts an existing taken_on when only the year changes', async () => {
    prisma.mediaArchive.findFirst.mockResolvedValue({
      album_id: null,
      uploader_id: 'admin-a',
      taken_on: new Date(Date.UTC(1979, 4, 1)),
    });
    prisma.mediaArchive.updateMany.mockResolvedValue({ count: 1 });

    await controller.updateMedia(req, 'clan-a', '9', { taken_year: 1980 });

    expect(prisma.mediaArchive.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: {
        taken_year: 1980,
        taken_on: new Date(Date.UTC(1980, 4, 1)),
      },
    }));
  });

  it('keeps the existing taken_on when the year does not change', async () => {
    prisma.mediaArchive.findFirst.mockResolvedValue({
      album_id: null,
      uploader_id: 'admin-a',
      taken_on: new Date(Date.UTC(1980, 4, 1)),
    });
    prisma.mediaArchive.updateMany.mockResolvedValue({ count: 1 });

    await controller.updateMedia(req, 'clan-a', '9', { taken_year: 1980 });

    expect(prisma.mediaArchive.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { taken_year: 1980 },
    }));
  });
});
