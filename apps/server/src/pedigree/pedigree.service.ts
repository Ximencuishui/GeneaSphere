import { Injectable } from '@nestjs/common';
import { Prisma, PrismaService } from '@geneasphere/db';
import { ChildRelationType } from '@prisma/client';

type Tx = Prisma.TransactionClient;

export interface AttachChildToParentsInput {
  clan_id: bigint;
  child_id: bigint;
  /** 1~2 位父/母（必须与 child 同族；跨族配偶不要传入） */
  parent_ids: bigint[];
  /** 已创建的 FamilyUnit（如 family-relation 流程已先建家庭）；缺省自动定位/新建 */
  family_id?: bigint;
  child_type?: ChildRelationType;
  /** 缺省自动 = 该家庭现有 max(birth_order) + 1 */
  birth_order?: number;
}

/**
 * 亲子关系统一写入服务（《册谱数据模型决策清单》§H1）
 *
 * 背景：历史上有两条互不同步的写入路径——
 *  - tree.service.createPerson：只写 PersonAncestry，不写 FamilyChild；
 *  - family-relation.service.addChild：只写 FamilyUnit/FamilyChild，不写 PersonAncestry。
 * 后果：树谱与用户中心添加的人物关系互相缺失，"树谱 ↔ 册谱 数据完全一致"
 * （《树谱模块 PRD》§2.6 / 《册谱模块 PRD》§8 验收项）无法成立。
 *
 * 本服务把两条路径收敛为同一个事务级入口：一次调用同时维护
 *  PersonAncestry（闭包表：self-record + 父母祖先链）与 FamilyChild（排行/过继类型）。
 * 所有写操作必须传入事务句柄 tx，由调用方统一提交/回滚。
 */
@Injectable()
export class PedigreeService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 事务内建立"亲子关系"（双写：PersonAncestry + FamilyChild）。
   * 幂等：闭包表 createMany + skipDuplicates；(family_id, child_id) 已存在则跳过。
   */
  async attachChildToParents(
    tx: Tx,
    input: AttachChildToParentsInput,
  ): Promise<{ family_id: bigint }> {
    const { clan_id, child_id, parent_ids } = input;
    if (parent_ids.length === 0) {
      throw new Error('attachChildToParents: parent_ids 不能为空');
    }

    // 1) 闭包表：self-record + 所有父母（含各自祖先链）
    await this.syncAncestryFromParents(tx, child_id, parent_ids);

    // 2) 定位或创建 FamilyUnit（已传 family_id 则直接使用）
    const familyId =
      input.family_id ?? (await this.findOrCreateFamilyUnit(tx, clan_id, parent_ids));

    // 3) FamilyChild（幂等）
    const existing = await tx.familyChild.findFirst({
      where: { family_id: familyId, child_id },
      select: { id: true },
    });
    if (!existing) {
      const birthOrder = input.birth_order ?? (await this.nextBirthOrder(tx, familyId));
      await tx.familyChild.create({
        data: {
          family_id: familyId,
          child_id,
          birth_order: birthOrder,
          child_type: input.child_type ?? ChildRelationType.BIOLOGICAL,
        },
      });
    }

    return { family_id: familyId };
  }

  /**
   * 仅维护闭包表（PersonAncestry）：self-record + 各父母的祖先链（depth+1）。
   * - 幂等：createMany + skipDuplicates；
   * - 只链接未软删除的祖先（与 tree.service 旧逻辑一致）；
   * - 父/母自身若缺 self-record，兜底建立 (parent, child, 1) 血缘边。
   */
  async syncAncestryFromParents(
    tx: Tx,
    childId: bigint,
    parentIds: bigint[],
  ): Promise<void> {
    const rows: Prisma.PersonAncestryCreateManyInput[] = [];
    const seen = new Set<string>();
    const push = (ancestorId: bigint, descendantId: bigint, depth: number) => {
      const key = `${ancestorId}:${descendantId}`;
      if (seen.has(key)) return;
      seen.add(key);
      rows.push({ ancestor_id: ancestorId, descendant_id: descendantId, depth });
    };

    push(childId, childId, 0);

    for (const pid of parentIds) {
      const parentAncestries = await tx.personAncestry.findMany({
        where: { descendant_id: pid, ancestor: { deleted_at: null } },
        select: { ancestor_id: true, depth: true },
      });
      for (const pa of parentAncestries) {
        push(pa.ancestor_id, childId, pa.depth + 1);
      }
      // 兜底：父/母自身缺失 self-record（历史脏数据）时直接建 (parent, child, 1)
      if (!parentAncestries.some((pa) => pa.ancestor_id === pid)) {
        push(pid, childId, 1);
      }
    }

    // 分批写入，避免大 SQL
    const BATCH = 1000;
    for (let i = 0; i < rows.length; i += BATCH) {
      await tx.personAncestry.createMany({
        data: rows.slice(i, i + BATCH),
        skipDuplicates: true,
      });
    }
  }

  /**
   * 定位或创建 FamilyUnit：
   * - 2 位父母：先精确匹配 (husband_id, wife_id) 任一方位；无则按性别新建（男→夫，女→妻）；
   * - 1 位父母：复用该父母名下的"单亲家庭"（另一侧为 NULL）；无则新建单亲家庭。
   * 说明：FamilyUnit.husband_id / wife_id 均可空（Schema 原生支持），
   * 单亲家庭不会违反唯一约束（Postgres UNIQUE 对 NULL 不去重）。
   */
  private async findOrCreateFamilyUnit(
    tx: Tx,
    clanId: bigint,
    parentIds: bigint[],
  ): Promise<bigint> {
    if (parentIds.length >= 2) {
      const [a, b] = parentIds;
      const matched = await tx.familyUnit.findFirst({
        where: {
          OR: [
            { husband_id: a, wife_id: b },
            { husband_id: b, wife_id: a },
          ],
        },
        select: { id: true },
      });
      if (matched) return matched.id;

      const genders = await this.fetchGenders(tx, parentIds);
      const husbandId = parentIds.find((id) => genders.get(id.toString()) === 'male') ?? a;
      const wifeId = parentIds.find((id) => genders.get(id.toString()) === 'female') ?? b;
      const created = await tx.familyUnit.create({
        data: { clan_id: clanId, husband_id: husbandId, wife_id: wifeId },
      });
      return created.id;
    }

    const [single] = parentIds;
    const matched = await tx.familyUnit.findFirst({
      where: {
        OR: [
          { husband_id: single, wife_id: null },
          { wife_id: single, husband_id: null },
        ],
      },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    if (matched) return matched.id;

    const genders = await this.fetchGenders(tx, parentIds);
    const isMale = genders.get(single.toString()) === 'male';
    const created = await tx.familyUnit.create({
      data: {
        clan_id: clanId,
        husband_id: isMale ? single : null,
        wife_id: isMale ? null : single,
      },
    });
    return created.id;
  }

  /** 该家庭现有子女最大 birth_order + 1（兼容历史 birth_order=0 数据，避免 count+1 撞号） */
  private async nextBirthOrder(tx: Tx, familyId: bigint): Promise<number> {
    const agg = await tx.familyChild.aggregate({
      where: { family_id: familyId },
      _max: { birth_order: true },
    });
    return (agg._max.birth_order ?? 0) + 1;
  }

  private async fetchGenders(
    tx: Tx,
    personIds: bigint[],
  ): Promise<Map<string, string>> {
    const persons = await tx.person.findMany({
      where: { id: { in: personIds } },
      select: { id: true, gender: true },
    });
    return new Map(persons.map((p) => [p.id.toString(), p.gender]));
  }
}
