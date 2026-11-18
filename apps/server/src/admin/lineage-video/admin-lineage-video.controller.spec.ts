import { NotFoundException } from '@nestjs/common';
import { AdminLineageVideoController } from './admin-lineage-video.controller';

describe('AdminLineageVideoController clan isolation', () => {
  const admin = { requireAdminBySlug: jest.fn(), logAction: jest.fn() };
  const prisma = {
    lineageVideoProject: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    lineageVideoMaterialLink: {
      deleteMany: jest.fn(),
      delete: jest.fn(),
    },
  };
  const controller = new AdminLineageVideoController(admin as never, prisma as never);
  const req = { user: { userId: 'admin-a' } };

  beforeEach(() => {
    jest.clearAllMocks();
    admin.requireAdminBySlug.mockResolvedValue(1n);
    admin.logAction.mockResolvedValue(undefined);
  });

  it('跨族删除返回 404 且不调用删除', async () => {
    prisma.lineageVideoProject.findFirst.mockResolvedValue(null);

    await expect(controller.deleteLineageVideo(req, 'clan-a', '7')).rejects.toBeInstanceOf(NotFoundException);

    expect(admin.requireAdminBySlug).toHaveBeenCalledWith('clan-a', 'admin-a');
    expect(prisma.lineageVideoProject.findFirst).toHaveBeenCalledWith({
      where: { id: 7n, center_person: { clan_id: 1n } },
    });
    expect(prisma.lineageVideoMaterialLink.deleteMany).not.toHaveBeenCalled();
    expect(prisma.lineageVideoMaterialLink.delete).not.toHaveBeenCalled();
    expect(prisma.lineageVideoProject.delete).not.toHaveBeenCalled();
    expect(prisma.lineageVideoProject.deleteMany).not.toHaveBeenCalled();
    expect(prisma.lineageVideoProject.update).not.toHaveBeenCalled();
    expect(prisma.lineageVideoProject.updateMany).not.toHaveBeenCalled();
    expect(admin.logAction).not.toHaveBeenCalled();
  });

  it('本族删除会删除本族项目及其素材关联', async () => {
    prisma.lineageVideoProject.findFirst.mockResolvedValue({ id: 7n });
    prisma.lineageVideoMaterialLink.deleteMany.mockResolvedValue({ count: 2 });
    prisma.lineageVideoProject.delete.mockResolvedValue({ id: 7n });

    const result = await controller.deleteLineageVideo(req, 'clan-a', '7');

    expect(result).toEqual({ success: true });
    expect(prisma.lineageVideoProject.findFirst).toHaveBeenCalledWith({
      where: { id: 7n, center_person: { clan_id: 1n } },
    });
    expect(prisma.lineageVideoProject.findFirst.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.lineageVideoMaterialLink.deleteMany.mock.invocationCallOrder[0],
    );
    expect(prisma.lineageVideoMaterialLink.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.lineageVideoProject.delete.mock.invocationCallOrder[0],
    );
    expect(prisma.lineageVideoMaterialLink.deleteMany).toHaveBeenCalledWith({
      where: { lineage_project_id: 7n },
    });
    expect(prisma.lineageVideoProject.delete).toHaveBeenCalledWith({
      where: { id: 7n },
    });
    expect(prisma.lineageVideoProject.deleteMany).not.toHaveBeenCalled();
    expect(admin.logAction).toHaveBeenCalledWith(expect.objectContaining({
      action: 'DELETE_LINEAGE_VIDEO',
      targetId: '7',
      clanId: 1n,
    }));
  });

  it('列表查询 where 含 clan_id', async () => {
    prisma.lineageVideoProject.findMany.mockResolvedValue([]);
    prisma.lineageVideoProject.count.mockResolvedValue(0);

    const result = await controller.listLineageVideos(req, 'clan-a');

    expect(admin.requireAdminBySlug).toHaveBeenCalledWith('clan-a', 'admin-a');
    expect(prisma.lineageVideoProject.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { center_person: { clan_id: 1n } },
    }));
    expect(prisma.lineageVideoProject.count).toHaveBeenCalledWith({
      where: { center_person: { clan_id: 1n } },
    });
    const listWhere = prisma.lineageVideoProject.findMany.mock.calls[0][0].where;
    expect(listWhere.center_person.clan_id).toBe(1n);
    expect(result).toEqual({ data: [], total: 0, page: 1, pageSize: 20 });
  });
});
