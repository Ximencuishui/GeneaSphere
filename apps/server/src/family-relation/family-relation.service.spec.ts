import { FamilyRelationService } from './family-relation.service';

describe('FamilyRelationService 待审不落库', () => {
  const tx = {
    marriageHistory: { findFirst: jest.fn(), update: jest.fn() },
    familyRelationChange: { create: jest.fn() },
    childCustodyRecord: { count: jest.fn(), updateMany: jest.fn(), create: jest.fn() },
    person: { create: jest.fn() },
  };
  const prisma = {
    person: { findUnique: jest.fn() },
    familyRelationChange: { create: jest.fn() },
    $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const validator = {
    assertOwnPerson: jest.fn(),
    assertAdult: jest.fn(),
    checkMarriageRisk: jest.fn(),
    assertIsParent: jest.fn(),
  };
  const service = new FamilyRelationService(
    prisma as never,
    {} as never,
    validator as never,
    {} as never,
    {} as never,
    {} as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    validator.assertOwnPerson.mockResolvedValue(undefined);
    validator.assertAdult.mockResolvedValue(undefined);
  });

  it('高风险婚姻在通过前不改婚姻记录', async () => {
    validator.checkMarriageRisk.mockResolvedValue(true);
    prisma.person.findUnique.mockResolvedValue({ clan_id: 1n, full_name: '甲' });
    tx.marriageHistory.findFirst.mockResolvedValue({ id: 3n, spouse_id: 8n, is_current: true });
    tx.familyRelationChange.create.mockResolvedValue({ id: 11n, status: 'pending' });

    const result = await service.updateMarriageStatus('user-1', {
      person_id: '5',
      current_status: 'divorced',
      change_reason: '风险',
    } as never);

    expect(result.needs_manual).toBe(true);
    expect(tx.marriageHistory.update).not.toHaveBeenCalled();
    expect(tx.familyRelationChange.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'pending',
        current_state: expect.objectContaining({ applied: false }),
      }),
    }));
  });

  it('子女争议写入目标子女，未解决前不改抚养记录', async () => {
    validator.assertIsParent.mockResolvedValue({ parentId: 3n });
    prisma.person.findUnique.mockResolvedValue({ clan_id: 1n, full_name: '小儿' });
    tx.childCustodyRecord.count.mockResolvedValue(1);
    tx.familyRelationChange.create.mockResolvedValue({ id: 12n, status: 'pending' });

    const result = await service.updateCustody('user-1', '8', {
      child_id: '8',
      custody_status: 'living_with',
      change_reason: '争议',
    } as never);

    expect(result.is_disputed).toBe(true);
    expect(tx.childCustodyRecord.create).not.toHaveBeenCalled();
    expect(tx.childCustodyRecord.updateMany).not.toHaveBeenCalled();
    expect(tx.familyRelationChange.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        target_person_id: 8n,
        is_disputed: true,
        status: 'pending',
      }),
    }));
  });

  it('缺生父信息的新增子女在通过前不创建人物', async () => {
    prisma.person.findUnique.mockResolvedValue({ clan_id: 1n, gender: 'female', full_name: '母' });
    prisma.familyRelationChange.create.mockResolvedValue({ id: 13n, status: 'pending' });

    const result = await service.addChild('user-1', {
      parent_person_id: '5',
      child: { full_name: '未审子女', gender: 'male', father_info_missing: true },
      custody: 'living_with',
    } as never);

    expect(result.child_id).toBeNull();
    expect(tx.person.create).not.toHaveBeenCalled();
    expect(prisma.familyRelationChange.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'pending',
        current_state: expect.objectContaining({ applied: false, child_name: '未审子女' }),
      }),
    }));
  });
});
