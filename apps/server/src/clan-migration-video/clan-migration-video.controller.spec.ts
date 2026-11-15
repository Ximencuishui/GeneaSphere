// HTTP 403 待测试库后补（本测试只覆盖 controller 单元，不发真实 HTTP）。
import { ForbiddenException } from '@nestjs/common';
import { ClanMigrationVideoController } from './clan-migration-video.controller';

jest.mock('./clan-migration-video.service', () => ({
  ClanMigrationVideoService: class ClanMigrationVideoService {},
}));

jest.mock('../admin/admin.service', () => ({
  AdminService: class AdminService {},
}));

describe('ClanMigrationVideoController 家族管理员门禁', () => {
  const service = {
    create: jest.fn(),
    delete: jest.fn(),
  };
  const resolver = { resolveOrThrow: jest.fn() };
  const admin = { requireAdminBySlug: jest.fn() };
  const controller = new ClanMigrationVideoController(service as never, resolver as never, admin as never);
  const member = { user: { userId: 'member' } };
  const dto = { title: '全族迁徙历史' };

  beforeEach(() => {
    jest.clearAllMocks();
    admin.requireAdminBySlug.mockRejectedValue(new ForbiddenException('Admin access required'));
  });

  it('非管理员创建迁徙视频被拒且不调用 service', async () => {
    await expect(controller.create(member, 'zhu', dto as never)).rejects.toBeInstanceOf(ForbiddenException);

    expect(admin.requireAdminBySlug).toHaveBeenCalledWith('zhu', 'member');
    expect(service.create).not.toHaveBeenCalled();
  });

  it('非管理员删除迁徙视频被拒且不调用 service', async () => {
    await expect(controller.delete(member, 'zhu', '11')).rejects.toBeInstanceOf(ForbiddenException);

    expect(admin.requireAdminBySlug).toHaveBeenCalledWith('zhu', 'member');
    expect(service.delete).not.toHaveBeenCalled();
  });
});
