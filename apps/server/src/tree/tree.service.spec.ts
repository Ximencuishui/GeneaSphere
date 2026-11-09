import { TreeService } from './tree.service';
import { PedigreeService } from '../pedigree/pedigree.service';
import { Gender, Person } from '@prisma/client';

describe('TreeService', () => {
  let service: TreeService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      person: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      personAncestry: {
        createMany: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        deleteMany: jest.fn(),
      },
      familyUnit: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
      },
      familyChild: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        aggregate: jest.fn(),
      },
      xipai: { findFirst: jest.fn() },
      migrationEvent: { findMany: jest.fn() },
      mediaPersonLink: { findMany: jest.fn() },
      personBio: { findMany: jest.fn().mockResolvedValue([]) },
      personEvent: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn(), createMany: jest.fn() },
      $transaction: jest.fn().mockImplementation((callback: any) => callback(prisma)),
    };

    // 双写统一入口（决策清单 §H1）使用同一个 prisma mock
    service = new TreeService(prisma, new PedigreeService(prisma));
  });

  describe('createPerson', () => {
    it('should create person with self-ancestry record when no parent', async () => {
      const person: Person = {
        id: BigInt(1),
        clan_id: BigInt(1),
        full_name: '张三',
        gender: Gender.male,
        birth_date: null,
        death_date: null,
        is_living: true,
        birth_place: null,
        birth_lat: null,
        birth_lng: null,
        death_place: null,
        death_lat: null,
        death_lng: null,
        migration_branch: null,
        avatar_url: null,
        thumbnail_url: null,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
        deleted_by: null,
      };

      prisma.person.create.mockResolvedValue(person);

      const result = await service.createPerson({
        clan_id: BigInt(1),
        full_name: '张三',
        gender: Gender.male,
      });

      expect(result).toEqual(person);
      expect(prisma.personAncestry.createMany).toHaveBeenCalledWith({
        data: [
          {
            ancestor_id: BigInt(1),
            descendant_id: BigInt(1),
            depth: 0,
          },
        ],
        skipDuplicates: true,
      });
    });

    it('should create person with correct ancestry records when parent exists', async () => {
      const childPerson: Person = {
        id: BigInt(2),
        clan_id: BigInt(1),
        full_name: '张三',
        gender: Gender.male,
        birth_date: null,
        death_date: null,
        is_living: true,
        birth_place: null,
        birth_lat: null,
        birth_lng: null,
        death_place: null,
        death_lat: null,
        death_lng: null,
        migration_branch: null,
        avatar_url: null,
        thumbnail_url: null,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
        deleted_by: null,
      };

      prisma.person.create.mockResolvedValue(childPerson);
      prisma.personAncestry.findMany.mockResolvedValue([
        { ancestor_id: BigInt(1), depth: 0 },
      ]);
      // 双写：无现有家庭 → 新建单亲家庭 → 写 FamilyChild
      prisma.person.findMany.mockResolvedValue([
        { id: BigInt(1), gender: Gender.male },
      ]);
      prisma.familyUnit.findFirst.mockResolvedValue(null);
      prisma.familyUnit.create.mockResolvedValue({ id: BigInt(10) });
      prisma.familyChild.findFirst.mockResolvedValue(null);
      prisma.familyChild.aggregate.mockResolvedValue({
        _max: { birth_order: null },
      });

      const result = await service.createPerson(
        {
          clan_id: BigInt(1),
          full_name: '张三',
          gender: Gender.male,
        },
        BigInt(1)
      );

      expect(result).toEqual(childPerson);
      expect(prisma.personAncestry.createMany).toHaveBeenCalledWith({
        data: [
          {
            ancestor_id: BigInt(2),
            descendant_id: BigInt(2),
            depth: 0,
          },
          {
            ancestor_id: BigInt(1),
            descendant_id: BigInt(2),
            depth: 1,
          },
        ],
        skipDuplicates: true,
      });
      // 双写校验：FamilyChild 记录已建立（排行自动 = 1，类型亲生）
      expect(prisma.familyChild.create).toHaveBeenCalledWith({
        data: {
          family_id: BigInt(10),
          child_id: BigInt(2),
          birth_order: 1,
          child_type: 'BIOLOGICAL',
        },
      });
    });

    it('should create person with multi-level ancestry records', async () => {
      const childPerson: Person = {
        id: BigInt(3),
        clan_id: BigInt(1),
        full_name: '张三',
        gender: Gender.male,
        birth_date: null,
        death_date: null,
        is_living: true,
        birth_place: null,
        birth_lat: null,
        birth_lng: null,
        death_place: null,
        death_lat: null,
        death_lng: null,
        migration_branch: null,
        avatar_url: null,
        thumbnail_url: null,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
        deleted_by: null,
      };

      prisma.person.create.mockResolvedValue(childPerson);
      prisma.personAncestry.findMany.mockResolvedValue([
        { ancestor_id: BigInt(2), depth: 0 },
        { ancestor_id: BigInt(1), depth: 1 },
      ]);
      prisma.person.findMany.mockResolvedValue([
        { id: BigInt(2), gender: Gender.male },
      ]);
      prisma.familyUnit.findFirst.mockResolvedValue(null);
      prisma.familyUnit.create.mockResolvedValue({ id: BigInt(10) });
      prisma.familyChild.findFirst.mockResolvedValue(null);
      prisma.familyChild.aggregate.mockResolvedValue({
        _max: { birth_order: null },
      });

      await service.createPerson(
        {
          clan_id: BigInt(1),
          full_name: '张三',
          gender: Gender.male,
        },
        BigInt(2)
      );

      expect(prisma.personAncestry.createMany).toHaveBeenCalledWith({
        data: [
          {
            ancestor_id: BigInt(3),
            descendant_id: BigInt(3),
            depth: 0,
          },
          {
            ancestor_id: BigInt(2),
            descendant_id: BigInt(3),
            depth: 1,
          },
          {
            ancestor_id: BigInt(1),
            descendant_id: BigInt(3),
            depth: 2,
          },
        ],
        skipDuplicates: true,
      });
    });
  });

  describe('moveSubTree', () => {
    it('should throw error when moving subtree to itself', async () => {
      prisma.personAncestry.findMany.mockResolvedValue([
        { descendant_id: BigInt(2) },
        { descendant_id: BigInt(3) },
      ]);

      await expect(
        service.moveSubTree(BigInt(2), BigInt(2))
      ).rejects.toThrow('Cannot move subtree to itself or a descendant');
    });

    it('should throw error when moving subtree to a descendant', async () => {
      prisma.personAncestry.findMany.mockResolvedValue([
        { descendant_id: BigInt(2) },
        { descendant_id: BigInt(3) },
      ]);

      await expect(
        service.moveSubTree(BigInt(2), BigInt(3))
      ).rejects.toThrow('Cannot move subtree to itself or a descendant');
    });

    it('should delete old paths and create new paths when moving subtree', async () => {
      prisma.personAncestry.findMany
        .mockResolvedValueOnce([{ descendant_id: BigInt(2) }, { descendant_id: BigInt(3) }])
        .mockResolvedValueOnce([
          { ancestor_id: BigInt(2), descendant_id: BigInt(2), depth: 0 },
          { ancestor_id: BigInt(1), descendant_id: BigInt(2), depth: 1 },
          { ancestor_id: BigInt(2), descendant_id: BigInt(3), depth: 1 },
          { ancestor_id: BigInt(1), descendant_id: BigInt(3), depth: 2 },
          { ancestor_id: BigInt(3), descendant_id: BigInt(3), depth: 0 },
        ])
        .mockResolvedValueOnce([
          { ancestor_id: BigInt(4), depth: 0 },
          { ancestor_id: BigInt(5), depth: 1 },
        ]);

      await service.moveSubTree(BigInt(2), BigInt(4));

      expect(prisma.personAncestry.deleteMany).toHaveBeenCalledWith({
        where: {
          descendant_id: { in: [BigInt(2), BigInt(3)] },
          ancestor_id: { in: [BigInt(1)] },
        },
      });

      expect(prisma.personAncestry.createMany).toHaveBeenCalled();
    });
  });

  describe('getPersonDetail', () => {
    it('reads bio, ranked children, parents, siblings, generation word and age', async () => {
      prisma.person.findUnique.mockResolvedValue({
        id: BigInt(2),
        clan_id: BigInt(1),
        full_name: '朱熹',
        gender: Gender.male,
        birth_date: new Date('1130-02-12'),
        death_date: new Date('1200-03-26'),
        is_living: false,
        birth_place: '尤溪',
        death_place: null,
        migration_branch: null,
        deleted_at: null,
        bio: {
          courtesy_name: '元晦、仲晦',
          native_place: '婺源',
          burial_place: null,
          achievements: null,
          anecdotes: null,
          biography: '紫阳',
          marital_notes: null,
          adoption_note: null,
          premature: null,
        },
      });
      prisma.personAncestry.findMany
        .mockResolvedValueOnce([
          { ancestor: { id: BigInt(1), full_name: '朱松', gender: Gender.male } },
          { ancestor: { id: BigInt(9), full_name: '祝氏', gender: Gender.female } },
        ])
        .mockResolvedValueOnce([
          { descendant: { id: BigInt(3), full_name: '朱塾', gender: Gender.male, birth_date: new Date('1150-01-01') } },
        ]);
      prisma.familyChild.findMany
        .mockResolvedValueOnce([
          {
            birth_order: 1,
            child_type: 'BIOLOGICAL',
            child: { id: BigInt(4), full_name: '朱塾', gender: Gender.male, birth_date: new Date('1153-01-01') },
          },
        ])
        .mockResolvedValueOnce([
          { child_id: BigInt(3), birth_order: 2, child_type: 'BIOLOGICAL' },
        ])
        .mockResolvedValueOnce([
          { birth_order: 3, child_type: 'BIOLOGICAL' },
        ]);
      prisma.familyUnit.findMany.mockResolvedValue([
        {
          id: BigInt(8),
          husband_id: BigInt(2),
          wife_id: BigInt(7),
          marriage_order: 1,
          is_current: true,
          divorce_date: null,
          end_reason: null,
          note: null,
          union_type: 'normal',
          husband: { id: BigInt(2), full_name: '朱熹', gender: Gender.male },
          wife: { id: BigInt(7), full_name: '刘氏', gender: Gender.female },
        },
      ]);
      prisma.personAncestry.findFirst.mockResolvedValue({ depth: 4 });
      prisma.xipai.findFirst.mockResolvedValue({ character: '熹' });
      prisma.migrationEvent.findMany.mockResolvedValue([]);
      prisma.mediaPersonLink.findMany.mockResolvedValue([]);

      const result = await service.getPersonDetail(BigInt(2));

      expect(result.profile.courtesy_name).toBe('元晦、仲晦');
      expect(result.profile.biography).toBe('紫阳');
      expect(result.profile.generation).toBe(5);
      expect(result.profile.generation_word).toBe('熹');
      expect(result.profile.birth_order).toBe(3);
      expect(result.profile.age_at_death).toBe(70);
      expect(result.father?.full_name).toBe('朱松');
      expect(result.mother?.full_name).toBe('祝氏');
      expect(result.children[0]).toMatchObject({ full_name: '朱塾', birth_order: 1, child_type: 'BIOLOGICAL' });
      expect(result.siblings[0]).toMatchObject({ full_name: '朱塾', birth_order: 2 });
      expect(result.spouses[0]).toMatchObject({ name: '刘氏', union_type: 'normal' });
      expect(result.person).not.toHaveProperty('bio');
      expect(prisma.xipai.findFirst).toHaveBeenCalledWith({
        where: { clan_id: BigInt(1), generation: 5 },
        select: { character: true },
      });
    });
  });
});