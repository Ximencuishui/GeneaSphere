import { ForbiddenException } from '@nestjs/common';
import { MigrationService } from './migration.service';

describe('MigrationService 家族管理员门禁', () => {
  const prisma = {
    migrationEvent: {
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };
  const adminService = {
    requireAdmin: jest.fn(),
  };
  const service = new MigrationService(prisma as never, adminService as never);
  const dto = {
    from_location: '山西洪洞',
    to_location: '四川成都',
    event_year: 1368,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    adminService.requireAdmin.mockRejectedValue(new ForbiddenException('Admin access required'));
  });

  it('非管理员创建被拒', async () => {
    await expect(service.createEvent(7n, 'member', dto)).rejects.toBeInstanceOf(ForbiddenException);

    expect(adminService.requireAdmin).toHaveBeenCalledWith(7n, 'member');
    expect(prisma.migrationEvent.create).not.toHaveBeenCalled();
  });

  it('非管理员更新被拒', async () => {
    await expect(service.updateEvent(7n, 'member', '11', dto)).rejects.toBeInstanceOf(ForbiddenException);

    expect(adminService.requireAdmin).toHaveBeenCalledWith(7n, 'member');
    expect(prisma.migrationEvent.update).not.toHaveBeenCalled();
  });

  it('非管理员删除被拒', async () => {
    await expect(service.deleteEvent(7n, 'member', '11')).rejects.toBeInstanceOf(ForbiddenException);

    expect(adminService.requireAdmin).toHaveBeenCalledWith(7n, 'member');
    expect(prisma.migrationEvent.delete).not.toHaveBeenCalled();
  });
});
