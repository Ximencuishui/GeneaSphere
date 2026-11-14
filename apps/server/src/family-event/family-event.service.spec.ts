import { FamilyEventType } from '@prisma/client';
import { FamilyEventService } from './family-event.service';

function storedRow(data: Record<string, unknown>) {
  return {
    id: 11n,
    clan_id: 7n,
    media_ids: null,
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    updated_at: new Date('2026-01-01T00:00:00.000Z'),
    created_by: 'user-1',
    location: null,
    description: null,
    ...data,
  };
}

describe('FamilyEventService event_year', () => {
  const prisma = {
    familyEvent: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
  const service = new FamilyEventService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.familyEvent.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) =>
      storedRow(data),
    );
    prisma.familyEvent.findUnique.mockResolvedValue({ id: 11n, clan_id: 7n });
    prisma.familyEvent.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) =>
      storedRow(data),
    );
  });

  it('只带日期不带 event_year 时创建会补全年份', async () => {
    await service.create(7n, 'user-1', {
      event_name: '朱熹诞生',
      event_type: FamilyEventType.birth,
      event_date: '1130-09-15',
    });

    expect(prisma.familyEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        event_year: 1130,
        event_date: new Date('1130-09-15'),
      }),
    });
  });

  it('只带日期不带 event_year 时更新会补全年份', async () => {
    await service.update(7n, 11n, { event_date: '1200-04-23' });

    expect(prisma.familyEvent.update).toHaveBeenCalledWith({
      where: { id: 11n },
      data: expect.objectContaining({
        event_year: 1200,
        event_date: new Date('1200-04-23'),
      }),
    });
  });
});
