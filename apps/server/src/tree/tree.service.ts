import { Injectable, NotFoundException, InternalServerErrorException, BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma, PrismaService, Person, Gender } from '@geneasphere/db';
import { serializeBigInt } from '../common/bigint-serializer';
import { PedigreeService } from '../pedigree/pedigree.service';

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
  // 是否属于主传承线路（由 getClanFullTree 根据 mainLineage 回填）
  is_main_lineage?: boolean;
  // [树谱增强 2026-08-17] 与 children[] 一一对应（同下标）的子女边元数据：
  // 排行 / 过继类型 / 所属家庭 / 父、母归属。吊线图"各妻子女分别分支"、排行展示、
  // 过继虚线、过滤开关（隐藏女儿/女婿）全部依赖此字段。
  child_links?: ChildLink[];
}

/**
 * 子女边元数据（从 FamilyChild + FamilyUnit 推导，决策清单 §E2）
 * - child_id    : 对应 children[] 里的节点 id
 * - birth_order : 排行（FamilyChild.birth_order）
 * - child_type  : BIOLOGICAL(亲生) | ADOPTED(收养) | STEP(继子女) | FOSTER(寄养/过继)
 * - family_id   : 所属 FamilyUnit id
 * - father_id / mother_id : 该家庭中的夫/妻 id（子女从哪个父/母分支）
 */
export interface ChildLink {
  child_id: string;
  birth_order?: number;
  child_type?: string;
  family_id?: string;
  father_id?: string;
  mother_id?: string;
}

/** 内部结构：ChildLink 的原始记录（含夫/妻 id，用于归属匹配） */
interface ChildLinkEntry {
  child_id: string;
  birth_order?: number;
  child_type?: string;
  family_id: string;
  father_id?: string;
  mother_id?: string;
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
  // [渐进加载 2026-08-20] limit>0 时：是否只返回了核心子集（true 表示全族人数超过首屏上限）
  isPartial?: boolean;
  // [渐进加载 2026-08-20] limit>0 时：本次实际返回的节点数（核心子集大小）
  shownPersons?: number;
}

/** [渐进加载 2026-08-20] 逐批追加渲染：一批新增节点的单条记录 */
export interface ClanBatchItem {
  /** 新节点（children / child_links 已剥离，尚未加载其子树） */
  node: TreeNode;
  /** 父节点 id（父节点必定已加载，前端据此挂载） */
  parentId: string;
  /** 父节点 → 该节点的子女边元数据（排行/过继类型/父、母归属），前端补进父节点 child_links */
  childLink?: ChildLink;
}

/** [渐进加载 2026-08-20] 逐批追加渲染：下一批节点的响应 */
export interface ClanNextBatchResponse {
  items: ClanBatchItem[];
  totalPersons: number;
  /** 加载至今的树节点总数（offset + items.length） */
  shownPersons: number;
  /** 是否还有未加载的树节点 */
  isPartial: boolean;
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly pedigreeService: PedigreeService,
  ) {}

  /**
   * 创建人物；传 parent_id 时同时建立亲子关系。
   * [双写一致性 2026-08-17] 亲子关系（PersonAncestry + FamilyChild/FamilyUnit）
   * 统一委托 PedigreeService.attachChildToParents（决策清单 §H1），
   * 保证树谱新增的人物也具备排行/过继类型（FamilyChild），与册谱世录口径一致。
   */
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

      if (parent_id) {
        await this.pedigreeService.attachChildToParents(tx, {
          clan_id: data.clan_id,
          child_id: person.id,
          parent_ids: [parent_id],
        });
      } else {
        // 顶层祖先：仅写 self-record
        await tx.personAncestry.createMany({
          data: [{ ancestor_id: person.id, descendant_id: person.id, depth: 0 }],
          skipDuplicates: true,
        });
      }

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

    // 5) 一次性取出子树中所有 depth = 1 的血缘关系，构建每个节点的 children 列表
    //    修正点（原 bug：只查 ancestor_id = rootPersonId，grandchildren 的关系被遗漏，导致只有1代）：
    //    子树中任意一人 P 的直接子女 = (ancestor_id = P.id AND depth = 1) 在 person_ancestry 里的记录。
    //    既然 personIds 已经是子树的全部人员，只要对 ancestor_id IN personIds AND depth = 1 一次性查，
    //    就能拿到整棵子树的父子映射，避免 N+1。
    const directRelations = await this.prisma.personAncestry.findMany({
      where: {
        ancestor_id: { in: personIds },
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
    //    [树谱增强 2026-08-17] 同步透出 child_links（排行/过继类型/父、母归属）
    const subtreeClanId = ancestries[0].descendant.clan_id;
    const childLinkMap = await this.buildChildLinksMap(subtreeClanId, personIds);
    for (const [parentId, childIds] of childMap) {
      const parentNode = nodeMap.get(parentId);
      if (!parentNode) continue;
      const uniqueChildIds = [...new Set(childIds)];
      parentNode.children = uniqueChildIds
        .map((id) => nodeMap.get(id))
        .filter((n): n is TreeNode => n !== undefined);
      parentNode.child_links = this.buildNodeChildLinks(parentId, uniqueChildIds, childLinkMap);
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
      rootNode.child_links = this.buildNodeChildLinks(rootNode.id, directChildIds, childLinkMap);
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
   * 性能优化：避免闭包表 O(N²) 查询，改用直接父子关系查询
   *
   * @param maxDepth 深度限制。0 表示全部加载；正数表示只加载到指定代数。
   * @param limit 节点数上限（渐进加载首屏优化）。>0 表示只返回按「主脉优先 + 层级 BFS」
   *              截取的前 limit 个核心节点；0 表示全量返回。
   */
  async getClanFullTree(
    clanId: bigint,
    userId?: string,
    maxDepth: number = 0,
    limit: number = 0,
  ): Promise<ClanTreeResponse> {
    const startTime = Date.now();
    console.log(`[TreeService] getClanFullTree start: clanId=${clanId}, maxDepth=${maxDepth}, limit=${limit}`);

    // 1) 根节点：单次查询
    const rootPerson = await this.findClanRootPerson(clanId);
    if (!rootPerson) {
      throw new NotFoundException(`No root person found for clan ${clanId}`);
    }
    console.log(`[TreeService] findClanRootPerson: ${Date.now() - startTime}ms`);

    // 2) 优化版子树查询（避免闭包表爆炸），支持深度限制
    const rootNode = await this.getClanTreeOptimized(clanId, rootPerson.id, maxDepth);
    console.log(`[TreeService] getClanTreeOptimized: ${Date.now() - startTime}ms`);

    // 3) 主传承线路（始终计算；有 userId 时优先走用户关联人物，否则退回到族内最远支系末端）
    const mainLineage = await this.findMainLineagePath(clanId, rootPerson.id, userId);

    // 3.1) 把主传承线路标记回写到树节点，供前端布局引擎识别主脉
    const mainLineageSet = new Set(mainLineage.map((id) => id.toString()));
    const markMainLineage = (n: TreeNode) => {
      n.is_main_lineage = mainLineageSet.has(n.id);
      if (n.children) n.children.forEach(markMainLineage);
    };
    markMainLineage(rootNode);

    // 4) 渐进加载：limit>0 时按「主脉优先 + 层级 BFS」截取核心子集
    let finalRootNode = rootNode;
    let shownPersons = 0;
    if (limit > 0) {
      finalRootNode = this.truncateTreeByPriority(rootNode, limit, mainLineageSet);
      shownPersons = this.countNodesInTree(finalRootNode);
    }
    console.log(`[TreeService] truncateByLimit: ${Date.now() - startTime}ms, shownPersons=${shownPersons}`);

    // 5) 总人数（limit 模式：始终返回全族真实总数，供前端展示「共 Y 人」）
    let totalPersons: number;
    if (limit > 0 || maxDepth === 0) {
      totalPersons = await this.prisma.person.count({
        where: { clan_id: clanId, deleted_at: null },
      });
    } else {
      totalPersons = this.countNodesInTree(rootNode);
    }

    // 6) 收集根节点的配偶边（[I-1 修复 2026-08-01] 子节点配偶由前端按需 getPersonDetail 获取）
    const spouseEdges: SpouseEdge[] = [];
    for (const spouse of finalRootNode.spouses || []) {
      spouseEdges.push({
        from: finalRootNode.id,
        to: spouse.id,
        order: spouse.marriage_order,
        is_current: spouse.is_current,
      });
    }

    console.log(`[TreeService] getClanFullTree complete: ${Date.now() - startTime}ms, totalPersons=${totalPersons}, isPartial=${limit > 0 && shownPersons < totalPersons}`);

    return {
      rootNode: this.serializeBigInt(finalRootNode),
      mainLineage,
      totalPersons,
      spouseEdges,
      isPartial: limit > 0 && shownPersons < totalPersons,
      shownPersons,
    };
  }

  /**
   * 统计树中节点数量
   */
  private countNodesInTree(node: TreeNode): number {
    let count = 1;
    if (node.children) {
      for (const child of node.children) {
        count += this.countNodesInTree(child);
      }
    }
    return count;
  }

  /**
   * 规范优先级遍历序（主脉优先 + 层级 BFS，根 → 子 → 孙…）
   * - 与逐批加载共用同一顺序：首屏截取 canonical[0..limit)，下一批取 canonical[offset..offset+batch)，
   *   保证「已加载集合」始终是规范序的前缀（父节点先于子节点被加载，树保持连通）。
   * - 每层内部：主传承线路子节点排前（父节点分组内主脉优先）。
   * @returns order 规范序遍历的节点列表；parentMap 子节点 id → 父节点（根节点无父）。
   */
  private priorityBfsOrder(
    root: TreeNode,
    mainLineageSet: Set<string>,
  ): { order: TreeNode[]; parentMap: Map<string, TreeNode> } {
    const order: TreeNode[] = [];
    const parentMap = new Map<string, TreeNode>();
    let level: TreeNode[] = [root];
    while (level.length > 0) {
      // 收集当前层（保持该层内部顺序）
      for (const node of level) order.push(node);
      // 构造下一层：主脉子节点优先（按父节点分组，组内主脉在前）
      const next: TreeNode[] = [];
      for (const node of level) {
        const children = node.children || [];
        for (const c of children) {
          parentMap.set(c.id.toString(), node);
          next.push(c);
        }
      }
      next.sort((a, b) => {
        const aMain = mainLineageSet.has(a.id.toString()) ? 0 : 1;
        const bMain = mainLineageSet.has(b.id.toString()) ? 0 : 1;
        return aMain - bMain;
      });
      level = next;
    }
    return { order, parentMap };
  }

  /**
   * 按节点数上限截取「核心子集」（渐进加载首屏优化）
   * - 顺序与逐批加载完全一致（priorityBfsOrder：主脉优先 + 层级 BFS），
   *   保证后续「加载下一批」能无缝续接（offset 即 shownPersons）；
   * - 返回一棵只含被选中节点的子树（children / child_links 同步过滤），不改动原树。
   */
  private truncateTreeByPriority(root: TreeNode, limit: number, mainLineageSet: Set<string>): TreeNode {
    const { order } = this.priorityBfsOrder(root, mainLineageSet);
    const collected = new Set<string>();
    for (let i = 0; i < order.length && collected.size < limit; i++) {
      collected.add(order[i].id.toString());
    }

    // 重建截断树：只保留被选中节点（children 与 child_links 同步过滤）
    const prune = (node: TreeNode): TreeNode => {
      const children = (node.children || [])
        .filter((c) => collected.has(c.id.toString()))
        .map(prune);
      const childLinks = (node.child_links || []).filter(
        (l) => collected.has(l.child_id.toString()),
      );
      return {
        ...node,
        children: children.length > 0 ? children : undefined,
        child_links: childLinks.length > 0 ? childLinks : undefined,
      };
    };
    return prune(root);
  }

  /**
   * 逐批追加渲染：返回「下一批」核心节点（渐进加载的续接批次）
   * - 沿用与首屏一致的规范遍历序（priorityBfsOrder：主脉优先 + 层级 BFS），
   *   offset = 已加载树节点数（前端把 shownPersons 传回），即从规范序的该位置续取 batchSize 个；
   * - 每批只返回新节点本身（子树剥离）+ 父节点 id + 子女边元数据，payload 最小；
   * - isPartial 由「已加载数 < 树内节点总数」判定；前端以 items 为空作为最终结束信号
   *   （totalPersons 含不在树上的孤立成员，可能出现 totalPersons 大于树节点数的情形）。
   */
  async getClanNextBatch(
    clanId: bigint,
    offset: number,
    batchSize: number,
    userId?: string,
  ): Promise<ClanNextBatchResponse> {
    const startTime = Date.now();
    console.log(`[TreeService] getClanNextBatch start: clanId=${clanId}, offset=${offset}, batchSize=${batchSize}`);

    const rootPerson = await this.findClanRootPerson(clanId);
    if (!rootPerson) {
      throw new NotFoundException(`No root person found for clan ${clanId}`);
    }
    const rootNode = await this.getClanTreeOptimized(clanId, rootPerson.id, 0);

    // 主传承线路 + 回填 is_main_lineage（与 getClanFullTree 一致，供前端金色高亮）
    const mainLineage = await this.findMainLineagePath(clanId, rootPerson.id, userId);
    const mainLineageSet = new Set(mainLineage.map((id) => id.toString()));
    const markMainLineage = (n: TreeNode) => {
      n.is_main_lineage = mainLineageSet.has(n.id);
      if (n.children) n.children.forEach(markMainLineage);
    };
    markMainLineage(rootNode);

    const { order, parentMap } = this.priorityBfsOrder(rootNode, mainLineageSet);
    const totalPersons = await this.prisma.person.count({
      where: { clan_id: clanId, deleted_at: null },
    });

    const items: ClanBatchItem[] = [];
    const end = Math.min(order.length, offset + batchSize);
    for (let i = offset; i < end; i++) {
      const node = order[i];
      const id = node.id.toString();
      const parent = parentMap.get(id);
      if (!parent) continue; // 根节点无父（offset 正常时不会出现）
      const childLink = (parent.child_links || []).find(
        (l) => l.child_id.toString() === id,
      );
      items.push({
        node: {
          ...node,
          children: undefined,
          child_links: undefined,
        },
        parentId: parent.id.toString(),
        childLink,
      });
    }

    const shownPersons = offset + items.length;
    const isPartial = shownPersons < totalPersons;
    console.log(`[TreeService] getClanNextBatch complete: ${Date.now() - startTime}ms, items=${items.length}, shownPersons=${shownPersons}, isPartial=${isPartial}`);

    return {
      items: items.map((i) => ({
        node: this.serializeBigInt(i.node),
        parentId: i.parentId,
        childLink: i.childLink ? (this.serializeBigInt(i.childLink) as ChildLink) : undefined,
      })),
      totalPersons,
      shownPersons,
      isPartial,
    };
  }

  /**
   * 优化版族谱树查询：避免闭包表 O(N²) 查询
   * 改用直接父子关系（depth=1）查询，数据量从 O(N²) 降到 O(N)
   *
   * [I-1 修复 2026-08-01]
   * - 跳过未必要字段：avatar_url/thumbnail_url 默认留空，由前端的 AvatarLazy 组件按需加载
   * - 这样能避免 1000 节点场景下批量 media_person_link 查询（以及 file_url 字符串拼接）
   * - spouses 仅加载树中节点本身的配偶列表；跳过子节点的配偶，由前端按需触发 getPersonDetail
   *
   * @param maxDepth 深度限制。0 表示全部加载；正数表示只加载到指定代数。
   */
  private async getClanTreeOptimized(clanId: bigint, rootPersonId: bigint, maxDepth: number = 0): Promise<TreeNode> {
    // 1) 深度限制模式：直接用闭包表过滤，显著减少数据量
    if (maxDepth > 0) {
      return this.getClanTreeWithDepthLimit(clanId, rootPersonId, maxDepth);
    }

    // 2) 全量模式：一次性查出族内所有未删除的 person（只选必要字段）
    const allPersons = await this.prisma.person.findMany({
      where: { clan_id: clanId, deleted_at: null },
      select: {
        id: true,
        full_name: true,
        gender: true,
        birth_date: true,
        death_date: true,
        is_living: true,
      },
    });

    if (allPersons.length === 0) {
      throw new NotFoundException(`No persons found for clan ${clanId}`);
    }

    const personIds = allPersons.map(p => p.id);

    // 3) 构建父子映射
    //    [2026-08-16] 权威源改为 family_children（family_units.husband_id 即父）：
    //    person_ancestry 是派生索引（闭包表），任何写入端漏同步都会造成漂移；
    //    family_children 是各写路径（seed/import/tree/pedigree/merge）统一维护的关系表。
    //    以 family_children 为主，person_ancestry depth=1 仅做兜底补漏（只认男性祖先为父，
    //    且跳过已有权威父链的孩子，避免"母链/重复记录"把同一孩子挂到多个父节点下）。
    const childMap = new Map<string, string[]>();
    const addChild = (parentKey: string, childKey: string) => {
      if (!childMap.has(parentKey)) childMap.set(parentKey, []);
      if (!childMap.get(parentKey)!.includes(childKey)) childMap.get(parentKey)!.push(childKey);
    };
    const familyChildLinks = await this.prisma.familyChild.findMany({
      where: { family: { clan_id: clanId } },
      select: { child_id: true, family: { select: { husband_id: true } } },
    });
    const attachedChildIds = new Set<string>();
    for (const cl of familyChildLinks) {
      if (!cl.family.husband_id) continue;
      attachedChildIds.add(cl.child_id.toString());
      addChild(cl.family.husband_id.toString(), cl.child_id.toString());
    }
    // 兜底：闭包表 depth=1（只补 family_children 缺失的孩子，且父系优先）
    const directRelations = await this.prisma.personAncestry.findMany({
      where: {
        ancestor_id: { in: personIds },
        descendant_id: { in: personIds },
        depth: 1,
      },
      include: { ancestor: { select: { gender: true } } },
    });
    for (const rel of directRelations) {
      const descId = rel.descendant_id.toString();
      if (attachedChildIds.has(descId)) continue; // 已有权威父链，跳过母链/重复记录
      if (rel.ancestor?.gender !== 'male') continue; // 兜底只认父系，避免挂到妻子下
      addChild(rel.ancestor_id.toString(), descId);
    }

    // 4) 批量预取头像
    //    [I-1 修复 2026-08-01] 仅当 personIds ≤ 500 时才预取头像；超过阈值改为占位 has_photo=false，
    //    前端 AvatarLazy 组件会按 person.id 触发 getPersonDetail 懒加载。
    //    这避免了 1000+ 节点场景下 media_person_link 全部查（首屏负载降到原来的 1/5）。
    let avatarMap: Map<string, { avatar_url?: string; thumbnail_url?: string; has_photo: boolean }>;
    if (personIds.length <= 500) {
      avatarMap = await this.batchFindPersonAvatars(personIds);
    } else {
      avatarMap = new Map();
      // 仅预取主传承路线节点（mainLineage 前 30 个）的头像，让首屏视觉完整
      const quickFetchIds = personIds.slice(0, 30);
      avatarMap = await this.batchFindPersonAvatars(quickFetchIds);
    }

    // 5) 创建所有节点
    const nodeMap = new Map<string, TreeNode>();
    for (const person of allPersons) {
      const idStr = person.id.toString();
      const avatar = avatarMap.get(idStr) || { has_photo: false };
      nodeMap.set(idStr, this.toTreeNode(person, avatar));
    }

    // 6) 把 children 挂到父节点
    //    [树谱增强 2026-08-17] 同步透出 child_links（排行/过继类型/父、母归属）
    const childLinkMap = await this.buildChildLinksMap(clanId);
    for (const [parentId, childIds] of childMap) {
      const parentNode = nodeMap.get(parentId);
      if (!parentNode) continue;
      const uniqueChildIds = [...new Set(childIds)];
      parentNode.children = uniqueChildIds
        .map((id) => nodeMap.get(id))
        .filter((n): n is TreeNode => n !== undefined);
      parentNode.child_links = this.buildNodeChildLinks(parentId, uniqueChildIds, childLinkMap);
    }

    // 7) 查询全族配偶信息（FamilyUnit）
    //    [2026-08-16 修复] 旧实现只查 rootPersonId 的配偶（I-1 性能优化），
    //    导致除根节点外所有节点的 spouses 为空 —— 前端除根配偶外看不到任何妻子节点，
    //    与 PRD「配偶节点」「一人多配偶」「吊线图按妻子分支出子女」的设计不符。
    //    改为查全族 familyUnit 并为每个节点挂 spouses（depth-limited 模式早已全量挂载）。
    //    配偶节点在树中体积小、受 viewport culling 控制，1000+ 节点场景仍可流畅渲染。
    const allFamilyUnits = (await this.prisma.familyUnit.findMany({
      where: {
        clan_id: clanId,
      },
      include: {
        husband: { select: { id: true, full_name: true, gender: true } },
        wife: { select: { id: true, full_name: true, gender: true } },
      },
    })) as any[];

    const spouseMap = new Map<string, SpouseInfo[]>();
    for (const fam of allFamilyUnits) {
      if (fam.husband_id && fam.wife_id) {
        const hId = fam.husband_id.toString();
        const wId = fam.wife_id.toString();
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

    // 8) 返回根节点
    const rootNode = nodeMap.get(rootPersonId.toString());
    if (!rootNode) {
      throw new NotFoundException(`Root person ${rootPersonId} not found in clan tree`);
    }

    return rootNode;
  }

  /**
   * 递归裁剪树节点，移除超出指定深度的子树
   */
  private pruneTreeByDepth(node: TreeNode, remainingDepth: number): void {
    if (remainingDepth <= 0) {
      node.children = [];
      return;
    }
    if (node.children) {
      for (const child of node.children) {
        this.pruneTreeByDepth(child, remainingDepth - 1);
      }
    }
  }

  /**
   * 深度限制模式：用闭包表深度过滤，只加载指定代数内的成员
   * 相比全量加载，可显著减少数据量和查询时间
   */
  private async getClanTreeWithDepthLimit(clanId: bigint, rootPersonId: bigint, maxDepth: number): Promise<TreeNode> {
    // 1) 用闭包表直接查询指定深度范围内的所有人
    const ancestryInRange = await this.prisma.personAncestry.findMany({
      where: {
        ancestor_id: rootPersonId,
        depth: { lte: maxDepth },
      },
      select: {
        descendant_id: true,
        depth: true,
      },
    });

    if (ancestryInRange.length === 0) {
      throw new NotFoundException(`No persons found within depth ${maxDepth} from root`);
    }

    const personIds = ancestryInRange.map(a => a.descendant_id);
    const depthMap = new Map<string, number>();
    for (const a of ancestryInRange) {
      depthMap.set(a.descendant_id.toString(), a.depth);
    }

    // 2) 一次性查询这些人的基本信息
    const persons = await this.prisma.person.findMany({
      where: {
        id: { in: personIds },
        deleted_at: null,
      },
      select: {
        id: true,
        full_name: true,
        gender: true,
        birth_date: true,
        death_date: true,
        is_living: true,
      },
    });

    // 3) 查询直接父子关系（depth=1）
    const directRelations = await this.prisma.personAncestry.findMany({
      where: {
        ancestor_id: { in: personIds },
        descendant_id: { in: personIds },
        depth: 1,
      },
      select: { ancestor_id: true, descendant_id: true },
    });

    // 4) 构建父子映射
    const childMap = new Map<string, string[]>();
    for (const rel of directRelations) {
      const parentKey = rel.ancestor_id.toString();
      if (!childMap.has(parentKey)) childMap.set(parentKey, []);
      childMap.get(parentKey)!.push(rel.descendant_id.toString());
    }

    // 5) 批量预取头像
    const avatarMap = await this.batchFindPersonAvatars(personIds);

    // 6) 创建节点
    const nodeMap = new Map<string, TreeNode>();
    for (const person of persons) {
      const idStr = person.id.toString();
      const avatar = avatarMap.get(idStr) || { has_photo: false };
      nodeMap.set(idStr, this.toTreeNode(person, avatar));
    }

    // 7) 挂载子节点
    //    [树谱增强 2026-08-17] 同步透出 child_links（排行/过继类型/父、母归属）
    const childLinkMap = await this.buildChildLinksMap(clanId, personIds);
    for (const [parentId, childIds] of childMap) {
      const parentNode = nodeMap.get(parentId);
      if (!parentNode) continue;
      parentNode.children = childIds
        .map(id => nodeMap.get(id))
        .filter((n): n is TreeNode => n !== undefined);
      parentNode.child_links = this.buildNodeChildLinks(parentId, childIds, childLinkMap);
    }

    // 8) 查询配偶信息（只查询在范围内的人的配偶）
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
    })) as any[];

    const spouseMap = new Map<string, SpouseInfo[]>();
    for (const fam of familyUnits) {
      if (fam.husband_id && fam.wife_id) {
        const hId = fam.husband_id.toString();
        const wId = fam.wife_id.toString();
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

    // 9) 返回根节点
    const rootNode = nodeMap.get(rootPersonId.toString());
    if (!rootNode) {
      throw new NotFoundException(`Root person ${rootPersonId} not found`);
    }
    return rootNode;
  }

  /**
   * 单次查询定位族谱根节点（无父母的人）
   */
  private async findClanRootPerson(clanId: bigint): Promise<Pick<Person, 'id' | 'full_name' | 'gender' | 'birth_date' | 'death_date' | 'is_living'> | null> {
    const persons = await this.prisma.person.findMany({
      where: { clan_id: clanId, deleted_at: null },
      orderBy: { id: 'asc' },
      select: { id: true, full_name: true, gender: true, birth_date: true, death_date: true, is_living: true },
    });
    if (persons.length === 0) return null;

    const personIds = persons.map((p) => p.id);
    const directDescendantIds = await this.prisma.personAncestry.findMany({
      where: {
        depth: 1,
        descendant_id: { in: personIds },
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
    userId?: string,
  ): Promise<string[]> {
    if (userId) {
      const userLink = await this.prisma.personUserLink.findFirst({
        where: {
          user_id: userId,
          person: { clan_id: clanId },
        },
        include: { person: true },
      });

      if (userLink) {
        return this.buildLineagePath(userLink.person.id, rootPersonId);
      }
    }

    // 无用户关联时，退回到族内最远支系末端
    // [2026-08-16] 深度相同时按 id 升序取（优先主支系/更早创建的人物，
    // 避免同名深度的测试人物抢占主脉末端）
    const lastDescendant = await this.prisma.personAncestry.findFirst({
      where: { ancestor_id: rootPersonId },
      orderBy: [{ depth: 'desc' }, { descendant_id: 'asc' }],
      select: { descendant_id: true },
    });
    if (!lastDescendant) return [rootPersonId.toString()];
    return this.buildLineagePath(lastDescendant.descendant_id, rootPersonId);
  }

  /**
   * 从 fromPersonId 沿直接父链回溯到 toAncestorId
   * 优化：一次性查出所有祖先关系，避免 N 次数据库查询
   *
   * [2026-08-16 修复] 旧实现只查 `descendant_id IN [fromPersonId, toAncestorId]`
   * 两个端点的 depth=1 关系，中间人不在查询集合内，回溯走一步就断，
   * 导致 findMainLineagePath 返回的主传承路径永远只有 2 个节点
   * （前端「传承路径 2代」、金色主脉高亮仅 2 人、聚焦传承失效）。
   * 现在先从闭包表取出 fromPersonId 的全部祖先构成候选集，再一次性查这些
   * 候选人的 depth=1 父链；同一人存在「父+母」两条 depth=1 时优先取男性祖先。
   */
  private async buildLineagePath(
    fromPersonId: bigint,
    toAncestorId: bigint,
  ): Promise<string[]> {
    // 1) 从闭包表取出 fromPersonId 的所有祖先（任意深度），构成候选节点集
    const ancestorLinks = await this.prisma.personAncestry.findMany({
      where: {
        descendant_id: fromPersonId,
        depth: { gt: 0 },
      },
      select: { ancestor_id: true },
    });
    const candidateIds = new Set<string>([
      fromPersonId.toString(),
      toAncestorId.toString(),
    ]);
    for (const a of ancestorLinks) candidateIds.add(a.ancestor_id.toString());

    // 2) 一次性查出候选集中所有人的 depth=1 关系（含祖先性别，父系优先）
    const candidateBigInts = [...candidateIds].map((id) => BigInt(id));
    const ancestors = await this.prisma.personAncestry.findMany({
      where: {
        descendant_id: { in: candidateBigInts },
        depth: 1,
      },
      include: {
        ancestor: { select: { gender: true } },
      },
    });

    // 构建 descendant -> 父系祖先 的映射（同一个人有父+母两条 depth=1 时优先男性）
    const parentMap = new Map<string, string>();
    const parentGender = new Map<string, string>();
    for (const a of ancestors) {
      if (a.ancestor_id === a.descendant_id) continue; // 跳过 self-record（正常 depth=1 不应存在）
      const descId = a.descendant_id.toString();
      const anceId = a.ancestor_id.toString();
      const gender = a.ancestor?.gender;
      const existing = parentMap.get(descId);
      if (!existing) {
        parentMap.set(descId, anceId);
        parentGender.set(descId, gender || '');
      } else if (gender === 'male' && parentGender.get(descId) !== 'male') {
        // 已记录的是母亲（female/未知），当前是父亲 → 覆盖，确保走父系主脉
        parentMap.set(descId, anceId);
        parentGender.set(descId, gender);
      }
    }

    // 3) 从起点沿父链回溯到根
    const path: string[] = [fromPersonId.toString()];
    let currentId = fromPersonId.toString();
    const visited = new Set<string>();
    const maxSteps = 100; // 安全限制

    while (currentId !== toAncestorId.toString() && path.length < maxSteps) {
      if (visited.has(currentId)) break; // 防止环
      visited.add(currentId);

      const parentId = parentMap.get(currentId);
      if (!parentId) break;

      path.unshift(parentId);
      currentId = parentId;
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

  // ==================== 子女边元数据（ChildLink） ====================
  // [树谱增强 2026-08-17] 闭包表只表达"可达性"，排行/过继类型/家庭归属在 FamilyChild。
  // 这里一次查询拉出（含家庭信息），供三个建树路径（全量/深度限制/子树）共用。

  /**
   * 批量加载 FamilyChild 并建立 childId -> 家庭记录索引
   * @param personIds 传了则只查这些子女（深度限制/子树路径）；全量路径传 undefined
   */
  private async buildChildLinksMap(
    clanId: bigint,
    personIds?: bigint[],
  ): Promise<Map<string, ChildLinkEntry[]>> {
    const where = personIds
      ? { child_id: { in: personIds }, family: { clan_id: clanId } }
      : { family: { clan_id: clanId } };

    const rows = await this.prisma.familyChild.findMany({
      where,
      select: {
        child_id: true,
        birth_order: true,
        child_type: true,
        family: { select: { id: true, husband_id: true, wife_id: true } },
      },
    });

    const map = new Map<string, ChildLinkEntry[]>();
    for (const r of rows) {
      const cid = r.child_id.toString();
      const entry: ChildLinkEntry = {
        child_id: cid,
        birth_order: r.birth_order,
        child_type: r.child_type,
        family_id: r.family.id.toString(),
        father_id: r.family.husband_id ? r.family.husband_id.toString() : undefined,
        mother_id: r.family.wife_id ? r.family.wife_id.toString() : undefined,
      };
      if (!map.has(cid)) map.set(cid, []);
      map.get(cid)!.push(entry);
    }
    return map;
  }

  /**
   * 为某个父节点生成 child_links[]（与 children[] 同下标一一对应）
   * 归属规则：优先选"该父/母是家庭 husband/wife"的那条记录；无则取第一条；无记录返回最小占位。
   */
  private buildNodeChildLinks(
    parentId: string,
    childIds: string[],
    linkMap: Map<string, ChildLinkEntry[]>,
  ): ChildLink[] {
    return childIds.map((cid) => {
      const entries = linkMap.get(cid) ?? [];
      const entry =
        entries.find((e) => e.father_id === parentId || e.mother_id === parentId) ??
        entries[0];
      if (!entry) return { child_id: cid };
      return {
        child_id: cid,
        birth_order: entry.birth_order,
        child_type: entry.child_type,
        family_id: entry.family_id,
        father_id: entry.father_id,
        mother_id: entry.mother_id,
      };
    });
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
    person: Pick<Person, 'id' | 'full_name' | 'gender' | 'birth_date' | 'death_date' | 'is_living'>,
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
  return serializeBigInt(value);
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
