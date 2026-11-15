import { BadRequestException } from '@nestjs/common';
import { GenealogyEditionService } from './genealogy-edition.service';

describe('GenealogyEditionService.confirm 初审', () => {
  const prisma = {
    bioReview: { count: jest.fn() },
    $queryRaw: jest.fn(),
    genealogyEdition: { update: jest.fn() },
  };
  const service = new GenealogyEditionService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(service, 'assertWritable').mockResolvedValue(undefined);
    jest.spyOn(service as any, 'ensureWorkingEdition').mockResolvedValue({ id: 4n });
    jest.spyOn(service, 'state').mockResolvedValue({} as never);
  });

  it('仍有待审生平时不能把初审标成完成', async () => {
    prisma.bioReview.count.mockResolvedValue(2);

    await expect(service.confirm(9n, 'owner', 'review')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.genealogyEdition.update).not.toHaveBeenCalled();
  });

  it('最新一条仍为驳回时不能确认初审', async () => {
    prisma.bioReview.count.mockResolvedValue(0);
    prisma.$queryRaw.mockResolvedValue([{ status: 'REJECTED' }]);

    await expect(service.confirm(9n, 'owner', 'review')).rejects.toThrow('还有未处理的驳回');
    expect(prisma.genealogyEdition.update).not.toHaveBeenCalled();
  });
});
