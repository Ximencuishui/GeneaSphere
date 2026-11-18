import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FamilyBookService } from './family-book.service';
import { publicMediaWhere } from '../media/media-visibility';

function ownedProject(overrides: Record<string, unknown> = {}) {
  return {
    id: 1n,
    user_id: 'user-1',
    clan_id: 3n,
    status: 'preview',
    print_order: null,
    ...overrides,
  };
}

function personPage(overrides: Record<string, unknown> = {}) {
  return {
    id: 11n,
    project_id: 1n,
    page_type: 'person',
    title: '朱小小',
    subtitle: '长房',
    body: '正文不要改',
    content: {
      name: '朱小小',
      photo_url: '/media/old.jpg',
      bio: '简介保留',
    },
    ...overrides,
  };
}

describe('FamilyBookService.replacePagePhoto', () => {
  const prisma = {
    familyBookProject: {
      findFirst: jest.fn(),
    },
    familyBookPage: {
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    mediaArchive: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
  };
  const service = new FamilyBookService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.familyBookPage.update.mockResolvedValue({});
    prisma.familyBookPage.updateMany.mockResolvedValue({ count: 0 });
  });

  it('别人的项目返回 404，并且不写页面', async () => {
    prisma.familyBookProject.findFirst.mockResolvedValue(null);

    await expect(service.replacePagePhoto('1', 'user-2', '11', '9')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(prisma.familyBookProject.findFirst).toHaveBeenCalledWith({
      where: { id: 1n, user_id: 'user-2' },
      include: { print_order: { select: { id: true } } },
    });
    expect(prisma.familyBookPage.findFirst).not.toHaveBeenCalled();
    expect(prisma.familyBookPage.update).not.toHaveBeenCalled();
    expect(prisma.familyBookPage.updateMany).not.toHaveBeenCalled();
    expect(prisma.mediaArchive.findFirst).not.toHaveBeenCalled();
  });

  it('页面不属于该项目时返回 404，并且不写', async () => {
    prisma.familyBookProject.findFirst.mockResolvedValue(ownedProject());
    prisma.familyBookPage.findFirst.mockResolvedValue(null);

    await expect(service.replacePagePhoto('1', 'user-1', '11', '9')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(prisma.familyBookPage.findFirst).toHaveBeenCalledWith({
      where: { id: 11n, project_id: 1n },
    });
    expect(prisma.familyBookPage.update).not.toHaveBeenCalled();
    expect(prisma.familyBookPage.updateMany).not.toHaveBeenCalled();
    expect(prisma.mediaArchive.findFirst).not.toHaveBeenCalled();
  });

  it('已有印刷订单时返回 400，并且不写', async () => {
    prisma.familyBookProject.findFirst.mockResolvedValue(
      ownedProject({ status: 'preview', print_order: { id: 8n } }),
    );
    prisma.familyBookPage.findFirst.mockResolvedValue(personPage());

    await expect(service.replacePagePhoto('1', 'user-1', '11', '9')).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(prisma.familyBookPage.update).not.toHaveBeenCalled();
    expect(prisma.familyBookPage.updateMany).not.toHaveBeenCalled();
    expect(prisma.mediaArchive.findFirst).not.toHaveBeenCalled();
  });

  it('状态已下单时返回 400，并且不写', async () => {
    prisma.familyBookProject.findFirst.mockResolvedValue(
      ownedProject({ status: 'ordered', print_order: null }),
    );
    prisma.familyBookPage.findFirst.mockResolvedValue(personPage());

    await expect(service.replacePagePhoto('1', 'user-1', '11', '9')).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(prisma.familyBookPage.update).not.toHaveBeenCalled();
    expect(prisma.familyBookPage.updateMany).not.toHaveBeenCalled();
  });

  it('影像不属于该族或不可见时返回 404，并且不写', async () => {
    prisma.familyBookProject.findFirst.mockResolvedValue(ownedProject());
    prisma.familyBookPage.findFirst.mockResolvedValue(personPage());
    prisma.mediaArchive.findFirst.mockResolvedValue(null);

    await expect(service.replacePagePhoto('1', 'user-1', '11', '9')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(prisma.mediaArchive.findFirst).toHaveBeenCalledWith({
      where: {
        id: 9n,
        ...publicMediaWhere(3n),
        media_type: 'image',
      },
      select: { id: true, file_url: true, display_url: true },
    });
    expect(prisma.familyBookPage.update).not.toHaveBeenCalled();
    expect(prisma.familyBookPage.updateMany).not.toHaveBeenCalled();
  });

  it('本人项目替换成功时只更新该页 content.photo_url', async () => {
    prisma.familyBookProject.findFirst.mockResolvedValue(ownedProject());
    prisma.familyBookPage.findFirst.mockResolvedValue(personPage());
    prisma.mediaArchive.findFirst.mockResolvedValue({
      id: 9n,
      file_url: '/media/file.jpg',
      display_url: '/media/display.jpg',
    });

    const result = await service.replacePagePhoto('1', 'user-1', '11', '9');

    expect(result).toEqual({ message: '照片已替换', photo_url: '/media/display.jpg' });
    expect(prisma.familyBookPage.update).toHaveBeenCalledTimes(1);
    expect(prisma.familyBookPage.update).toHaveBeenCalledWith({
      where: { id: 11n },
      data: {
        content: {
          name: '朱小小',
          photo_url: '/media/display.jpg',
          bio: '简介保留',
        },
      },
    });
    const payload = prisma.familyBookPage.update.mock.calls[0][0];
    expect(payload.data.body).toBeUndefined();
    expect(payload.data.title).toBeUndefined();
    expect(payload.data.subtitle).toBeUndefined();
    expect(prisma.familyBookPage.updateMany).not.toHaveBeenCalled();
  });
});
