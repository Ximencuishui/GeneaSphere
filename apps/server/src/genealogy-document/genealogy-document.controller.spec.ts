import { ForbiddenException } from '@nestjs/common';
import { GenealogyDocumentController } from './genealogy-document.controller';

jest.mock('./genealogy-document.service', () => ({
  GenealogyDocumentService: class GenealogyDocumentService {},
}));

jest.mock('../admin/admin.service', () => ({
  AdminService: class AdminService {},
}));

describe('GenealogyDocumentController 家族管理员门禁', () => {
  const service = {
    enqueue: jest.fn().mockResolvedValue({ job_id: 'job-1', status: 'pending' }),
    delete: jest.fn().mockResolvedValue({ id: '9', deleted: true }),
    retry: jest.fn().mockResolvedValue({ job_id: 'job-2', status: 'pending', retry_document_id: '9' }),
    createPrintJob: jest.fn().mockResolvedValue({ id: '4', status: 'PENDING', document_id: '9' }),
    getPrintJob: jest.fn().mockResolvedValue({ id: '4', status: 'PENDING' }),
  };
  const resolver = { resolveOrThrow: jest.fn() };
  const admin = { requireAdminBySlug: jest.fn().mockResolvedValue(7n) };
  const controller = new GenealogyDocumentController(service as never, resolver as never, admin as never);
  const dto = { version_name: '族谱·2026版', style: 'traditional' };

  beforeEach(() => {
    jest.clearAllMocks();
    admin.requireAdminBySlug.mockResolvedValue(7n);
  });

  it('生成接口先要求当前家族的管理员', async () => {
    await controller.create({ user: { userId: 'user-1' } }, 'zhu', dto as never);

    expect(admin.requireAdminBySlug).toHaveBeenCalledWith('zhu', 'user-1');
    expect(service.enqueue).toHaveBeenCalledWith(7n, 'user-1', dto);
    expect(resolver.resolveOrThrow).not.toHaveBeenCalled();
  });

  it('删除接口先要求当前家族的管理员', async () => {
    await controller.delete({ user: { userId: 'user-1' } }, 'zhu', '9');

    expect(admin.requireAdminBySlug).toHaveBeenCalledWith('zhu', 'user-1');
    expect(service.delete).toHaveBeenCalledWith(7n, 9n);
  });

  it('普通成员被拒绝时不会生成或删除', async () => {
    admin.requireAdminBySlug.mockRejectedValue(new ForbiddenException('Admin access required'));

    await expect(controller.create({ user: { userId: 'member' } }, 'zhu', dto as never)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(controller.delete({ user: { userId: 'member' } }, 'zhu', '9')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(service.enqueue).not.toHaveBeenCalled();
    expect(service.delete).not.toHaveBeenCalled();
    expect(service.retry).not.toHaveBeenCalled();
    expect(service.createPrintJob).not.toHaveBeenCalled();
  });

  it('重试接口先要求当前家族的管理员', async () => {
    await controller.retry({ user: { userId: 'user-1' } }, 'zhu', '9');

    expect(admin.requireAdminBySlug).toHaveBeenCalledWith('zhu', 'user-1');
    expect(service.retry).toHaveBeenCalledWith(7n, 'user-1', 9n);
  });

  it('下单印刷先要求当前家族的管理员', async () => {
    await controller.createPrintJob({ user: { userId: 'user-1' } }, 'zhu', '9');

    expect(admin.requireAdminBySlug).toHaveBeenCalledWith('zhu', 'user-1');
    expect(service.createPrintJob).toHaveBeenCalledWith(7n, 'user-1', 9n);
  });

  it('非管理员查询印刷工作项时拒绝且不调用 service', async () => {
    admin.requireAdminBySlug.mockRejectedValue(new ForbiddenException('Admin access required'));

    await expect(controller.printJob({ user: { userId: 'member' } }, 'zhu', '4')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(service.getPrintJob).not.toHaveBeenCalled();
  });
});
