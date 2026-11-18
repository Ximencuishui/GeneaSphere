import { BadRequestException, ForbiddenException } from '@nestjs/common';
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

  it('非管理员导入 CSV 被拒且不调用 service', async () => {
    await expect(
      controller.importCsv(member, 'zhu', { buffer: Buffer.from('event_name,event_type\n', 'utf8') } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(admin.requireAdminBySlug).toHaveBeenCalledWith('zhu', 'member');
    expect(service.bulkCreate).not.toHaveBeenCalled();
  });
});

describe('FamilyEventController CSV 导入', () => {
  const service = {
    bulkCreate: jest.fn(),
  };
  const resolver = { resolveOrThrow: jest.fn() };
  const admin = { requireAdminBySlug: jest.fn() };
  const controller = new FamilyEventController(service as never, resolver as never, admin as never);
  const adminUser = { user: { userId: 'admin-1' } };

  beforeEach(() => {
    jest.clearAllMocks();
    admin.requireAdminBySlug.mockResolvedValue(9n);
  });

  it('CSV 解析失败时抛出明确的 BadRequest', async () => {
    const file = {
      buffer: Buffer.from('event_name,event_type\n"未闭合,birth\n', 'utf8'),
      originalname: 'events.csv',
    };

    await expect(controller.importCsv(adminUser, 'zhu', file as never)).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.importCsv(adminUser, 'zhu', file as never)).rejects.toThrow(/CSV 解析失败/);
    expect(service.bulkCreate).not.toHaveBeenCalled();
  });

  it('合法行进入 bulkCreate，重复生卒的 skipped 不计入 failed，非法 event_type 计入 failed', async () => {
    service.bulkCreate.mockResolvedValue({ success: 1, skipped: 1, failed: 0, errors: [] });
    const csv = [
      '\uFEFFevent_name,event_type,event_date,person_id,media_ids',
      '甲诞辰,birth,1130-01-01,101,"12,34"',
      '',
      '乙逝世,death,1200-01-01T00:00:00.000Z,102,',
      '坏类型,not_a_type,1300-01-01,103,',
    ].join('\n');

    const result = await controller.importCsv(adminUser, 'zhu', {
      buffer: Buffer.from(csv, 'utf8'),
      originalname: 'events.csv',
    } as never);

    expect(admin.requireAdminBySlug).toHaveBeenCalledWith('zhu', 'admin-1');
    expect(service.bulkCreate).toHaveBeenCalledTimes(1);
    expect(service.bulkCreate).toHaveBeenCalledWith(9n, 'admin-1', [
      {
        event_name: '甲诞辰',
        event_type: 'birth',
        event_date: '1130-01-01',
        event_year: 1130,
        person_id: '101',
        media_ids: [12, 34],
      },
      {
        event_name: '乙逝世',
        event_type: 'death',
        event_date: '1200-01-01T00:00:00.000Z',
        event_year: 1200,
        person_id: '102',
      },
    ]);
    expect(result).toEqual({
      success: 1,
      skipped: 1,
      failed: 1,
      errors: [
        {
          line: 5,
          reason: expect.stringContaining('event_type'),
        },
      ],
    });
  });
});
