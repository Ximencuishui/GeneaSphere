import { Injectable, NotFoundException, InternalServerErrorException, BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma, PrismaService, Person, Gender } from '@geneasphere/db';

export interface TreeNode {
  id: string;
  name: string;
  gender: string;
  birth_date?: Date | string;
  death_date?: Date | string;
  is_living: boolean;
  children?: TreeNode[];
  marriages_history?: any[];
  // 当前 + 历史配偶（从 FamilyUnit 推导）由前端画 spouse 边
  spouses?: SpouseInfo[];
  avatar_url?: string;
  thumbnail_url?: string;
  has_photo: boolean;
}

/**
 * 配偶信息（从 FamilyUnit 推导）
 * - id           : 配偶人物 ID
 * - name         : 配偶姓名（冗余存储，前端无须额外查 person 表）
 * - gender       : 配偶性别
 * - family_id    : 所属 FamilyUnit ID（用于创建 Child 时绑定）
 * - marriage_date: 结婚日期
 * - marriage_order: 婚姻序号（1=初婚，2+=再婚）
 * - is_current   : 是否当前婚姻
 * - end_reason   : 婚姻结束原因（离异/丧偶）
 */
export interface SpouseInfo {
  id: string;
  name: string;
  gender: string;
  family_id: string;
  marriage_date?: Date | string | null;
  end_date?: Date | string | null;
  marriage_order: number;
  is_current: boolean;
  end_reason?: string | null;
  note?: string | null;
}

/**
 * 配偶边（用于 G6 图渲染，扁平化到根级）
 * - from / to: 人物 ID
 * - order    : 婚姻序号（同对夫妻多段婚姻会出现多条边）
 * - is_current: 是否当前婚姻
 */
export interface SpouseEdge {
  from: string;
  to: string;
  order: number;
  is_current: boolean;
}

export interface ClanTreeResponse {
  rootNode: TreeNode;
  mainLineage: string[];
  totalPersons: number;
  // 所有配偶边（含初婚/再婚），供 G6 addEdge 使用
  spouseEdges: SpouseEdge[];
}

/**
 * 族谱树服务
 *
 * 性能优化要点：
 * - 使用 PrismaService 依赖注入，复用连接池并享受冷启动重试
 * - findClanRootPerson 用单次查询取出所有 depth=1 关系，本地筛根节点
 * - getSubTree 一次性预取所有 ancestry 与 person 关系，本地构建父子映射
 * - toTreeNode 批量预取所有头像信息（IN 列表查询），消除 N+1
 * - 出口处统一将 BigInt 序列化为字符串，避免 JSON 序列化失败
 */
@Injectable()
export class TreeService {
  constructor(private readonly prisma: PrismaService) {}

  async createPerson(
    data: {
      clan_id: bigint;
      full_name: string;
      gender: Gender;
      birth_date?: Date;
      death_date?: Date;
      is_living?: boolean;
    },
    parent_id?: bigint
  ): Promise<Person> {
    return await this.prisma.$transaction(async (tx) => {
      const person = await tx.person.create({
        data: {
          clan_id: data.clan_id,
          full_name: data.full_name,
          gender: data.gender,
          birth_date: data.birth_date,
          death_date: data.death_date,
          is_living: data.is_living ?? true,
        },
      });

      const ancestryRecords: Prisma.PersonAncestryCreateManyInput[] = [];

      ancestryRecords.push({
        ancestor_id: person.id,
        descendant_id: person.id,
        depth: 0,
      });

      if (parent_id) {
        const parentAncestries = await tx.personAncestry.findMany({
          where: {
            descendant_id: parent_id,
            ancestor: { deleted_at: null },
          },
          select: { ancestor_id: true, depth: true },
        });

        for (const pa of parentAncestries) {
          ancestryRecords.push({
            ancestor_id: pa.ancestor_id,
            descendant_id: person.id,
            depth: pa.depth + 1,
          });
        }
      }

      await tx.personAncestry.createMany({
        data: ancestryRecords,
      });

      return person;
    });
  }

  /**
   * 获取以 rootPersonId 为根的子树
   *
   * 性能优化：
   * - 一次查询取出所有 (ancestor_id, descendant_id, depth) 关系
   * - 一次查询取出所有 person 基础信息（通过 include descendant 一次完成）
   * - 一次查询批量预取所有头像
   * - 一次查询取出所有直接父子关系（depth = 1）
   * - 在内存中构建父子映射
   */
  async getSubTree(rootPersonId: bigint, includeHistoricalMarriages = false): Promise<TreeNode> {
    // 1) 取出该子树的所有 ancestry 记录，过滤软删除节点（仅保留 visible 的 descendant）
    const ancestries = await this.prisma.personAncestry.findMany({
      where: {
        ancestor_id: rootPersonId,
        descendant: { deleted_at: null },
      },
      include: { descendant: true },
      orderBy: { depth: 'asc' },
    });

    // 2) 空族谱：仅根节点
    if (ancestries.length === 0) {
      const person = await this.prisma.person.findUnique({ where: { id: rootPersonId } });
      if (!person) {
        throw new NotFoundException(`Person with id ${rootPersonId} not found`);
      }
      const avatar = await this.findPersonAvatar(person.id);
      return this.toTreeNode(person, avatar);
    }

    // 3) 收集 personId 用于批量查头像（去重）
    const personIds: bigint[] = [];
    const seenIds = new Set<string>();
    for (const record of ancestries) {
      const idStr = record.descendant_id.toString();
      if (seenIds.has(idStr)) continue;
      seenIds.add(idStr);
      personIds.push(record.descendant_id);
    }

    // 4) 批量预取头像
    const avatarMap = await this.batchFindPersonAvatars(personIds);

    // 5) 一次性取出所有直接父子关系（depth = 1），构建 children 列表
    //    同时过滤掉已被软删除的子节点
    const directRelations = await this.prisma.personAncestry.findMany({
      where: {
        ancestor_id: rootPersonId,
        depth: 1,
        descendant: { deleted_at: null },
      },
      select: { ancestor_id: true, descendant_id: true },
    });
    const childMap = new Map<string, string[]>();
    for (const rel of directRelations) {
      const parentKey = rel.ancestor_id.toString();
      if (!childMap.has(parentKey)) childMap.set(parentKey, []);
      childMap.get(parentKey)!.push(rel.descendant_id.toString());
    }

    // 6) 创建所有 node
    const nodeMap = new Map<string, TreeNode>();
    for (const record of ancestries) {
      const idStr = record.descendant_id.toString();
      if (nodeMap.has(idStr)) continue;
      const avatar = avatarMap.get(idStr) || { has_photo: false };
      nodeMap.set(idStr, this.toTreeNode(record.descendant, avatar));
    }

    // 7) 把 children 挂到父节点
    for (const [parentId, childIds] of childMap) {
      const parentNode = nodeMap.get(parentId);
      if (!parentNode) continue;
      const uniqueChildIds = [...new Set(childIds)];
      parentNode.children = uniqueChildIds
        .map((id) => nodeMap.get(id))
        .filter((n): n is TreeNode => n !== undefined);
    }

    // 8) 根节点
    let rootNode = nodeMap.get(rootPersonId.toString());
    if (!rootNode) {
      // 兼容闭包表数据不完整（如种子脚本未写入 self-record）的情况：
      // 退化为直接查 person 表补一个根节点，并将其与已有 descendants 拼成子树
      const fallbackPerson = await this.prisma.person.findUnique({ where: { id: rootPersonId } });
      if (!fallbackPerson) {
        throw new NotFoundException(`Root person with id ${rootPersonId} not found`);
      }
      const fallbackAvatar = await this.findPersonAvatar(fallbackPerson.id);
      rootNode = this.toTreeNode(fallbackPerson, fallbackAvatar);
      nodeMap.set(rootNode.id, rootNode);
      // 同步挂上 children
      const directChildIds = childMap.get(rootNode.id) || [];
      rootNode.children = directChildIds
        .map((id) => nodeMap.get(id))
        .filter((n): n is TreeNode => n !== undefined);
      console.warn(
        `[TreeService] getSubTree: missing self-record for ancestor ${rootPersonId}; used person.findUnique fallback. Please run the self-record fix script to repair the closure table.`,
      );
    }

    // 9) 附加历史婚姻（按需）
    if (includeHistoricalMarriages) {
      const marriages = await this.prisma.marriageHistory.findMany({
        where: { person_id: { in: personIds } },
        include: { spouse: { select: { id: true, full_name: true } } },
        orderBy: { start_date: 'desc' },
      });
      const marriageMap = new Map<string, any[]>();
      for (const m of marriages) {
        const key = m.person_id.toString();
        if (!marriageMap.has(key)) marriageMap.set(key, []);
        marriageMap.get(key)!.push({
          spouse_name: m.spouse.full_name,
          marriage_type: m.marriage_type,
          is_current: m.is_current,
          start_date: m.start_date,
          end_date: m.end_date,
          end_reason: m.end_reason,
        });
      }
      for (const [, node] of nodeMap) {
        node.marriages_history = marriageMap.get(node.id) || [];
      }
    }

    // 10) 从 FamilyUnit 推导当前 + 历史配偶（同时填充 spouses[] 与 spouseEdges）
    //     使用一次查询拉出所有 family，再用 client-side join 避免 N+1
    //     注意：新加字段（is_current/marriage_order/marriage_date/end_reason）
    //     在 Prisma client 重新 generate 之前用 as any 绕过类型检查。
    const familyUnits = (await this.prisma.familyUnit.findMany({
      where: {
        OR: [
          { husband_id: { in: personIds } },
          { wife_id: { in: personIds } },
        ],
      },
      include: {
        husband: { select: { id: true, full_name: true, gender: true } },
        wife: { select: { id: true, full_name: true, gender: true } },
      },
      // orderBy: [{ is_current: 'desc' }, { marriage_order: 'asc' }],
      // 上面是新增字段，client 未更新前用 as any 绕过
      ...({ orderBy: { id: 'asc' as const } } as any),
    })) as any[];

    const spouseMap = new Map<string, SpouseInfo[]>();
    for (const fam of familyUnits) {
      if (fam.husband_id && fam.wife_id) {
        const hId = fam.husband_id.toString();
        const wId = fam.wife_id.toString();
        // husband → wife
        const wifeInfo: SpouseInfo = {
          id: wId,
          name: fam.wife.full_name,
          gender: fam.wife.gender,
          family_id: fam.id.toString(),
          marriage_date: fam.marriage_date ?? null,
          end_date: fam.end_date ?? null,
          marriage_order: fam.marriage_order ?? 1,
          is_current: fam.is_current ?? true,
          end_reason: fam.end_reason ?? null,
          note: fam.note ?? null,
        };
        const husbandInfo: SpouseInfo = {
          id: hId,
          name: fam.husband.full_name,
          gender: fam.husband.gender,
          family_id: fam.id.toString(),
          marriage_date: fam.marriage_date ?? null,
          end_date: fam.end_date ?? null,
          marriage_order: fam.marriage_order ?? 1,
          is_current: fam.is_current ?? true,
          end_reason: fam.end_reason ?? null,
          note: fam.note ?? null,
        };
        if (!spouseMap.has(hId)) spouseMap.set(hId, []);
        if (!spouseMap.has(wId)) spouseMap.set(wId, []);
        spouseMap.get(hId)!.push(wifeInfo);
        spouseMap.get(wId)!.push(husbandInfo);
      }
    }

    for (const [, node] of nodeMap) {
      node.spouses = spouseMap.get(node.id) || [];
    }

    return rootNode;
  }

  /**
   * 获取完整族谱树数据（含主传承线路、头像、总人数、配偶边）
   */
  async getClanFullTree(clanId: bigint, userId?: string): Promise<ClanTreeResponse> {
    // 1) 根节点：单次查询
    const rootPerson = await this.findClanRootPerson(clanId);
    if (!rootPerson) {
      throw new NotFoundException(`No root person found for clan ${clanId}`);
    }

    // 2) 子树（含 spouses）
    const rootNode = await this.getSubTree(rootPerson.id);

    // 3) 主传承线路（按需）
    let mainLineage: string[] = [];
    if (userId) {
      mainLineage = await this.findMainLineagePath(clanId, rootPerson.id, userId);
    }

    // 4) 总人数
    const totalPersons = await this.prisma.person.count({
      where: { clan_id: clanId },
    });

    // 5) 收集全部配偶边（遍历树中所有节点的 spouses，扁平化为 SpouseEdge[]）
    const spouseEdges: SpouseEdge[] = [];
    const visitedPairs = new Set<string>();
    const walk = (n: TreeNode) => {
      if (n.spouses) {
        for (const s of n.spouses) {
          // 幂等：同对夫妻只出一条边（使用婚姻序号区分再婚）
          const pairKey = `${Math.min(Number(n.id), Number(s.id))}-${Math.max(Number(n.id), Number(s.id))}-${s.marriage_order}`;
          if (visitedPairs.has(pairKey)) continue;
          visitedPairs.add(pairKey);
          spouseEdges.push({
            from: n.id,
            to: s.id,
            order: s.marriage_order,
            is_current: s.is_current,
          });
        }
      }
      if (n.children) n.children.forEach(walk);
    };
    walk(rootNode);

    return {
      rootNode: this.serializeBigInt(rootNode),
      mainLineage,
      totalPersons,
      spouseEdges,
    };
  }

  /**
   * 单次查询定位族谱根节点（无父母的人）
   */
  private async findClanRootPerson(clanId: bigint): Promise<Person | null> {
    const persons = await this.prisma.person.findMany({
      where: { clan_id: clanId, deleted_at: null },
      orderBy: { id: 'asc' },
    });
    if (persons.length === 0) return null;

    // 一次性查族内所有 depth=1 的 ancestry，本地筛出"有父母"的 person
    const directDescendantIds = await this.prisma.personAncestry.findMany({
      where: {
        depth: 1,
        descendant_id: { in: persons.map((p) => p.id) },
        ancestor: { deleted_at: null },
      },
      select: { descendant_id: true },
    });
    const hasParentSet = new Set(directDescendantIds.map((d) => d.descendant_id.toString()));

    for (const person of persons) {
      if (!hasParentSet.has(person.id.toString())) {
        return person;
      }
    }
    return persons[0];
  }

  /**
   * 主传承路径：从族谱根到用户关联人物（或退回到族内最远支系末端）
   */
  private async findMainLineagePath(
    clanId: bigint,
    rootPersonId: bigint,
    userId: string,
  ): Promise<string[]> {
    const userLink = await this.prisma.personUserLink.findFirst({
      where: {
        user_id: userId,
        person: { clan_id: clanId },
      },
      include: { person: true },
    });

    if (!userLink) {
      const lastDescendant = await this.prisma.personAncestry.findFirst({
        where: { ancestor_id: rootPersonId },
        orderBy: { depth: 'desc' },
        select: { descendant_id: true },
      });
      if (!lastDescendant) return [rootPersonId.toString()];
      return this.buildLineagePath(lastDescendant.descendant_id, rootPersonId);
    }

    return this.buildLineagePath(userLink.person.id, rootPersonId);
  }

  /**
   * 从 fromPersonId 沿直接父链回溯到 toAncestorId
   */
  private async buildLineagePath(
    fromPersonId: bigint,
    toAncestorId: bigint,
  ): Promise<string[]> {
    const path: string[] = [];
    let currentId: bigint = fromPersonId;
    path.push(currentId.toString());
    let safety = 100;

    while (currentId !== toAncestorId && safety > 0) {
      safety--;
      const directParent = await this.getDirectParent(currentId);
      if (!directParent) break;
      path.unshift(directParent.toString());
      currentId = directParent;
    }
    return path;
  }

  /**
   * 批量预取头像：单次查询取出所有 person 的 media link
   */
  private async batchFindPersonAvatars(
    personIds: bigint[],
  ): Promise<Map<string, { avatar_url?: string; thumbnail_url?: string; has_photo: boolean }>> {
    const map = new Map<string, { avatar_url?: string; thumbnail_url?: string; has_photo: boolean }>();
    if (personIds.length === 0) return map;

    try {
      const links = await this.prisma.mediaPersonLink.findMany({
        where: { person_id: { in: personIds } },
        include: { media: { select: { file_url: true, created_at: true } } },
        orderBy: { media: { created_at: 'desc' } },
      });

      // 为每个人保留最新一张图
      const perPersonFirst = new Map<string, (typeof links)[number]>();
      for (const link of links) {
        const key = link.person_id.toString();
        if (!perPersonFirst.has(key)) {
          perPersonFirst.set(key, link);
        }
      }
      for (const [personIdStr, link] of perPersonFirst) {
        const fileUrl = link.media.file_url;
        const parts = fileUrl.split('/');
        const filename = parts[parts.length - 1];
        const extIndex = filename.lastIndexOf('.');
        const basename = extIndex > -1 ? filename.substring(0, extIndex) : filename;
        const ext = extIndex > -1 ? filename.substring(extIndex) : '.jpg';
        map.set(personIdStr, {
          avatar_url: fileUrl,
          thumbnail_url: `/media/thumbnails/${basename}_80w${ext}`,
          has_photo: true,
        });
      }
    } catch (err) {
      console.warn('[TreeService] batchFindPersonAvatars failed:', err);
    }
    return map;
  }

  /**
   * 单人头像查询（兼容旧调用）
   */
  private async findPersonAvatar(
    personId: bigint,
  ): Promise<{ avatar_url?: string; thumbnail_url?: string; has_photo: boolean }> {
    const map = await this.batchFindPersonAvatars([personId]);
    return map.get(personId.toString()) || { has_photo: false };
  }

  private async getDirectParent(personId: bigint): Promise<bigint | null> {
    const parentAncestry = await this.prisma.personAncestry.findFirst({
      where: {
        descendant_id: personId,
        depth: 1,
        ancestor: { deleted_at: null },
      },
      select: { ancestor_id: true },
    });
    return parentAncestry?.ancestor_id ?? null;
  }

  private toTreeNode(
    person: Person,
    avatarInfo: { avatar_url?: string; thumbnail_url?: string; has_photo: boolean } = { has_photo: false },
  ): TreeNode {
    return {
      id: person.id.toString(),
      name: person.full_name,
      gender: person.gender,
      birth_date: person.birth_date,
      death_date: person.death_date,
      is_living: person.is_living,
      children: [],
      avatar_url: avatarInfo.avatar_url,
      thumbnail_url: avatarInfo.thumbnail_url,
      has_photo: avatarInfo.has_photo,
    };
  }

  /**
   * BigInt 序列化：递归把对象内 BigInt 转为 string
   * （前端 axios 默认无法解析 BigInt，统一在此处转字符串）
   */
  private serializeBigInt<T>(value: T): T {
    if (typeof value === 'bigint') return value.toString() as unknown as T;
    if (value === null || value === undefined) return value;
    if (Array.isArray(value)) {
      return value.map((v) => this.serializeBigInt(v)) as unknown as T;
    }
    if (typeof value === 'object') {
      const out: any = {};
      for (const [k, v] of Object.entries(value)) {
        out[k] = this.serializeBigInt(v);
      }
      return out as T;
    }
    return value;
  }

  /**
   * 血缘合法性校验：检查两人是否有共同祖先（含双方自己）
   *
   * 族谱创建婚姻/编辑关系时调用：
   * - isConsanguineous(a, b) === true  → 有共同祖先（近亲），应拒绝
   * - isConsanguineous(a, b) === false → 无血缘关系，可以结婚
   *
   * 算法（O(N) 单次查询）：
   * 1. 取 a 的所有祖先 (ancestor_id = a)，depth > 0（排除自己本身以外的祖先）
   * 2. 取 b 的所有祖先（同样的查询）
   * 3. 取交集：交集不为空 → 有共同祖先（注意：每个人自己的 (self, depth=0) 总是会
   *    与自己相交，逻辑上需要排除；这里我们查询 depth > 0 即可排除）
   * 4. 同时检查 a 与 b 是否互为祖先-后代（直接亲缘）
   */
  async isConsanguineous(personAId: bigint, personBId: bigint): Promise<{
    isConsanguineous: boolean;
    commonAncestors: { ancestor_id: string; from_a_depth: number; from_b_depth: number }[];
    relationship?: 'self' | 'parent-child' | 'sibling' | 'grandparent-grandchild' | 'cousin' | 'uncle-nephew' | 'other';
  }> {
    if (personAId === personBId) {
      return { isConsanguineous: true, commonAncestors: [], relationship: 'self' };
    }

    // 一次查询取 a 与 b 的祖先集合（depth > 0，排除自身）
    const ancestries = await this.prisma.personAncestry.findMany({
      where: {
        descendant_id: { in: [personAId, personBId] },
        depth: { gt: 0 },
        ancestor: { deleted_at: null },
      },
      select: { ancestor_id: true, descendant_id: true, depth: true },
    });

    // 分桶：a 的祖先 vs b 的祖先
    const aAncestors = new Map<string, number>(); // ancestor_id -> depth from a
    const bAncestors = new Map<string, number>();
    for (const r of ancestries) {
      const isA = r.descendant_id === personAId;
      const map = isA ? aAncestors : bAncestors;
      map.set(r.ancestor_id.toString(), r.depth);
    }

    // 找交集
    const common: { ancestor_id: string; from_a_depth: number; from_b_depth: number }[] = [];
    for (const [aid, aDepth] of aAncestors) {
      const bDepth = bAncestors.get(aid);
      if (bDepth !== undefined) {
        common.push({
          ancestor_id: aid,
          from_a_depth: aDepth,
          from_b_depth: bDepth,
        });
      }
    }

    if (common.length === 0) {
      return { isConsanguineous: false, commonAncestors: [] };
    }

    // 判断具体亲缘关系
    let relationship: 'self' | 'parent-child' | 'sibling' | 'grandparent-grandchild' | 'cousin' | 'uncle-nephew' | 'other' = 'other';
    // 找最近的共同祖先（depth 之和最小）
    let minCommon = common[0];
    let minSum = common[0].from_a_depth + common[0].from_b_depth;
    for (let i = 1; i < common.length; i++) {
      const s = common[i].from_a_depth + common[i].from_b_depth;
      if (s < minSum) {
        minCommon = common[i];
        minSum = s;
      }
    }

    // 彼此是对方祖先（直接亲缘）：a 是 b 的祖先 or b 是 a 的祖先
    if (aAncestors.has(personBId.toString())) {
      relationship = 'parent-child';
    } else if (bAncestors.has(personAId.toString())) {
      relationship = 'parent-child';
    } else if (minCommon.from_a_depth === 1 && minCommon.from_b_depth === 1) {
      relationship = 'sibling';
    } else if (minCommon.from_a_depth === 1 && minCommon.from_b_depth === 2) {
      relationship = 'uncle-nephew';
    } else if (minCommon.from_a_depth === 2 && minCommon.from_b_depth === 1) {
      relationship = 'uncle-nephew';
    } else if (minCommon.from_a_depth === 1 && minCommon.from_b_depth === 1) {
      // 已在上方覆盖
    } else if (minCommon.from_a_depth === 2 && minCommon.from_b_depth === 2) {
      relationship = 'cousin';
    }

    return {
      isConsanguineous: true,
      commonAncestors: common,
      relationship,
    };
  }

  /**
   * 创建婚姻（FamilyUnit），含血缘校验
   * - 拒绝近亲结婚
   * - 自动检测婚姻序号（同对夫妻多段再婚）
   */
  async createMarriage(data: {
    clan_id: bigint;
    husband_id: bigint;
    wife_id: bigint;
    marriage_date?: Date;
    end_date?: Date;
    end_reason?: 'divorce' | 'widowed' | null;
    is_current?: boolean;
    note?: string;
  }): Promise<{ id: bigint; marriage_order: number }> {
    if (!data.husband_id || !data.wife_id) {
      throw new BadRequestException('Both husband_id and wife_id are required');
    }
    if (data.husband_id === data.wife_id) {
      throw new BadRequestException('Cannot marry oneself');
    }

    // 血缘校验
    const kinship = await this.isConsanguineous(data.husband_id, data.wife_id);
    if (kinship.isConsanguineous) {
      throw new ConflictException({
        code: 'CONSANGUINEOUS_MARRIAGE',
        message: `禁止近亲结婚：${kinship.relationship} 关系`,
        relationship: kinship.relationship,
        commonAncestors: kinship.commonAncestors.slice(0, 5),
      });
    }

    return await this.prisma.$transaction(async (tx) => {
      // 找现有的同对夫妻记录，确定下一个 marriage_order
      // 新字段 marriage_order 暂未在 Prisma client 中，用 as any 绕过
      const existing = (await tx.familyUnit.findMany({
        where: {
          husband_id: data.husband_id,
          wife_id: data.wife_id,
        },
        orderBy: { id: 'desc' } as any,
      })) as any[];
      const nextOrder =
        existing.length > 0 && existing[0].marriage_order != null
          ? existing[0].marriage_order + 1
          : 1;

      // 把上一段"当前婚姻"标记为非当前（如果存在）
      if (data.is_current !== false) {
        await (tx.familyUnit.updateMany as any)({
          where: {
            husband_id: data.husband_id,
            wife_id: data.wife_id,
            is_current: true,
          },
          data: { is_current: false },
        });
      }

      const family = (await tx.familyUnit.create({
        data: {
          clan_id: data.clan_id,
          husband_id: data.husband_id,
          wife_id: data.wife_id,
          marriage_date: data.marriage_date,
          marriage_order: nextOrder,
          divorce_date: data.end_date ?? null,
          end_reason: data.end_reason ?? null,
          is_current: data.is_current ?? true,
          note: data.note,
        } as any,
        select: { id: true, marriage_order: true } as any,
      })) as any;

      return { id: family.id, marriage_order: family.marriage_order };
    });
  }

  /**
   * 更新人物基础信息（用于侧栏编辑）
   * 软删除逻辑也走这里（is_living=false）
   */
  async updatePerson(
    personId: bigint,
    updates: {
      full_name?: string;
      gender?: Gender;
      birth_date?: Date | null;
      death_date?: Date | null;
      is_living?: boolean;
      birth_place?: string | null;
      death_place?: string | null;
      migration_branch?: string | null;
    },
  ): Promise<Person> {
    return await this.prisma.person.update({
      where: { id: personId },
      data: {
        ...(updates.full_name !== undefined && { full_name: updates.full_name }),
        ...(updates.gender !== undefined && { gender: updates.gender }),
        ...(updates.birth_date !== undefined && { birth_date: updates.birth_date }),
        ...(updates.death_date !== undefined && { death_date: updates.death_date }),
        ...(updates.is_living !== undefined && { is_living: updates.is_living }),
        ...(updates.birth_place !== undefined && { birth_place: updates.birth_place }),
        ...(updates.death_place !== undefined && { death_place: updates.death_place }),
        ...(updates.migration_branch !== undefined && { migration_branch: updates.migration_branch }),
      },
    });
  }

  /**
   * 取 person 所属 clan_id（用于 controller 做权限校验）
   * - 默认过滤软删除；restorePerson 需拿到已删除节点的 clan_id，可传 includeDeleted=true
   * - 返回 null 表示 person 不存在
   */
  async getPersonClanId(
    personId: bigint,
    opts: { includeDeleted?: boolean } = {},
  ): Promise<bigint | null> {
    const person = await this.prisma.person.findUnique({
      where: { id: personId },
      select: { clan_id: true, deleted_at: true },
    });
    if (!person) return null;
    if (person.deleted_at && !opts.includeDeleted) return null;
    return person.clan_id;
  }

  /**
   * 取 FamilyUnit 所属 clan_id（用于 controller 做权限校验）
   * - 返回 null 表示 family 不存在
   */
  async getFamilyClanId(familyId: bigint): Promise<bigint | null> {
    const fam = await this.prisma.familyUnit.findUnique({
      where: { id: familyId },
      select: { clan_id: true },
    });
    return fam?.clan_id ?? null;
  }

  /**
   * 软删除人物（用于撤销「创建人物」「删除合并」等操作）
   * - 仅设置 deleted_at，保留数据完整性（FamilyChild / PersonAncestry 不动）
   * - Ancestry 是「节点可达性」索引，与 Person 的 deleted_at 解耦：
   *   应用层在查询 Person 时统一过滤 deleted_at IS NULL，PersonAncestry 保留历史
   *   可达性，这样恢复时无需重建任何 ancestry 记录。
   * - 撤销栈的 undo 调用本方法后 5 秒内调 restorePerson 即可完全恢复。
   *
   * 注意：业务主流程的删除走 FamilyRelationChange 审核流程，
   * 这里只用于「撤销栈」自动回滚。
   */
  async softDeletePerson(personId: bigint, deletedBy?: string): Promise<void> {
    await this.prisma.person.update({
      where: { id: personId },
      data: {
        deleted_at: new Date(),
        deleted_by: deletedBy ?? null,
      },
    });
  }

  /**
   * 恢复已软删除的人物（用于撤销「删除人物」）
   * - Ancestry 表未动，只需清除 deleted_at 即可恢复节点可见性
   * - 整个过程包在事务里，避免与并发修改冲突
   *
   * 与历史实现的区别：
   * - 旧版在软删除时会一并删 ancestry，导致撤销需要复杂重建（容易遗漏孙辈 / 叔辈）
   * - 新版删/恢复都不动 ancestry，保证 soft delete 是「原子 + 可逆」操作
   */
  async restorePerson(personId: bigint): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.person.update({
        where: { id: personId },
        data: { deleted_at: null, deleted_by: null },
      });
    });
  }

  /**
   * 删除婚姻（用于撤销「创建婚姻」）
   * - 仅删除 FamilyUnit 本身；FamilyChild 关联由 onDelete: Cascade 自动清理
   */
  async deleteFamilyUnit(familyId: bigint): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const family = await tx.familyUnit.findUnique({
        where: { id: familyId },
        select: { id: true },
      });
      if (!family) throw new NotFoundException(`Family ${familyId} not found`);
      const childCount = await tx.familyChild.count({ where: { family_id: familyId } });
      if (childCount > 0) {
        throw new ConflictException(
          `婚姻 ${familyId} 拥有 ${childCount} 名子女，无法直接删除；请先删除或转移子女记录`,
        );
      }
      await tx.familyUnit.delete({ where: { id: familyId } });
    });
  }

  /**
   * 获取单个人物详情（含父母、子女、配偶）
   * 用于 PersonEditDrawer 顶部信息卡 + 关系列表
   */
  async getPersonDetail(personId: bigint): Promise<{
    person: Person;
    parents: { id: string; full_name: string; gender: string }[];
    spouses: SpouseInfo[];
    children: { id: string; full_name: string; gender: string; birth_year?: number }[];
  }> {
    const person = await this.prisma.person.findUnique({ where: { id: personId } });
    if (!person) throw new NotFoundException(`Person ${personId} not found`);
    // 如果当前人物本身被软删，提示友好
    if (person.deleted_at) {
      throw new NotFoundException(`Person ${personId} has been deleted`);
    }

    // 父母：depth=1 的祖先（过滤软删除）
    const parentRows = await this.prisma.personAncestry.findMany({
      where: {
        descendant_id: personId,
        depth: 1,
        ancestor: { deleted_at: null },
      },
      select: {
        ancestor: { select: { id: true, full_name: true, gender: true } },
      },
    });
    const parents = parentRows.map(r => ({
      id: r.ancestor.id.toString(),
      full_name: r.ancestor.full_name,
      gender: r.ancestor.gender,
    }));

    // 子女：person 当 ancestor 时 depth=1 的后代（过滤软删除）
    const childRows = await this.prisma.personAncestry.findMany({
      where: {
        ancestor_id: personId,
        depth: 1,
        descendant: { deleted_at: null },
      },
      select: {
        descendant: {
          select: {
            id: true, full_name: true, gender: true, birth_date: true,
          },
        },
      },
    });
    const children = childRows.map(r => ({
      id: r.descendant.id.toString(),
      full_name: r.descendant.full_name,
      gender: r.descendant.gender,
      birth_year: r.descendant.birth_date ? new Date(r.descendant.birth_date).getFullYear() : undefined,
    }));

    // 配偶：复用 getSubTree 中的逻辑
    const familyUnits = (await this.prisma.familyUnit.findMany({
      where: {
        OR: [{ husband_id: personId }, { wife_id: personId }],
      },
      include: {
        husband: { select: { id: true, full_name: true, gender: true } },
        wife: { select: { id: true, full_name: true, gender: true } },
      },
    })) as any[];

    const spouses: SpouseInfo[] = [];
    for (const fam of familyUnits) {
      const isHusband = fam.husband_id === personId;
      const other = isHusband ? fam.wife : fam.husband;
      if (!other) continue;
      spouses.push({
        id: other.id.toString(),
        name: other.full_name,
        gender: other.gender,
        family_id: fam.id.toString(),
        marriage_date: fam.marriage_date ?? null,
        end_date: fam.end_date ?? null,
        marriage_order: fam.marriage_order ?? 1,
        is_current: fam.is_current ?? true,
        end_reason: fam.end_reason ?? null,
        note: fam.note ?? null,
      });
    }

    return {
      person,
      parents,
      spouses,
      children,
    };
  }

  /**
   * 移动子树（父节点变更）
   * - 维护 PersonAncestry 闭包表
   * - 禁止把子树移动到自身或其后代下
   */
  async moveSubTree(subtreeRootId: bigint, newParentId: bigint): Promise<void> {
    return await this.prisma.$transaction(async (tx) => {
      const subtreeDescendants = await tx.personAncestry.findMany({
        where: { ancestor_id: subtreeRootId },
        select: { descendant_id: true },
      });

      const allSubtreeIds = subtreeDescendants.map((d) => d.descendant_id);

      if (allSubtreeIds.includes(newParentId)) {
        throw new InternalServerErrorException(
          'Cannot move subtree to itself or a descendant',
        );
      }

      const oldPaths = await tx.personAncestry.findMany({
        where: {
          descendant_id: { in: allSubtreeIds },
        },
      });

      const oldAncestorIds = [...new Set(oldPaths.map((p) => p.ancestor_id))];
      const nonSubtreeAncestors = oldAncestorIds.filter(
        (id) => !allSubtreeIds.includes(id),
      );

      await tx.personAncestry.deleteMany({
        where: {
          descendant_id: { in: allSubtreeIds },
          ancestor_id: { in: nonSubtreeAncestors },
        },
      });

      const newParentAncestries = await tx.personAncestry.findMany({
        where: { descendant_id: newParentId },
        select: { ancestor_id: true, depth: true },
      });

      const newAncestryRecords: Prisma.PersonAncestryCreateManyInput[] = [];

      for (const subtreeId of allSubtreeIds) {
        const selfRecord = oldPaths.find(
          (p) => p.ancestor_id === subtreeId && p.descendant_id === subtreeId,
        );

        if (selfRecord) {
          newAncestryRecords.push({
            ancestor_id: selfRecord.ancestor_id,
            descendant_id: selfRecord.descendant_id,
            depth: selfRecord.depth,
          });
        }

        const subtreeInternalPaths = oldPaths.filter(
          (p) =>
            p.descendant_id === subtreeId &&
            allSubtreeIds.includes(p.ancestor_id) &&
            p.ancestor_id !== subtreeId,
        );

        for (const internalPath of subtreeInternalPaths) {
          newAncestryRecords.push({
            ancestor_id: internalPath.ancestor_id,
            descendant_id: internalPath.descendant_id,
            depth: internalPath.depth,
          });
        }

        const subtreeRootDepth =
          oldPaths.find(
            (p) =>
              p.ancestor_id === subtreeRootId && p.descendant_id === subtreeId,
          )?.depth ?? 0;

        for (const parentAncestry of newParentAncestries) {
          newAncestryRecords.push({
            ancestor_id: parentAncestry.ancestor_id,
            descendant_id: subtreeId,
            depth: parentAncestry.depth + 1 + subtreeRootDepth,
          });
        }
      }

      await tx.personAncestry.createMany({
        data: newAncestryRecords,
        skipDuplicates: true,
      });
    });
  }
}
