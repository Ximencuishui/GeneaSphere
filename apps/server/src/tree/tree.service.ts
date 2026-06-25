import { Injectable, NotFoundException, InternalServerErrorException } from '@nestjs/common';
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
  avatar_url?: string;
  thumbnail_url?: string;
  has_photo: boolean;
}

export interface ClanTreeResponse {
  rootNode: TreeNode;
  mainLineage: string[];
  totalPersons: number;
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
          where: { descendant_id: parent_id },
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
    // 1) 取出该子树的所有 ancestry 记录
    const ancestries = await this.prisma.personAncestry.findMany({
      where: { ancestor_id: rootPersonId },
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
    const directRelations = await this.prisma.personAncestry.findMany({
      where: {
        ancestor_id: rootPersonId,
        depth: 1,
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

    return rootNode;
  }

  /**
   * 获取完整族谱树数据（含主传承线路、头像、总人数）
   */
  async getClanFullTree(clanId: bigint, userId?: string): Promise<ClanTreeResponse> {
    // 1) 根节点：单次查询
    const rootPerson = await this.findClanRootPerson(clanId);
    if (!rootPerson) {
      throw new NotFoundException(`No root person found for clan ${clanId}`);
    }

    // 2) 子树
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

    return {
      rootNode: this.serializeBigInt(rootNode),
      mainLineage,
      totalPersons,
    };
  }

  /**
   * 单次查询定位族谱根节点（无父母的人）
   */
  private async findClanRootPerson(clanId: bigint): Promise<Person | null> {
    const persons = await this.prisma.person.findMany({
      where: { clan_id: clanId },
      orderBy: { id: 'asc' },
    });
    if (persons.length === 0) return null;

    // 一次性查族内所有 depth=1 的 ancestry，本地筛出"有父母"的 person
    const directDescendantIds = await this.prisma.personAncestry.findMany({
      where: {
        depth: 1,
        descendant_id: { in: persons.map((p) => p.id) },
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

  async moveSubTree(subtreeRootId: bigint, newParentId: bigint): Promise<void> {
    return await this.prisma.$transaction(async (tx) => {
      const subtreeDescendants = await tx.personAncestry.findMany({
        where: { ancestor_id: subtreeRootId },
        select: { descendant_id: true },
      });

      const allSubtreeIds = subtreeDescendants.map((d) => d.descendant_id);

      if (allSubtreeIds.includes(newParentId)) {
        throw new InternalServerErrorException('Cannot move subtree to itself or a descendant');
      }

      const oldPaths = await tx.personAncestry.findMany({
        where: {
          descendant_id: { in: allSubtreeIds },
        },
      });

      const oldAncestorIds = [...new Set(oldPaths.map((p) => p.ancestor_id))];
      const nonSubtreeAncestors = oldAncestorIds.filter((id) => !allSubtreeIds.includes(id));

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
            (p) => p.ancestor_id === subtreeRootId && p.descendant_id === subtreeId,
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
