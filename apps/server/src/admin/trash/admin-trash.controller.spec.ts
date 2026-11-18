import { NotFoundException } from '@nestjs/common';
import { AdminTrashController } from './admin-trash.controller';

describe('AdminTrashController restore media', () => {
  const admin = { requireAdminBySlug: jest.fn(), logAction: jest.fn() };
  const prisma = {
    mediaArchive: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    clanAlbum: {
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    mediaPersonLink: {
      deleteMany: jest.fn(),
    },
    mediaReview: {
      deleteMany: jest.fn(),
    },
    person: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    personAncestry: { deleteMany: jest.fn() },
    familyChild: { deleteMany: jest.fn() },
    familyUnit: { updateMany: jest.fn() },
    bookAnnotation: {
      findMany: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma));
  const controller = new AdminTrashController(admin as never, prisma as never);
  const req = { user: { userId: 'admin-a' } };

  beforeEach(() => {
    jest.clearAllMocks();
    admin.requireAdminBySlug.mockResolvedValue(1n);
    admin.logAction.mockResolvedValue(undefined);
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma));
  });

  it('increments album photo_count when restoring media that has an album', async () => {
    prisma.mediaArchive.findFirst.mockResolvedValue({
      id: 9n,
      clan_id: 1n,
      album_id: 4n,
      deleted_at: new Date('2026-01-01T00:00:00.000Z'),
      file_url: '/media/a.jpg',
    });
    prisma.mediaArchive.updateMany.mockResolvedValue({ count: 1 });
    prisma.clanAlbum.updateMany.mockResolvedValue({ count: 1 });

    const result = await controller.restoreMedia(req, '9', 'clan-a');

    expect(admin.requireAdminBySlug).toHaveBeenCalledWith('clan-a', 'admin-a');
    expect(prisma.mediaArchive.findFirst).toHaveBeenCalledWith({
      where: { id: 9n, clan_id: 1n, deleted_at: { not: null } },
    });
    expect(prisma.mediaArchive.updateMany).toHaveBeenCalledWith({
      where: { id: 9n, clan_id: 1n, deleted_at: { not: null } },
      data: { deleted_at: null, deleted_by: null },
    });
    expect(prisma.clanAlbum.updateMany).toHaveBeenCalledWith({
      where: { id: 4n, clan_id: 1n },
      data: { photo_count: { increment: 1 } },
    });
    expect(prisma.clanAlbum.update).not.toHaveBeenCalled();
    expect(prisma.mediaArchive.findFirst.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.clanAlbum.updateMany.mock.invocationCallOrder[0],
    );
    expect(result.id).toBe('9');
  });

  it('does not increment photo_count when restored media has no album', async () => {
    prisma.mediaArchive.findFirst.mockResolvedValue({
      id: 9n,
      clan_id: 1n,
      album_id: null,
      deleted_at: new Date('2026-01-01T00:00:00.000Z'),
      file_url: '/media/a.jpg',
    });
    prisma.mediaArchive.updateMany.mockResolvedValue({ count: 1 });

    await controller.restoreMedia(req, '9', 'clan-a');

    expect(prisma.mediaArchive.updateMany).toHaveBeenCalled();
    expect(prisma.clanAlbum.updateMany).not.toHaveBeenCalled();
    expect(prisma.clanAlbum.update).not.toHaveBeenCalled();
  });

  it('returns 404 and does not increment when media is not in the current clan trash', async () => {
    prisma.mediaArchive.findFirst.mockResolvedValue(null);

    await expect(controller.restoreMedia(req, '9', 'clan-a')).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.mediaArchive.findFirst).toHaveBeenCalledWith({
      where: { id: 9n, clan_id: 1n, deleted_at: { not: null } },
    });
    expect(prisma.mediaArchive.update).not.toHaveBeenCalled();
    expect(prisma.mediaArchive.updateMany).not.toHaveBeenCalled();
    expect(prisma.clanAlbum.update).not.toHaveBeenCalled();
    expect(prisma.clanAlbum.updateMany).not.toHaveBeenCalled();
    expect(admin.logAction).not.toHaveBeenCalled();
  });

  it('does not decrement photo_count on permanent delete', async () => {
    prisma.mediaArchive.findFirst.mockResolvedValue({
      id: 9n,
      clan_id: 1n,
      album_id: 4n,
      file_url: '/media/a.jpg',
      person_links: [],
      reviews: [],
    });
    prisma.mediaPersonLink.deleteMany.mockResolvedValue({ count: 0 });
    prisma.mediaReview.deleteMany.mockResolvedValue({ count: 0 });
    prisma.mediaArchive.delete.mockResolvedValue({ id: 9n });

    await controller.permanentDeleteMedia(req, '9', 'clan-a');

    expect(prisma.mediaArchive.findFirst).toHaveBeenCalledWith({
      where: { id: 9n, clan_id: 1n },
      include: { person_links: true, reviews: true },
    });
    expect(prisma.mediaArchive.delete).toHaveBeenCalledWith({ where: { id: 9n } });
    expect(prisma.clanAlbum.update).not.toHaveBeenCalled();
    expect(prisma.clanAlbum.updateMany).not.toHaveBeenCalled();
  });

  it('returns 404 and does not delete when the media belongs to another clan', async () => {
    prisma.mediaArchive.findFirst.mockResolvedValue(null);

    await expect(controller.permanentDeleteMedia(req, '9', 'clan-a')).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.mediaArchive.delete).not.toHaveBeenCalled();
    expect(prisma.mediaPersonLink.deleteMany).not.toHaveBeenCalled();
    expect(prisma.mediaReview.deleteMany).not.toHaveBeenCalled();
  });

  it('returns 404 when restoring a member from another clan', async () => {
    prisma.person.findFirst.mockResolvedValue(null);

    await expect(controller.restoreMember(req, '4', 'clan-a')).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.person.findFirst).toHaveBeenCalledWith({
      where: { id: 4n, clan_id: 1n, deleted_at: { not: null } },
    });
    expect(prisma.person.updateMany).not.toHaveBeenCalled();
    expect(admin.logAction).not.toHaveBeenCalled();
  });

  it('permanently deletes a member after detaching only that person relations', async () => {
    prisma.person.findFirst.mockResolvedValue({
      id: 4n,
      clan_id: 1n,
      full_name: '甲',
      deleted_at: new Date('2026-01-01T00:00:00.000Z'),
    });
    prisma.personAncestry.deleteMany.mockResolvedValue({ count: 2 });
    prisma.familyChild.deleteMany.mockResolvedValue({ count: 1 });
    prisma.familyUnit.updateMany.mockResolvedValue({ count: 1 });
    prisma.person.delete.mockResolvedValue({ id: 4n });

    await controller.permanentDeleteMember(req, '4', 'clan-a');

    expect(prisma.personAncestry.deleteMany).toHaveBeenCalledWith({
      where: { OR: [{ ancestor_id: 4n }, { descendant_id: 4n }] },
    });
    expect(prisma.familyChild.deleteMany).toHaveBeenCalledWith({ where: { child_id: 4n } });
    expect(prisma.familyUnit.updateMany).toHaveBeenCalledWith({
      where: { clan_id: 1n, husband_id: 4n },
      data: { husband_id: null },
    });
    expect(prisma.person.delete).toHaveBeenCalledWith({ where: { id: 4n } });
    expect(admin.logAction).toHaveBeenCalledWith(expect.objectContaining({
      action: 'PERMANENT_DELETE_MEMBER',
      clanId: 1n,
    }));
  });

  it('restores a deleted book annotation in this clan and records the client ip', async () => {
    prisma.bookAnnotation.updateMany.mockResolvedValue({ count: 1 });
    const withIp = { user: { userId: 'admin-a' }, headers: { 'x-forwarded-for': '203.0.113.8' } };

    await controller.restoreAnnotation(withIp, '7', 'clan-a');

    expect(prisma.bookAnnotation.updateMany).toHaveBeenCalledWith({
      where: { id: 7n, deleted_at: { not: null }, volume: { clan_id: 1n } },
      data: { deleted_at: null, deleted_by: null },
    });
    expect(admin.logAction).toHaveBeenCalledWith(expect.objectContaining({
      action: 'RESTORE_ANNOTATION',
      ipAddress: '203.0.113.8',
    }));
  });

  it('returns 404 when the annotation is not in this clan trash', async () => {
    prisma.bookAnnotation.updateMany.mockResolvedValue({ count: 0 });

    await expect(controller.restoreAnnotation(req, '7', 'clan-a')).rejects.toBeInstanceOf(NotFoundException);

    expect(admin.logAction).not.toHaveBeenCalled();
  });

  it('permanently deletes only an annotation that is already in the trash', async () => {
    prisma.bookAnnotation.deleteMany.mockResolvedValue({ count: 1 });
    const withIp = { user: { userId: 'admin-a' }, headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' } };

    await controller.permanentDeleteAnnotation(withIp, '7', 'clan-a');

    expect(prisma.bookAnnotation.deleteMany).toHaveBeenCalledWith({
      where: { id: 7n, deleted_at: { not: null }, volume: { clan_id: 1n } },
    });
    expect(admin.logAction).toHaveBeenCalledWith(expect.objectContaining({
      action: 'PERMANENT_DELETE_ANNOTATION',
      ipAddress: '203.0.113.9',
    }));
  });

  it('returns 404 and does not log when the annotation is not already deleted', async () => {
    prisma.bookAnnotation.deleteMany.mockResolvedValue({ count: 0 });

    await expect(controller.permanentDeleteAnnotation(req, '7', 'clan-a')).rejects.toBeInstanceOf(NotFoundException);

    expect(admin.logAction).not.toHaveBeenCalled();
  });
});
