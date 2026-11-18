import { BadRequestException } from '@nestjs/common';
import { FamilyEventType, Prisma } from '@prisma/client';
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
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    person: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    mediaArchive: {
      findMany: jest.fn(),
    },
  };
  const service = new FamilyEventService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.familyEvent.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) =>
      storedRow(data),
    );
    prisma.familyEvent.findUnique.mockResolvedValue({ id: 11n, clan_id: 7n });
    prisma.familyEvent.findFirst.mockResolvedValue(null);
    prisma.familyEvent.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) =>
      storedRow(data),
    );
    prisma.person.findFirst.mockResolvedValue(null);
    prisma.person.findMany.mockResolvedValue([]);
    prisma.mediaArchive.findMany.mockResolvedValue([]);
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

  it('候选含 person_id', async () => {
    prisma.person.findMany.mockResolvedValue([
      {
        id: 3n,
        full_name: '甲',
        birth_date: new Date('1130-01-01T00:00:00.000Z'),
        death_date: null,
      },
    ]);

    const result = await service.generateLifeEvents(7n);

    expect(result.candidates).toEqual([
      expect.objectContaining({
        person_id: '3',
        event_type: FamilyEventType.birth,
        event_name: '甲诞辰',
      }),
    ]);
  });

  it('create 把 person_id 写入 data', async () => {
    prisma.person.findFirst.mockResolvedValue({ id: 3n });

    await service.create(7n, 'user-1', {
      event_name: '甲诞辰',
      event_type: FamilyEventType.birth,
      event_date: '1130-01-01',
      person_id: '3',
    });

    expect(prisma.person.findFirst).toHaveBeenCalledWith({
      where: { id: 3n, clan_id: 7n },
      select: { id: true },
    });
    expect(prisma.familyEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ person_id: 3n }),
    });
  });

  it('外族 person_id 拒绝且不写入', async () => {
    await expect(
      service.create(7n, 'user-1', {
        event_name: '乙诞辰',
        event_type: FamilyEventType.birth,
        event_year: 1200,
        person_id: '9',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.familyEvent.create).not.toHaveBeenCalled();
  });

  it('同一 person 同一 birth 已存在时跳过，不再 create', async () => {
    prisma.person.findFirst.mockResolvedValue({ id: 3n });
    prisma.familyEvent.findFirst.mockResolvedValue({ id: 9n });

    const result = await service.create(7n, 'user-1', {
      event_name: '甲诞辰',
      event_type: FamilyEventType.birth,
      event_year: 1130,
      person_id: '3',
    });

    expect(result).toEqual({ skipped: true });
    expect(prisma.familyEvent.create).not.toHaveBeenCalled();
  });

  it('部分唯一索引冲突时返回 skipped', async () => {
    prisma.person.findFirst.mockResolvedValue({ id: 3n });
    prisma.familyEvent.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.22.0',
        meta: { target: 'family_events_life_person_type_key' },
      }),
    );

    const result = await service.create(7n, 'user-1', {
      event_name: '甲诞辰',
      event_type: FamilyEventType.birth,
      event_year: 1130,
      person_id: '3',
    });

    expect(result).toEqual({ skipped: true });
  });

  it('批量导入把已存在的生卒记入 skipped', async () => {
    prisma.person.findFirst.mockResolvedValue({ id: 3n });
    prisma.familyEvent.findFirst.mockResolvedValue({ id: 9n });

    const result = await service.bulkCreate(7n, 'user-1', [
      {
        event_name: '甲诞辰',
        event_type: FamilyEventType.birth,
        event_year: 1130,
        person_id: '3',
      },
    ]);

    expect(result).toEqual({ success: 0, skipped: 1, failed: 0, errors: [] });
    expect(prisma.familyEvent.create).not.toHaveBeenCalled();
  });

  it('聚会不因 person_id 被生卒去重拦住', async () => {
    prisma.person.findFirst.mockResolvedValue({ id: 3n });
    prisma.familyEvent.findFirst.mockResolvedValue({ id: 9n });

    await service.create(7n, 'user-1', {
      event_name: '甲聚会',
      event_type: FamilyEventType.gathering,
      event_year: 1800,
      person_id: '3',
    });

    expect(prisma.familyEvent.findFirst).not.toHaveBeenCalled();
    expect(prisma.familyEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        person_id: 3n,
        event_type: FamilyEventType.gathering,
      }),
    });
  });

  it('create 把 media_ids 去重后写入', async () => {
    prisma.mediaArchive.findMany.mockResolvedValue([{ id: 5n }, { id: 6n }]);

    await service.create(7n, 'user-1', {
      event_name: '祭祖',
      event_type: FamilyEventType.ancestor_worship,
      event_year: 1800,
      media_ids: [5, '6', 5],
    });

    expect(prisma.mediaArchive.findMany).toHaveBeenCalledWith({
      where: { clan_id: 7n, id: { in: [5n, 6n] } },
      select: { id: true },
    });
    expect(prisma.familyEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ media_ids: [5, 6] }),
    });
  });

  it('非本族媒体 id 拒绝且不写入', async () => {
    prisma.mediaArchive.findMany.mockResolvedValue([{ id: 5n }]);

    await expect(
      service.create(7n, 'user-1', {
        event_name: '祭祖',
        event_type: FamilyEventType.ancestor_worship,
        event_year: 1800,
        media_ids: [5, 8],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.familyEvent.create).not.toHaveBeenCalled();
  });

  it('update 把 person_id 写入 data', async () => {
    prisma.person.findFirst.mockResolvedValue({ id: 3n });
    prisma.familyEvent.findUnique.mockResolvedValue({
      id: 11n,
      clan_id: 7n,
      event_type: FamilyEventType.gathering,
      person_id: null,
    });

    await service.update(7n, 11n, { person_id: '3' });

    expect(prisma.familyEvent.update).toHaveBeenCalledWith({
      where: { id: 11n },
      data: expect.objectContaining({ person_id: 3n }),
    });
  });
});
