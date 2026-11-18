import { readFileSync } from 'fs';
import { join } from 'path';
import { BadRequestException, NotFoundException, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { AdminFamilyAlbumController } from './admin-family-album.controller';

function routeOf(methodName: string) {
  const handler = (AdminFamilyAlbumController.prototype as any)[methodName];
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

describe('AdminFamilyAlbumController clan isolation', () => {
  const admin = { requireAdminBySlug: jest.fn(), logAction: jest.fn() };
  const prisma = {
    familyBookProject: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    familyBookPage: {
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
      delete: jest.fn(),
    },
    printOrder: {
      count: jest.fn(),
    },
  };
  const controller = new AdminFamilyAlbumController(admin as never, prisma as never);
  const req = { user: { userId: 'admin-a' } };

  beforeEach(() => {
    jest.clearAllMocks();
    admin.requireAdminBySlug.mockResolvedValue(1n);
    admin.logAction.mockResolvedValue(undefined);
  });

  it('rejects cross-clan family album delete with 404 and does not delete pages or project', async () => {
    prisma.familyBookProject.findFirst.mockResolvedValue(null);

    await expect(controller.deleteFamilyAlbum(req, '7', 'clan-a')).rejects.toBeInstanceOf(NotFoundException);

    expect(admin.requireAdminBySlug).toHaveBeenCalledWith('clan-a', 'admin-a');
    expect(prisma.familyBookProject.findFirst).toHaveBeenCalledWith({
      where: { id: 7n, clan_id: 1n },
    });
    expect(prisma.familyBookPage.deleteMany).not.toHaveBeenCalled();
    expect(prisma.familyBookPage.delete).not.toHaveBeenCalled();
    expect(prisma.familyBookProject.delete).not.toHaveBeenCalled();
    expect(prisma.familyBookProject.deleteMany).not.toHaveBeenCalled();
    expect(prisma.familyBookProject.update).not.toHaveBeenCalled();
    expect(prisma.printOrder.count).not.toHaveBeenCalled();
    expect(admin.logAction).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when the project has a print order and does not delete pages or the project', async () => {
    prisma.familyBookProject.findFirst.mockResolvedValue({ id: 7n, title: '家谱册', clan_id: 1n });
    prisma.printOrder.count.mockResolvedValue(1);

    const error = await controller.deleteFamilyAlbum(req, '7', 'clan-a').catch((e) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.message).toBe('该项目已下单，无法删除');
    expect(prisma.familyBookProject.findFirst.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.printOrder.count.mock.invocationCallOrder[0],
    );
    expect(prisma.printOrder.count).toHaveBeenCalledWith({
      where: { family_book_project_id: 7n },
    });
    expect(prisma.familyBookPage.deleteMany).not.toHaveBeenCalled();
    expect(prisma.familyBookPage.delete).not.toHaveBeenCalled();
    expect(prisma.familyBookProject.delete).not.toHaveBeenCalled();
    expect(prisma.familyBookProject.deleteMany).not.toHaveBeenCalled();
    expect(admin.logAction).not.toHaveBeenCalled();
  });

  it('deletes pages and the project only when it belongs to the clan and has no print order', async () => {
    prisma.familyBookProject.findFirst.mockResolvedValue({ id: 7n, title: '家谱册', clan_id: 1n });
    prisma.printOrder.count.mockResolvedValue(0);
    prisma.familyBookPage.deleteMany.mockResolvedValue({ count: 2 });
    prisma.familyBookProject.deleteMany.mockResolvedValue({ count: 1 });

    const result = await controller.deleteFamilyAlbum(req, '7', 'clan-a');

    expect(result).toEqual({ success: true });
    expect(prisma.familyBookProject.findFirst.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.printOrder.count.mock.invocationCallOrder[0],
    );
    expect(prisma.printOrder.count.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.familyBookPage.deleteMany.mock.invocationCallOrder[0],
    );
    expect(prisma.familyBookPage.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.familyBookProject.deleteMany.mock.invocationCallOrder[0],
    );
    expect(prisma.printOrder.count).toHaveBeenCalledWith({
      where: { family_book_project_id: 7n },
    });
    expect(prisma.familyBookPage.deleteMany).toHaveBeenCalledWith({
      where: { project_id: 7n },
    });
    expect(prisma.familyBookProject.deleteMany).toHaveBeenCalledWith({
      where: { id: 7n, clan_id: 1n },
    });
    expect(admin.logAction).toHaveBeenCalledWith(expect.objectContaining({
      action: 'DELETE_FAMILY_ALBUM',
      targetId: '7',
    }));
  });

  it('declares the page update route before the project update route', () => {
    const source = readFileSync(join(__dirname, 'admin-family-album.controller.ts'), 'utf8');
    const pageAt = decoratorIndex(source, "@Put(':clanSlug/:id/pages/:pageId')");
    const projectAt = decoratorIndex(source, "@Put(':clanSlug/:id')");
    expect(pageAt).toBeGreaterThan(-1);
    expect(projectAt).toBeGreaterThan(pageAt);
    expect(routeOf('updateFamilyAlbumPage')).toEqual({
      path: ':clanSlug/:id/pages/:pageId',
      method: RequestMethod.PUT,
    });
    expect(routeOf('updateFamilyAlbum').path).toBe(':clanSlug/:id');
  });

  it('returns 404 and does not update a page when the family album belongs to another clan', async () => {
    prisma.familyBookProject.findFirst.mockResolvedValue(null);

    await expect(
      controller.updateFamilyAlbumPage(req, 'clan-a', '7', '11', { body: '篡改', content: { hacked: true } }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(admin.requireAdminBySlug).toHaveBeenCalledWith('clan-a', 'admin-a');
    expect(prisma.familyBookProject.findFirst).toHaveBeenCalledWith({
      where: { id: 7n, clan_id: 1n },
      select: { id: true },
    });
    expect(prisma.familyBookPage.findFirst).not.toHaveBeenCalled();
    expect(prisma.familyBookPage.update).not.toHaveBeenCalled();
    expect(prisma.familyBookPage.updateMany).not.toHaveBeenCalled();
    expect(prisma.printOrder.count).not.toHaveBeenCalled();
    expect(admin.logAction).not.toHaveBeenCalled();
  });

  it('returns 404 and does not update a page that does not belong to the project', async () => {
    prisma.familyBookProject.findFirst.mockResolvedValue({ id: 7n });
    prisma.familyBookPage.findFirst.mockResolvedValue(null);

    await expect(
      controller.updateFamilyAlbumPage(req, 'clan-a', '7', '11', { title: '篡改', body: '篡改' }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.familyBookPage.findFirst).toHaveBeenCalledWith({
      where: { id: 11n, project_id: 7n },
      select: { id: true },
    });
    expect(prisma.familyBookPage.update).not.toHaveBeenCalled();
    expect(prisma.familyBookPage.updateMany).not.toHaveBeenCalled();
    expect(admin.logAction).not.toHaveBeenCalled();
  });

  it('updates page title, subtitle and body for the current clan without writing content or checking print orders', async () => {
    prisma.familyBookProject.findFirst.mockResolvedValue({ id: 7n });
    prisma.familyBookPage.findFirst.mockResolvedValue({ id: 11n });
    prisma.familyBookPage.updateMany.mockResolvedValue({ count: 1 });

    const result = await controller.updateFamilyAlbumPage(req, 'clan-a', '7', '11', {
      title: '新标题',
      subtitle: '新副标题',
      body: '新正文',
      content: { hacked: true },
      status: 'ordered',
    });

    expect(prisma.familyBookProject.findFirst.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.familyBookPage.findFirst.mock.invocationCallOrder[0],
    );
    expect(prisma.familyBookPage.findFirst.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.familyBookPage.updateMany.mock.invocationCallOrder[0],
    );
    expect(prisma.familyBookPage.update).not.toHaveBeenCalled();
    expect(prisma.familyBookPage.updateMany).toHaveBeenCalledWith({
      where: { id: 11n, project_id: 7n },
      data: { title: '新标题', subtitle: '新副标题', body: '新正文' },
    });
    expect(prisma.printOrder.count).not.toHaveBeenCalled();
    expect(result.id).toBe('11');
  });

  it('does not update page content when the payload has no title, subtitle, or body', async () => {
    prisma.familyBookProject.findFirst.mockResolvedValue({ id: 7n });
    prisma.familyBookPage.findFirst.mockResolvedValue({ id: 11n });

    const result = await controller.updateFamilyAlbumPage(req, 'clan-a', '7', '11', {
      content: { hacked: true },
    });

    expect(prisma.familyBookPage.update).not.toHaveBeenCalled();
    expect(prisma.familyBookPage.updateMany).not.toHaveBeenCalled();
    expect(admin.logAction).not.toHaveBeenCalled();
    expect(result.id).toBe('11');
  });

  it('includes page subtitle and body in the album detail', async () => {
    prisma.familyBookProject.findFirst.mockResolvedValue({
      id: 7n,
      title: '家谱册',
      preface: '序',
      status: 'ordered',
      cover_template: 'red',
      generations: 2,
      include_spouse: false,
      grouping: 'family',
      selected_fields: ['name'],
      page_count: 1,
      person_count: 1,
      estimated_price: 1,
      created_at: new Date('2026-01-01T00:00:00Z'),
      updated_at: new Date('2026-01-02T00:00:00Z'),
      user: { nickname: '管理员', phone: '13800000000' },
      start_person: null,
      pages: [
        {
          id: 11n,
          page_number: 1,
          page_type: 'person',
          title: '张三',
          subtitle: '第十六世',
          body: '正文内容',
          content: { person_id: '3' },
        },
      ],
    });

    const result = await controller.getFamilyAlbumDetail(req, '7', 'clan-a');

    expect(result.pages).toEqual([
      {
        id: '11',
        page_number: 1,
        page_type: 'person',
        title: '张三',
        subtitle: '第十六世',
        body: '正文内容',
        content: { person_id: '3' },
      },
    ]);
  });
});
