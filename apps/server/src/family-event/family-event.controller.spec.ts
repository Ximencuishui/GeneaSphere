import { ForbiddenException } from '@nestjs/common';
import { FamilyEventController } from './family-event.controller';

jest.mock('./family-event.service', () => ({
  FamilyEventService: class FamilyEventService {},
}));

jest.mock('../admin/admin.service', () => ({
  AdminService: class AdminService {},
}));

describe('FamilyEventController 家族管理员门禁', () => {
  const service = {
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    bulkCreate: jest.fn(),
    generateLifeEvents: jest.fn(),
  };
  const resolver = { resolveOrThrow: jest.fn() };
  const admin = { requireAdminBySlug: jest.fn() };
  const controller = new FamilyEventController(service as never, resolver as never, admin as never);
  const member = { user: { userId: 'member' } };
  const dto = { event_name: '祭祖', event_type: 'ancestor_worship', event_date: '1130-09-15' };

  beforeEach(() => {
    jest.clearAllMocks();
    admin.requireAdminBySlug.mockRejectedValue(new ForbiddenException('Admin access required'));
  });

  it('非管理员创建被拒且不调用 service', async () => {
    await expect(controller.create(member, 'zhu', dto as never)).rejects.toBeInstanceOf(ForbiddenException);

    expect(admin.requireAdminBySlug).toHaveBeenCalledWith('zhu', 'member');
    expect(service.create).not.toHaveBeenCalled();
  });

  it('非管理员修改被拒且不调用 service', async () => {
    await expect(controller.update(member, 'zhu', '11', dto as never)).rejects.toBeInstanceOf(ForbiddenException);

    expect(admin.requireAdminBySlug).toHaveBeenCalledWith('zhu', 'member');
    expect(service.update).not.toHaveBeenCalled();
  });

  it('非管理员删除被拒且不调用 service', async () => {
    await expect(controller.delete(member, 'zhu', '11')).rejects.toBeInstanceOf(ForbiddenException);

    expect(admin.requireAdminBySlug).toHaveBeenCalledWith('zhu', 'member');
    expect(service.delete).not.toHaveBeenCalled();
  });

  it('非管理员批量导入被拒且不调用 service', async () => {
    await expect(controller.bulkCreate(member, 'zhu', { events: [dto as never] })).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    expect(admin.requireAdminBySlug).toHaveBeenCalledWith('zhu', 'member');
    expect(service.bulkCreate).not.toHaveBeenCalled();
  });

  it('非管理员自动生成被拒且不调用 service', async () => {
    await expect(controller.generateLifeEvents(member, 'zhu')).rejects.toBeInstanceOf(ForbiddenException);

    expect(admin.requireAdminBySlug).toHaveBeenCalledWith('zhu', 'member');
    expect(service.generateLifeEvents).not.toHaveBeenCalled();
  });
});
