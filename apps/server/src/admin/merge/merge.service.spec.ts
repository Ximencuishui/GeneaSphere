import { BadRequestException, ConflictException } from '@nestjs/common';
import { ApplicationStatus } from '@prisma/client';
import { MergeService } from './merge.service';

describe('MergeService 认亲状态机', () => {
  const tx = {
    mergeApplication: {
      updateMany: jest.fn(),
      update: jest.fn(),
    },
    familyUnit: {
      create: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
      deleteMany: jest.fn(),
      upsert: jest.fn(),
    },
    familyChild: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
      upsert: jest.fn(),
    },
    person: { updateMany: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    personBio: { findMany: jest.fn(), upsert: jest.fn() },
    personEvent: { findMany: jest.fn(), upsert: jest.fn() },
    personAncestry: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    mediaPersonLink: { findMany: jest.fn() },
    mediaArchive: { findMany: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
    dataSnapshot: { create: jest.fn(), updateMany: jest.fn() },
    clanMember: { upsert: jest.fn() },
  };
  const prisma = {
    mergeApplication: {
      updateMany: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
    },
    familyChild: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
    person: { findMany: jest.fn(), updateMany: jest.fn(), findUnique: jest.fn() },
    familyUnit: { findMany: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
    personAncestry: { findMany: jest.fn(), deleteMany: jest.fn(), createMany: jest.fn() },
    dataSnapshot: { create: jest.fn(), findUnique: jest.fn() },
    $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const service = new MergeService(prisma as never);

  const anchor = {
    id: 30n,
    clan_id: 10n,
    full_name: '挂载点',
    gender: 'male',
    birth_date: null,
    death_date: null,
    is_living: false,
    birth_place: '甲地',
    birth_lat: null,
    birth_lng: null,
    death_place: '乙地',
    death_lat: null,
    death_lng: null,
    avatar_url: 'a.png',
    thumbnail_url: 'a-thumb.png',
    migration_branch: null,
    deleted_at: null,
    deleted_by: null,
  };
  const branchRoot = {
    ...anchor,
    id: 20n,
    clan_id: 11n,
    full_name: '支系根',
    avatar_url: null,
    thumbnail_url: null,
    birth_place: null,
    death_place: null,
  };

  function installApprovedMerge() {
    prisma.mergeApplication.findUnique.mockResolvedValue({
      id: 1n,
      status: ApplicationStatus.APPROVED,
      clan_id: 10n,
      applicant_clan_id: 11n,
      branch_root_person_id: 20n,
      applicant_id: 'user-1',
      merge_target_id: null,
      clan: { id: 10n },
    });
    tx.mergeApplication.updateMany.mockResolvedValue({ count: 1 });
    tx.person.findUnique.mockImplementation(async ({ where }: { where: { id: bigint } }) => {
      if (where.id === 30n) return anchor;
      if (where.id === 20n) return branchRoot;
      return null;
    });
    tx.familyChild.findFirst.mockResolvedValue(null);
    tx.familyChild.findMany.mockResolvedValue([]);
    tx.familyChild.create.mockResolvedValue({ id: 8n });
    tx.person.findMany.mockResolvedValue([]);
    tx.person.updateMany.mockResolvedValue({ count: 1 });
    tx.personBio.findMany.mockResolvedValue([]);
    tx.personEvent.findMany.mockResolvedValue([]);
    tx.familyUnit.findMany.mockResolvedValue([]);
    tx.familyUnit.create.mockResolvedValue({ id: 5n });
    tx.familyUnit.updateMany.mockResolvedValue({ count: 0 });
    tx.personAncestry.findFirst.mockResolvedValue(null);
    tx.personAncestry.findMany.mockResolvedValue([]);
    tx.personAncestry.deleteMany.mockResolvedValue({ count: 0 });
    tx.personAncestry.createMany.mockResolvedValue({ count: 1 });
    tx.mediaPersonLink.findMany.mockResolvedValue([]);
    tx.mediaArchive.findMany.mockResolvedValue([]);
    tx.mediaArchive.updateMany.mockResolvedValue({ count: 0 });
    tx.dataSnapshot.create.mockResolvedValue({ id: 99n });
    tx.mergeApplication.update.mockResolvedValue({ id: 1n });
    tx.clanMember.upsert.mockResolvedValue({ id: 1n });
    prisma.dataSnapshot.create.mockRejectedValue(new Error('snapshot must stay inside the transaction'));
  }

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx));
  });

  it('非 PENDING 时通过申请抛出冲突且不写库', async () => {
    prisma.mergeApplication.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.approveApplication(8n, 'admin-1')).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.mergeApplication.updateMany).toHaveBeenCalledWith({
      where: { id: 8n, status: ApplicationStatus.PENDING },
      data: expect.objectContaining({
        status: ApplicationStatus.APPROVED,
        reviewed_by: 'admin-1',
      }),
    });
    expect(prisma.mergeApplication.update).not.toHaveBeenCalled();
  });

  it('PENDING 申请可以通过', async () => {
    prisma.mergeApplication.updateMany.mockResolvedValue({ count: 1 });

    await expect(service.approveApplication(8n, 'admin-1')).resolves.toEqual({
      status: ApplicationStatus.APPROVED,
    });
    expect(prisma.mergeApplication.update).not.toHaveBeenCalled();
  });

  it('非 PENDING 时拒绝申请抛出冲突且不写库', async () => {
    prisma.mergeApplication.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.rejectApplication(8n, 'admin-1', '材料不足')).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.mergeApplication.updateMany).toHaveBeenCalledWith({
      where: { id: 8n, status: ApplicationStatus.PENDING },
      data: expect.objectContaining({
        status: ApplicationStatus.REJECTED,
        reject_reason: '材料不足',
        reviewed_by: 'admin-1',
      }),
    });
    expect(prisma.mergeApplication.update).not.toHaveBeenCalled();
  });

  it('PENDING 申请可以拒绝', async () => {
    prisma.mergeApplication.updateMany.mockResolvedValue({ count: 1 });

    await expect(service.rejectApplication(8n, 'admin-1', '材料不足')).resolves.toEqual({
      status: ApplicationStatus.REJECTED,
    });
  });

  it('非 PENDING 时转人工抛出冲突且不写库', async () => {
    prisma.mergeApplication.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.markNeedsManualReview(8n)).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.mergeApplication.updateMany).toHaveBeenCalledWith({
      where: { id: 8n, status: ApplicationStatus.PENDING },
      data: { status: ApplicationStatus.NEEDS_MANUAL_REVIEW },
    });
    expect(prisma.mergeApplication.update).not.toHaveBeenCalled();
  });

  it('PENDING 申请可以转人工', async () => {
    prisma.mergeApplication.updateMany.mockResolvedValue({ count: 1 });

    await expect(service.markNeedsManualReview(8n)).resolves.toEqual({
      status: ApplicationStatus.NEEDS_MANUAL_REVIEW,
    });
  });

  it('executeMerge 在非 APPROVED 时失败且不进入事务', async () => {
    prisma.mergeApplication.findUnique.mockResolvedValue({
      id: 1n,
      status: ApplicationStatus.REJECTED,
      clan_id: 10n,
      applicant_id: 'user-1',
    });

    await expect(service.executeMerge(1n, 30n, 20n, 0, 'admin-1')).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.mergeApplication.updateMany).not.toHaveBeenCalled();
    expect(tx.familyChild.create).not.toHaveBeenCalled();
  });

  it('executeMerge 并发时第二次匹配不到 APPROVED 并失败', async () => {
    installApprovedMerge();
    tx.mergeApplication.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    await service.executeMerge(1n, 30n, 20n, 0, 'admin-1');
    await expect(service.executeMerge(1n, 30n, 20n, 0, 'admin-1')).rejects.toBeInstanceOf(ConflictException);

    expect(tx.mergeApplication.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: 1n, status: ApplicationStatus.APPROVED },
      data: { status: ApplicationStatus.MERGED },
    });
    expect(tx.familyUnit.create).toHaveBeenCalledTimes(1);
    expect(tx.familyChild.create).toHaveBeenCalledTimes(1);
  });

  it('family_children 已有同一父母边和 child 时跳过插入', async () => {
    installApprovedMerge();
    tx.mergeApplication.updateMany.mockResolvedValue({ count: 1 });
    tx.familyChild.findFirst.mockResolvedValue({
      id: 7n,
      family_id: 4n,
      child_id: 20n,
    });

    await service.executeMerge(1n, 30n, 20n, 0, 'admin-1');

    expect(tx.familyChild.findFirst).toHaveBeenCalledWith({
      where: {
        child_id: 20n,
        family: {
          husband_id: 30n,
          wife_id: null,
        },
      },
    });
    expect(tx.familyChild.create).not.toHaveBeenCalled();
    expect(tx.familyUnit.create).not.toHaveBeenCalled();
    expect(tx.person.updateMany).toHaveBeenCalled();
  });
});

describe('MergeService 血缘、快照与回滚', () => {
  const tx = {
    mergeApplication: { updateMany: jest.fn(), update: jest.fn() },
    familyUnit: {
      create: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
      deleteMany: jest.fn(),
      upsert: jest.fn(),
    },
    familyChild: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
      upsert: jest.fn(),
    },
    person: { updateMany: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    personBio: { findMany: jest.fn(), upsert: jest.fn() },
    personEvent: { findMany: jest.fn(), upsert: jest.fn() },
    personAncestry: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    mediaPersonLink: { findMany: jest.fn() },
    mediaArchive: { findMany: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
    dataSnapshot: { create: jest.fn(), updateMany: jest.fn() },
    clanMember: { upsert: jest.fn() },
  };
  const prisma = {
    mergeApplication: { findUnique: jest.fn() },
    dataSnapshot: { create: jest.fn(), findUnique: jest.fn() },
    $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const service = new MergeService(prisma as never);

  const anchor = {
    id: 30n,
    clan_id: 10n,
    full_name: '挂载点',
    gender: 'male',
    is_living: false,
    birth_date: null,
    death_date: null,
    birth_place: '甲地',
    death_place: '乙地',
    avatar_url: 'a.png',
    thumbnail_url: 'a-thumb.png',
  };
  const branch = {
    id: 20n,
    clan_id: 11n,
    full_name: '支系根',
    gender: 'male',
    is_living: false,
    birth_date: null,
    death_date: null,
    birth_place: null,
    death_place: null,
    avatar_url: null,
    thumbnail_url: null,
  };
  const child = { ...branch, id: 21n, full_name: '支系子女' };

  function approvedApp(overrides: Record<string, unknown> = {}) {
    prisma.mergeApplication.findUnique.mockResolvedValue({
      id: 1n,
      status: ApplicationStatus.APPROVED,
      clan_id: 10n,
      applicant_clan_id: 11n,
      branch_root_person_id: 20n,
      applicant_id: 'user-1',
      merge_target_id: 4n,
      ...overrides,
    });
  }

  function armPeople(branchPerson = branch) {
    tx.person.findUnique.mockImplementation(async ({ where }: { where: { id: bigint } }) => {
      if (where.id === 30n) return anchor;
      if (where.id === branchPerson.id) return branchPerson;
      return null;
    });
    tx.person.findMany.mockImplementation(async ({ where }: { where: any }) => {
      if (where.clan_id === 11n) return [branchPerson, child];
      return [anchor];
    });
    tx.personBio.findMany.mockResolvedValue([]);
    tx.personEvent.findMany.mockResolvedValue([]);
    tx.familyUnit.findMany.mockResolvedValue([]);
    tx.familyChild.findMany.mockResolvedValue([]);
    tx.mediaPersonLink.findMany.mockResolvedValue([{ media_id: 70n, person_id: 20n }]);
    tx.mediaArchive.findMany.mockResolvedValue([{ id: 70n, clan_id: 11n, file_url: 'm.png' }]);
    tx.mediaArchive.updateMany.mockResolvedValue({ count: 1 });
    tx.familyUnit.create.mockResolvedValue({ id: 5n });
    tx.familyChild.create.mockResolvedValue({ id: 8n });
    tx.person.updateMany.mockResolvedValue({ count: 2 });
    tx.familyUnit.updateMany.mockResolvedValue({ count: 0 });
    tx.mergeApplication.update.mockResolvedValue({ id: 1n });
    tx.mergeApplication.updateMany.mockResolvedValue({ count: 1 });
    tx.clanMember.upsert.mockResolvedValue({ id: 1n });
    tx.dataSnapshot.create.mockResolvedValue({ id: 99n });
    tx.personAncestry.deleteMany.mockResolvedValue({ count: 1 });
    tx.personAncestry.createMany.mockResolvedValue({ count: 1 });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx));
  });

  it('applicant_clan_id 为空时执行合并 400，不写家庭、不改闭包', async () => {
    approvedApp({ applicant_clan_id: null });

    await expect(service.executeMerge(1n, 30n, 20n, 0, 'admin-1')).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.familyUnit.create).not.toHaveBeenCalled();
    expect(tx.personAncestry.deleteMany).not.toHaveBeenCalled();
    expect(tx.dataSnapshot.create).not.toHaveBeenCalled();
    expect(prisma.dataSnapshot.create).not.toHaveBeenCalled();
  });

  it('同一家族的无父母始祖不会被挂成子女', async () => {
    approvedApp({ applicant_clan_id: 10n, branch_root_person_id: 20n });
    armPeople({ ...branch, clan_id: 10n });
    tx.familyChild.findFirst.mockResolvedValue(null);
    tx.personAncestry.findFirst.mockResolvedValue(null);

    await expect(service.executeMerge(1n, 30n, 20n, 0, 'admin-1')).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.familyUnit.create).not.toHaveBeenCalled();
    expect(tx.familyChild.create).not.toHaveBeenCalled();
    expect(tx.dataSnapshot.create).not.toHaveBeenCalled();
  });

  it('已有血缘路径时拒绝', async () => {
    approvedApp();
    armPeople();
    tx.familyChild.findFirst.mockResolvedValue(null);
    tx.personAncestry.findFirst.mockImplementation(async ({ where }: { where: any }) => {
      if (where.ancestor_id === 20n && where.descendant_id === 30n && where.depth?.gte === 1) {
        return { ancestor_id: 20n, descendant_id: 30n, depth: 2 };
      }
      return null;
    });

    await expect(service.executeMerge(1n, 30n, 20n, 3, 'admin-1')).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.familyChild.create).not.toHaveBeenCalled();
    expect(tx.dataSnapshot.create).not.toHaveBeenCalled();
  });

  it('闭包先在内存合并再写入，保留内部边和 depth=0，新边深度为 a+b+1', async () => {
    approvedApp();
    armPeople();
    tx.familyChild.findFirst.mockResolvedValue(null);
    tx.personAncestry.findFirst.mockResolvedValue(null);
    const order: string[] = [];
    tx.personAncestry.findMany.mockImplementation(async ({ where }: { where: any }) => {
      order.push('read');
      if (where.descendant_id === 30n) {
        return [
          { ancestor_id: 30n, descendant_id: 30n, depth: 0 },
          { ancestor_id: 10n, descendant_id: 30n, depth: 1 },
        ];
      }
      if (where.ancestor_id === 20n && !where.descendant_id?.in && !where.descendant_id?.notIn) {
        return [
          { ancestor_id: 20n, descendant_id: 20n, depth: 0 },
          { ancestor_id: 20n, descendant_id: 21n, depth: 1 },
        ];
      }
      if (where.descendant_id?.in) {
        return [
          { ancestor_id: 20n, descendant_id: 20n, depth: 0 },
          { ancestor_id: 20n, descendant_id: 21n, depth: 1 },
          { ancestor_id: 21n, descendant_id: 21n, depth: 0 },
        ];
      }
      if (where.descendant_id?.notIn) return [];
      return [];
    });
    tx.personAncestry.deleteMany.mockImplementation(async () => {
      order.push('delete');
      return { count: 3 };
    });
    tx.personAncestry.createMany.mockImplementation(async () => {
      order.push('write');
      return { count: 1 };
    });

    await service.executeMerge(1n, 30n, 20n, 9, 'admin-1');

    expect(order.indexOf('delete')).toBeGreaterThan(order.lastIndexOf('read'));
    expect(order.indexOf('write')).toBeGreaterThan(order.indexOf('delete'));
    const written = tx.personAncestry.createMany.mock.calls.flatMap((call) => call[0].data);
    expect(written).toEqual(expect.arrayContaining([
      { ancestor_id: 20n, descendant_id: 20n, depth: 0 },
      { ancestor_id: 21n, descendant_id: 21n, depth: 0 },
      { ancestor_id: 20n, descendant_id: 21n, depth: 1 },
      { ancestor_id: 30n, descendant_id: 20n, depth: 1 },
      { ancestor_id: 30n, descendant_id: 21n, depth: 2 },
      { ancestor_id: 10n, descendant_id: 20n, depth: 2 },
      { ancestor_id: 10n, descendant_id: 21n, depth: 3 },
    ]));
    expect(written.some((edge: { depth: number }) => edge.depth >= 9)).toBe(false);
    expect(tx.personAncestry.createMany.mock.calls[0][0].skipDuplicates).toBeUndefined();
    expect(prisma.dataSnapshot.create).not.toHaveBeenCalled();
    expect(tx.dataSnapshot.create).toHaveBeenCalled();
    const snapshotPayload = tx.dataSnapshot.create.mock.calls[0][0].data.data;
    expect(snapshotPayload.persons.find((person: { id: string }) => person.id === '20').clan_id).toBe('11');
    expect(snapshotPayload.applicationBefore.merge_target_id).toBe('4');
  });

  it('快照与合并同事务，合并失败不留快照', async () => {
    approvedApp();
    armPeople();
    tx.familyChild.findFirst.mockResolvedValue(null);
    tx.personAncestry.findFirst.mockResolvedValue(null);
    tx.personAncestry.findMany.mockResolvedValue([]);
    tx.personAncestry.createMany.mockRejectedValue(new Error('insert failed'));

    await expect(service.executeMerge(1n, 30n, 20n, 0, 'admin-1')).rejects.toThrow('insert failed');

    expect(tx.dataSnapshot.create).toHaveBeenCalled();
    expect(prisma.dataSnapshot.create).not.toHaveBeenCalled();
    const snapshotOrder = tx.dataSnapshot.create.mock.invocationCallOrder[0];
    const insertOrder = tx.personAncestry.createMany.mock.invocationCallOrder[0];
    expect(snapshotOrder).toBeLessThan(insertOrder);
  });

  it('回滚恢复人物 clan_id、删掉新建 merger 家庭、重建血缘边，申请回到 APPROVED', async () => {
    prisma.dataSnapshot.findUnique.mockResolvedValue({
      id: 99n,
      clan_id: 10n,
      applicant_clan_id: 11n,
      merge_application_id: 1n,
      merge_target_id: 30n,
      branch_root_id: 20n,
      operation_type: 'MERGE',
      is_reverted: false,
      expires_at: new Date(Date.now() + 60_000),
      data: {
        applicationBefore: { status: 'APPROVED', merge_target_id: '4' },
        persons: [{ ...branch, id: '20', clan_id: '11', birth_date: null, death_date: null, deleted_at: null }],
        personBios: [],
        personEvents: [],
        mediaArchives: [{ id: '70', clan_id: '11' }],
        familyUnits: [{ id: '3', clan_id: '11', husband_id: null, wife_id: null, union_type: 'normal', marriage_order: 1, is_current: true }],
        familyChildren: [{ id: '6', family_id: '3', child_id: '21', birth_order: 1, child_type: 'BIOLOGICAL' }],
        ancestry: [
          { ancestor_id: '20', descendant_id: '20', depth: 0 },
          { ancestor_id: '20', descendant_id: '21', depth: 1 },
        ],
      },
    });
    tx.mergeApplication.updateMany.mockResolvedValue({ count: 1 });
    tx.person.update.mockResolvedValue({});
    tx.mediaArchive.update.mockResolvedValue({});
    tx.familyUnit.deleteMany.mockResolvedValue({ count: 1 });
    tx.familyChild.deleteMany.mockResolvedValue({ count: 1 });
    tx.familyUnit.upsert.mockResolvedValue({});
    tx.familyChild.upsert.mockResolvedValue({});
    tx.personAncestry.deleteMany.mockResolvedValue({ count: 2 });
    tx.personAncestry.createMany.mockResolvedValue({ count: 2 });
    tx.dataSnapshot.updateMany.mockResolvedValue({ count: 1 });

    await service.rollbackMerge(99n, 'admin-1');

    expect(tx.mergeApplication.updateMany).toHaveBeenCalledWith({
      where: { id: 1n, status: ApplicationStatus.MERGED },
      data: { status: ApplicationStatus.APPROVED, merge_target_id: 4n },
    });
    expect(tx.person.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 20n },
      data: expect.objectContaining({ clan_id: 11n }),
    }));
    expect(tx.familyUnit.deleteMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ union_type: 'merger', husband_id: 30n }),
    });
    expect(tx.mediaArchive.update).toHaveBeenCalledWith({
      where: { id: 70n },
      data: { clan_id: 11n },
    });
    expect(tx.personAncestry.createMany).toHaveBeenCalledWith({
      data: [
        { ancestor_id: 20n, descendant_id: 20n, depth: 0 },
        { ancestor_id: 20n, descendant_id: 21n, depth: 1 },
      ],
    });
    expect(tx.dataSnapshot.updateMany).toHaveBeenCalledWith({
      where: { id: 99n, is_reverted: false },
      data: { is_reverted: true },
    });
  });

  it('过期快照不写库', async () => {
    prisma.dataSnapshot.findUnique.mockResolvedValue({
      id: 99n,
      is_reverted: false,
      expires_at: new Date(Date.now() - 1000),
      operation_type: 'MERGE',
      data: { persons: [], ancestry: [] },
    });

    await expect(service.rollbackMerge(99n, 'admin-1')).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.person.update).not.toHaveBeenCalled();
    expect(tx.personAncestry.deleteMany).not.toHaveBeenCalled();
  });
});
