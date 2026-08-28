import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService, Prisma } from '@geneasphere/db';
import { Gender } from '@prisma/client';
import * as puppeteer from 'puppeteer-core';

/**
 * 册谱服务（《册谱模块需求文档（PRD）》一期核心闭环）
 *
 * 设计要点（决策清单已确认）：
 * - 册谱不存人物副本；世录卷 = 实时读 Person/FamilyUnit/FamilyChild/PersonAncestry/PersonBio/MediaPersonLink
 *   按"辈分（闭包表深度）降序 → 同辈按排行升序"生成苏式条目；
 * - BookVolume 只存"卷宗结构 + 筛选配置"；文档卷 content 为富文本 HTML；
 * - 过滤只控渲染，不改底层数据。
 */

export interface ShiluEntry {
  person_id: string;
  generation: number;
  rank?: number;
  full_name: string;
  gender: 'male' | 'female';
  courtesy_name?: string;
  birth_year?: number;
  death_year?: number;
  is_living: boolean;
  native_place?: string;
  burial_place?: string;
  achievements?: string;
  anecdotes?: string;
  biography?: string;
  adoption_note?: string;
  father_name?: string;
  spouses: { name: string; gender: string; marriage_order: number; native_place?: string }[];
  children: { name: string; gender: string; rank?: number; child_type?: string }[];
  premature: boolean;
}

interface ShiluConfig {
  branches?: string[]; // 房派根 personId 列表；空 = 全房派
  include_female?: boolean; // 是否收录女性（false=世系录只收男性）
  gender_filter?: 'all' | 'male' | 'female'; // 全部/男性/女性（闺秀录 = female）
  hide_wife?: boolean;
  hide_daughter?: boolean;
  hide_son_in_law?: boolean;
  hide_premature?: boolean;
  premature_age?: number;
  exclude_person_ids?: string[];
  layout?: 'su' | 'ou' | 'shixi_table'; // 苏式 | 欧式(二期) | 世系表开本(竖排)
  // —— 世系表版式专属配置(PR#1 新增) ——
  page_gen_count?: number; // 每页并列展示的世代数,默认 5
  show_generation_connector?: boolean; // 是否绘制顶端连接线+小圆圈,默认 true
  surname_color?: string; // 人物名红色,默认 '#b22222'
}

@Injectable()
export class CepuService {
  private readonly logger = new Logger(CepuService.name);
  // [2026-08-28 优化] 世录实时生成耗时 5-15s（数据库经 SSH 隧道访问远程库，单查询抖动 0.5-10s）；
  // 内存缓存：重复打开/多人阅读秒开；config/传记写操作时主动失效。
  // 已知限制：成员/婚姻/世系写路径（tree/merge/import 等）未挂失效，变更后最多 TTL 内脏读（20s）；
  // 如需严格一致，应引入 clan 级 data_version 纳入缓存 key，留待后续。
  private shiluCache = new Map<string, { at: number; entries: ShiluEntry[] }>();
  private readonly SHILU_CACHE_TTL = 20_000;
  // 进行中的生成 Promise（single-flight）：多请求同时未命中时只跑一份重查询，避免缓存穿透
  private shiluInflight = new Map<string, Promise<ShiluEntry[]>>();

  private shiluCacheKey(clanId: bigint, config: ShiluConfig) {
    return `${clanId.toString()}:${JSON.stringify(config ?? {})}`;
  }

  private invalidateShiluCache(clanId: bigint) {
    const prefix = `${clanId.toString()}:`;
    for (const k of this.shiluCache.keys()) {
      if (k.startsWith(prefix)) this.shiluCache.delete(k);
    }
  }

  /** 顺带清理过期缓存项（防 Map 无限增长） */
  private pruneShiluCache() {
    const now = Date.now();
    for (const [k, v] of this.shiluCache) {
      if (now - v.at >= this.SHILU_CACHE_TTL) this.shiluCache.delete(k);
    }
  }
  private readonly browserPaths = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Chromium\\Application\\chrome.exe',
  ].filter((p): p is string => !!p);

  constructor(private readonly prisma: PrismaService) {}

  /** 探测可用浏览器（Edge/Chrome），找不到抛明确错误 */
  private findBrowserPath(): string {
    for (const p of this.browserPaths) {
      try {
        if (require('fs').existsSync(p)) return p;
      } catch {
        /* ignore */
      }
    }
    throw new Error(
      '未找到可用浏览器（Edge/Chrome），请设置 PUPPETEER_EXECUTABLE_PATH 环境变量',
    );
  }

  /** 数字 clan id 解析：校验存在性（ClanResolverService 对纯数字会拒绝，故单独处理） */
  async resolveClanIdByNumeric(clanId: bigint): Promise<bigint> {
    const clan = await this.prisma.clan.findUnique({
      where: { id: clanId },
      select: { id: true },
    });
    if (!clan) throw new NotFoundException(`Clan ${clanId} not found`);
    return clan.id;
  }

  /** 卷宗 meta（权限校验用）：返回 clan_id */
  async getVolumeMeta(volumeId: bigint) {
    return this.prisma.bookVolume.findUnique({
      where: { id: volumeId },
      select: { id: true, clan_id: true, type: true },
    });
  }

  /** 人物 meta（权限校验用）：返回 clan_id */
  async getPersonMeta(personId: bigint) {
    return this.prisma.person.findUnique({
      where: { id: personId },
      select: { id: true, clan_id: true },
    });
  }

  /** 批注 meta（权限校验用）：返回所属卷宗 clan_id */
  async getAnnotationMeta(annotationId: bigint) {
    return this.prisma.bookAnnotation.findUnique({
      where: { id: annotationId },
      select: { id: true, volume: { select: { clan_id: true } } },
    });
  }

  // ==================== 卷宗管理 ====================

  /** 卷宗列表；空库时自动生成默认卷结构（PRD §2.2 示例） */
  async getVolumes(clanId: bigint) {
    const existing = await this.prisma.bookVolume.findMany({
      where: { clan_id: clanId },
      orderBy: { sort_order: 'asc' },
    });
    if (existing.length > 0) return existing;

    const defaults = [
      { sort_order: 1, title: '卷一 谱序源流', type: 'document', content: '<p>（此处录入谱序、凡例、修谱人员名单）</p>' },
      { sort_order: 2, title: '卷二 世系录', type: 'shilu', config: { gender_filter: 'male' } },
      { sort_order: 3, title: '卷三 闺秀录', type: 'shilu', config: { gender_filter: 'female' } },
      { sort_order: 4, title: '卷四 艺文墓志', type: 'document', content: '<p>（此处录入艺文、墓志铭、祠堂记、坟茔志）</p>' },
    ];
    await this.prisma.bookVolume.createMany({
      data: defaults.map((d) => ({
        clan_id: clanId,
        sort_order: d.sort_order,
        title: d.title,
        type: d.type as string,
        content: d.content,
        config: (d.config as object | undefined) ?? undefined,
        created_by: 'system',
      })),
    });
    return this.prisma.bookVolume.findMany({
      where: { clan_id: clanId },
      orderBy: { sort_order: 'asc' },
    });
  }

  async createVolume(clanId: bigint, userId: string, body: { title: string; type?: string; content?: string; config?: any }) {
    if (!body.title?.trim()) throw new BadRequestException('卷标题不能为空');
    const maxOrder = await this.prisma.bookVolume.aggregate({
      where: { clan_id: clanId },
      _max: { sort_order: true },
    });
    // [二期 2026-08-20] 创建即写入版本 1 快照
    return this.prisma.$transaction(async (tx) => {
      const volume = await tx.bookVolume.create({
        data: {
          clan_id: clanId,
          sort_order: (maxOrder._max.sort_order ?? 0) + 1,
          title: body.title.trim(),
          type: body.type === 'shilu' ? 'shilu' : 'document',
          content: body.type === 'shilu' ? null : (body.content ?? ''),
          config: body.type === 'shilu' ? (body.config ?? { gender_filter: 'all' }) : null,
          created_by: userId,
        },
      });
      await this.snapshotVolume(tx as any, volume, userId, 1);
      return volume;
    });
  }

  async updateVolume(volumeId: bigint, userId: string, body: { title?: string; content?: string; config?: any }) {
    const volume = await this.prisma.bookVolume.findUnique({ where: { id: volumeId } });
    if (!volume) throw new NotFoundException('卷宗不存在');
    // [二期 2026-08-20] 变更后写入新版本快照（可回滚）
    // - 60 分钟去重窗口：连续保存相同配置不会产生噪声版本
    const updated = await this.prisma.$transaction(async (tx) => {
      const v = await tx.bookVolume.update({
        where: { id: volumeId },
        data: {
          ...(body.title !== undefined && { title: body.title }),
          ...(body.content !== undefined && volume.type === 'document' && { content: body.content }),
          ...(body.config !== undefined && volume.type === 'shilu' && { config: body.config }),
        },
      });
      await this.snapshotVolume(tx as any, v, userId, undefined, { dedupeWithinMinutes: 60 });
      return v;
    });
    // 仅世录卷筛选配置变化才影响世录条目，失效该家族世录缓存（文档卷/仅改标题无需失效）
    if (volume.type === 'shilu' && body.config !== undefined) {
      this.invalidateShiluCache(volume.clan_id);
    }
    return updated;
  }

  // ==================== 卷宗版本历史（二期，决策清单 §F1） ====================

  /** 写一条版本快照（版本号 = 现有最大 + 1，可显式指定）
   *  - opts.dedupeWithinMinutes：若最近一次快照与本次内容完全一致，
   *    且时间在该窗口内，则跳过创建，避免"保存筛选配置连续 5 次"产生 5 条相同版本。
   *  - createVolume 路径传 explicitVersion=1 不受该窗口影响（首次必落盘）。
   */
  private async snapshotVolume(
    tx: any,
    volume: { id: bigint; title: string; content: string | null; config: any },
    userId: string,
    explicitVersion?: number,
    opts: { dedupeWithinMinutes?: number } = {},
  ) {
    if (explicitVersion === undefined && opts.dedupeWithinMinutes && opts.dedupeWithinMinutes > 0) {
      const latest = await tx.bookVolumeVersion.findFirst({
        where: { volume_id: volume.id },
        orderBy: { version: 'desc' },
      });
      if (latest) {
        const sameContent = (latest.content ?? null) === (volume.content ?? null);
        const sameConfig = JSON.stringify(latest.config ?? null) === JSON.stringify(volume.config ?? null);
        const sameTitle = latest.title === volume.title;
        const within = Date.now() - new Date(latest.created_at).getTime() < opts.dedupeWithinMinutes * 60_000;
        if (sameContent && sameConfig && sameTitle && within) {
          // 内容未变 + 时间窗口内：复用上一条快照，不新增版本
          return;
        }
      }
    }
    const maxV = await tx.bookVolumeVersion.aggregate({
      where: { volume_id: volume.id },
      _max: { version: true },
    });
    const version = explicitVersion ?? (maxV._max.version ?? 0) + 1;
    await tx.bookVolumeVersion.create({
      data: {
        volume_id: volume.id,
        version,
        title: volume.title,
        content: volume.content,
        config: volume.config ?? undefined,
        created_by: userId,
      },
    });
  }

  async listVolumeVersions(volumeId: bigint) {
    return this.prisma.bookVolumeVersion.findMany({
      where: { volume_id: volumeId },
      orderBy: { version: 'desc' },
    });
  }

  /** 回滚到指定版本（回滚本身也记录一个新版本，保证可追溯） */
  async restoreVolumeVersion(volumeId: bigint, version: number, userId: string) {
    const snap = await this.prisma.bookVolumeVersion.findUnique({
      where: { volume_id_version: { volume_id: volumeId, version } },
    });
    if (!snap) throw new NotFoundException('版本不存在');
    const volume = await this.prisma.bookVolume.findUnique({ where: { id: volumeId } });
    const updated = await this.prisma.$transaction(async (tx) => {
      const v = await tx.bookVolume.update({
        where: { id: volumeId },
        data: { title: snap.title, content: snap.content, config: snap.config },
      });
      await this.snapshotVolume(tx as any, v, userId);
      return v;
    });
    // 回滚可能改世录配置，失效该家族世录缓存
    if (volume) this.invalidateShiluCache(volume.clan_id);
    return updated;
  }

  async deleteVolume(volumeId: bigint) {
    const volume = await this.prisma.bookVolume.findUnique({ where: { id: volumeId } });
    if (!volume) throw new NotFoundException('卷宗不存在');
    await this.prisma.bookVolume.delete({ where: { id: volumeId } });
  }

  /** 重排卷序：ids 数组顺序即新 sort_order */
  async reorderVolumes(clanId: bigint, ids: string[]) {
    const volumes = await this.prisma.bookVolume.findMany({ where: { clan_id: clanId } });
    const idSet = new Set(volumes.map((v) => v.id.toString()));
    const filtered = ids.filter((id) => idSet.has(id));
    await this.prisma.$transaction(
      filtered.map((id, idx) =>
        this.prisma.bookVolume.update({
          where: { id: BigInt(id) },
          data: { sort_order: idx + 1 },
        }),
      ),
    );
  }

  /** 单卷内容：文档卷返回 content；世录卷按 config 实时生成条目 */
  async getVolume(clanId: bigint, volumeId: bigint) {
    const volume = await this.prisma.bookVolume.findFirst({
      where: { id: volumeId, clan_id: clanId },
    });
    if (!volume) throw new NotFoundException('卷宗不存在');
    if (volume.type === 'document') {
      return { id: volume.id.toString(), title: volume.title, type: volume.type, content: volume.content ?? '' };
    }
    const entries = await this.generateShilu(clanId, (volume.config as ShiluConfig | null) ?? {});
    return { id: volume.id.toString(), title: volume.title, type: volume.type, config: volume.config, entries };
  }

  // ==================== 世录生成（苏式，一期） ====================

  async generateShilu(clanId: bigint, config: ShiluConfig): Promise<ShiluEntry[]> {
    // [2026-08-28 优化] 命中缓存直接返回（首次生成 5-15s，重复打开/他人阅读秒开）
    const cacheKey = this.shiluCacheKey(clanId, config);
    const hit = this.shiluCache.get(cacheKey);
    if (hit && Date.now() - hit.at < this.SHILU_CACHE_TTL) return hit.entries;
    // 防穿透：同 key 已有生成中的请求则复用其结果（single-flight）
    const inflight = this.shiluInflight.get(cacheKey);
    if (inflight) return inflight;
    const task = this.buildShiluEntries(clanId, config)
      .then((entries) => {
        this.shiluCache.set(cacheKey, { at: Date.now(), entries });
        this.pruneShiluCache();
        return entries;
      })
      .finally(() => {
        this.shiluInflight.delete(cacheKey);
      });
    this.shiluInflight.set(cacheKey, task);
    return task;
  }

  /** 世录条目实时生成（不含缓存层，由 generateShilu 统一缓存） */
  private async buildShiluEntries(clanId: bigint, config: ShiluConfig): Promise<ShiluEntry[]> {
    const persons = await this.prisma.person.findMany({
      where: { clan_id: clanId, deleted_at: null },
      select: { id: true, full_name: true, gender: true, birth_date: true, death_date: true, is_living: true },
    });
    if (persons.length === 0) return [];

    const personIds = persons.map((p) => p.id);
    const idStr = (id: bigint) => id.toString();

    // [2026-08-28 优化] 数据库经 SSH 隧道访问（每查询固定 ~1s 延迟），原实现 9 个查询全串行约 10s+；
    // 现将互不依赖的 5 个查询改为 Promise.all 并行（延迟重叠，总耗时 ≈ 单查询最慢值）。
    // 深度 1 父子边同时服务：族根 hasParent、father_name、房派根回溯（原 findClanRoot 内 1 次 +
    // 房派根 1 次 + fatherOf 1 次共 3 次串行查询合并为 1 次；hasParent 用单侧 in（与外族/已删
    // 祖先无关），parentOf/fatherOf 在内存中按“祖先在族内”过滤，复现原双 in 语义）
    const [parentEdges, familyChildren, famRows, bios, mediaLinks] = await Promise.all([
      this.prisma.personAncestry.findMany({
        where: { descendant_id: { in: personIds }, depth: 1 },
        select: { ancestor_id: true, descendant_id: true },
      }),
      this.prisma.familyChild.findMany({
        where: { child_id: { in: personIds } },
        select: { child_id: true, birth_order: true, child_type: true, family_id: true },
      }),
      this.prisma.familyUnit.findMany({
        where: { clan_id: clanId },
        select: { id: true, husband_id: true, wife_id: true },
      }),
      this.prisma.personBio.findMany({
        where: { person_id: { in: personIds } },
      }),
      this.prisma.mediaPersonLink.findMany({
        where: { person_id: { in: personIds } },
        include: { media: { select: { file_url: true } } },
      }),
    ]);

    // 1) 辈分 + 房派根：闭包表相对族根深度
    // 族根定位：无父者中 id 最小（原 findClanRoot 的 roots 查询与 persons 全量重复，改内存计算）
    const hasParent = new Set(parentEdges.map((e) => idStr(e.descendant_id)));
    let rootId: bigint | null = null;
    for (const p of persons) {
      if (!hasParent.has(idStr(p.id)) && (rootId === null || p.id < rootId)) rootId = p.id;
    }
    if (rootId === null) {
      // 全部有父（数据异常闭环），取 id 最小者兜底，与原 findClanRoot 一致
      for (const p of persons) if (rootId === null || p.id < rootId) rootId = p.id;
    }
    // 族内身份集合：parentOf/fatherOf 复现原“双 in”语义（祖先须在族内；软删除祖先不在 persons 内，
    // 其边不参与房派回溯与 father_name，与原实现一致）
    const inClan = new Set(personIds.map(idStr));
    const parentOf = new Map<string, string>();
    for (const e of parentEdges) {
      const a = idStr(e.ancestor_id);
      const d = idStr(e.descendant_id);
      if (inClan.has(a) && !parentOf.has(d)) parentOf.set(d, a);
    }
    const generationMap = new Map<string, number>();
    const branchRootMap = new Map<string, string>();
    if (rootId !== null) {
      const rootAncestry = await this.prisma.personAncestry.findMany({
        where: { ancestor_id: rootId, descendant_id: { in: personIds } },
        select: { descendant_id: true, depth: true, ancestor_id: true },
      });
      // 若存在多个根（数据异常），取根可达的人
      for (const r of rootAncestry) {
        const d = idStr(r.descendant_id);
        if (!generationMap.has(d)) generationMap.set(d, r.depth);
      }
      // 房派根 = 深度 1 的祖先（始祖直接子女）；用 depth=1 父链向上回溯
      for (const [d, gen] of generationMap) {
        let cur = d;
        for (let i = gen; i > 1; i--) {
          const p = parentOf.get(cur);
          if (!p) break;
          cur = p;
        }
        branchRootMap.set(d, cur);
      }
    }
    // 根不可达的人：辈分 0、房派根 = 自己
    for (const p of persons) {
      const d = idStr(p.id);
      if (!generationMap.has(d)) generationMap.set(d, 0);
      if (!branchRootMap.has(d)) branchRootMap.set(d, d);
    }

    // 2) 排行 + 过继类型（FamilyChild，优先出生家庭=BIOLOGICAL 且 id 最小）
    const rankMap = new Map<string, number>();
    const childTypeMap = new Map<string, string>();
    for (const fc of familyChildren) {
      const c = idStr(fc.child_id);
      const currentRank = rankMap.get(c);
      const isBio = fc.child_type === 'BIOLOGICAL';
      // 规则：BIOLOGICAL 且 family id 更小者优先；其次保留已记录者
      if (currentRank === undefined || (isBio && !childTypeMap.get(c))) {
        rankMap.set(c, fc.birth_order);
        childTypeMap.set(c, fc.child_type);
      }
    }

    // 3) 父子/配偶/子女/媒体 索引化（组装用）
    const fatherOf = new Map<string, string>();
    for (const e of parentEdges) {
      const a = idStr(e.ancestor_id);
      const d = idStr(e.descendant_id);
      // 与双 in 查询同口径：父不在族内（外族/已软删）不视为世录中的父亲
      if (inClan.has(a) && !fatherOf.has(d)) fatherOf.set(d, a);
    }
    const nameById = new Map(persons.map((p) => [idStr(p.id), p.full_name]));
    const genderById = new Map(persons.map((p) => [idStr(p.id), p.gender]));

    const bioById = new Map(bios.map((b) => [idStr(b.person_id), b]));
    const mediaByPerson = new Map<string, string[]>();
    for (const m of mediaLinks) {
      const pid = idStr(m.person_id);
      if (!mediaByPerson.has(pid)) mediaByPerson.set(pid, []);
      mediaByPerson.get(pid)!.push(m.media.file_url);
    }

    // 家庭 → 子女（含排行/类型），用于"某人的子女名单"与"配偶"
    const childrenByFamily = new Map<string, { child_id: bigint; birth_order: number; child_type: string }[]>();
    for (const fc of familyChildren) {
      const fk = fc.family_id.toString();
      if (!childrenByFamily.has(fk)) childrenByFamily.set(fk, []);
      childrenByFamily.get(fk)!.push(fc);
    }

    // [2026-08-28 优化] 家庭按 husband/wife 建索引（原实现每人生成时全表扫描 famRows，
    // 1325 人 × 703 家庭 ≈ 93 万次内层迭代，世录生成耗时 30s+；索引化后 O(1) 定位配偶家庭，
    // familyId/spouseId 预转字符串，组装循环内零 BigInt 转换/比较）
    type FamLink = { familyId: string; spouseId: string | null };
    const famsByHusband = new Map<string, FamLink[]>();
    const famsByWife = new Map<string, FamLink[]>();
    for (const f of famRows) {
      const link: FamLink = { familyId: f.id.toString(), spouseId: f.wife_id != null ? idStr(f.wife_id) : null };
      if (f.husband_id != null) {
        const k = idStr(f.husband_id);
        if (!famsByHusband.has(k)) famsByHusband.set(k, []);
        famsByHusband.get(k)!.push(link);
      }
      if (f.wife_id != null) {
        const k = idStr(f.wife_id);
        if (!famsByWife.has(k)) famsByWife.set(k, []);
        famsByWife.get(k)!.push(link);
      }
    }
    // bioOfOther 只依赖 bios，一次性构建（原实现在每人循环内重复重建 Map）
    const bioOfOther = new Map<string, string | undefined>();
    for (const b of bios) bioOfOther.set(idStr(b.person_id), b.native_place ?? undefined);

    // 4) 组装条目 + 过滤
    const prematureAge = config.premature_age ?? 18;
    const isPremature = (p: (typeof persons)[number]) =>
      !p.is_living && p.death_date && p.birth_date
        ? new Date(p.death_date).getFullYear() - new Date(p.birth_date).getFullYear() < prematureAge
        : false;

    const genderFilter = config.gender_filter ?? (config.include_female === false ? 'male' : 'all');
    const excludeSet = new Set((config.exclude_person_ids ?? []).map(String));

    const entries: ShiluEntry[] = [];
    for (const p of persons) {
      const d = idStr(p.id);
      if (excludeSet.has(d)) continue;
      if (genderFilter === 'male' && p.gender !== 'male') continue;
      if (genderFilter === 'female' && p.gender !== 'female') continue;

      const premature = isPremature(p);
      if (config.hide_premature && premature) continue;

      const branchRoot = branchRootMap.get(d);
      if (config.branches?.length && branchRoot && !config.branches.includes(branchRoot)) continue;

      const bio = bioById.get(d);
      // 配偶：person 作为 husband/wife 的家庭，取对侧（索引化 O(1)，替代全表扫描）
      const spouses: ShiluEntry['spouses'] = [];
      const children: ShiluEntry['children'] = [];
      const relatedFams = [...(famsByHusband.get(d) ?? []), ...(famsByWife.get(d) ?? [])];
      for (const link of relatedFams) {
        if (link.spouseId == null) continue;

        const spouseStr = link.spouseId;
        const hideThisSpouse =
          (config.hide_wife && p.gender === 'male') ||
          (config.hide_son_in_law && p.gender === 'female' && (generationMap.get(d) ?? 0) > 0);
        if (hideThisSpouse) {
          // 配偶被隐藏，但其子女（本族子女）仍保留在父条目下
        } else {
          spouses.push({
            name: nameById.get(spouseStr) ?? '（外族配偶）',
            gender: genderById.get(spouseStr) ?? 'female',
            marriage_order: 1,
            native_place: bioOfOther.get(spouseStr),
          });
        }

        const kids = childrenByFamily.get(link.familyId) ?? [];
        for (const kid of kids) {
          const kidStr = idStr(kid.child_id);
          const kidGender = genderById.get(kidStr);
          if (config.hide_daughter && kidGender === 'female') continue;
          children.push({
            name: nameById.get(kidStr) ?? '',
            gender: kidGender ?? 'female',
            rank: kid.birth_order,
            child_type: kid.child_type,
          });
        }
      }
      // 子女去重（同一孩子可能出现在多段婚姻）
      const seenChild = new Set<string>();
      const uniqueChildren = children.filter((c) => {
        const key = `${c.name}|${c.rank ?? ''}|${c.gender}`;
        if (seenChild.has(key)) return false;
        seenChild.add(key);
        return true;
      });

      const birth = p.birth_date ? new Date(p.birth_date).getFullYear() : undefined;
      const death = p.death_date ? new Date(p.death_date).getFullYear() : undefined;

      entries.push({
        person_id: d,
        generation: generationMap.get(d) ?? 0,
        rank: rankMap.get(d),
        full_name: p.full_name,
        gender: p.gender,
        courtesy_name: bio?.courtesy_name ?? undefined,
        birth_year: birth,
        death_year: death,
        is_living: p.is_living,
        native_place: bio?.native_place ?? undefined,
        burial_place: bio?.burial_place ?? undefined,
        achievements: bio?.achievements ?? undefined,
        anecdotes: bio?.anecdotes ?? undefined,
        biography: bio?.biography ?? undefined,
        adoption_note: bio?.adoption_note ?? undefined,
        father_name: fatherOf.get(d) ? nameById.get(fatherOf.get(d)!) : undefined,
        spouses,
        children: uniqueChildren,
        premature,
      });
    }

    // 5) 排序：辈分升序（祖辈在前）→ 同辈排行升序 → 出生年升序
    entries.sort((a, b) => {
      if (a.generation !== b.generation) return a.generation - b.generation;
      const ra = a.rank ?? 9999;
      const rb = b.rank ?? 9999;
      if (ra !== rb) return ra - rb;
      return (a.birth_year ?? 9999) - (b.birth_year ?? 9999);
    });

    return entries;
  }

  // ==================== PersonBio ====================

  async getPersonBio(personId: bigint) {
    const person = await this.prisma.person.findUnique({ where: { id: personId } });
    if (!person) throw new NotFoundException('人物不存在');
    const bio = await this.prisma.personBio.findUnique({ where: { person_id: personId } });
    return {
      person_id: personId.toString(),
      full_name: person.full_name,
      gender: person.gender,
      ...(bio ?? {}),
      id: bio ? bio.person_id.toString() : undefined,
    };
  }

  async upsertPersonBio(personId: bigint, body: any) {
    const person = await this.prisma.person.findUnique({ where: { id: personId } });
    if (!person) throw new NotFoundException('人物不存在');
    const fields = [
      'courtesy_name', 'native_place', 'burial_place', 'achievements',
      'anecdotes', 'biography', 'marital_notes', 'adoption_note', 'premature',
    ];
    const data: any = {};
    for (const f of fields) {
      if (body[f] !== undefined) data[f] = body[f];
    }
    return this.prisma.personBio.upsert({
      where: { person_id: personId },
      create: { person_id: personId, ...data },
      update: data,
    }).then((bio) => {
      // 传记变化会反映到世录条目，失效该家族世录缓存
      this.invalidateShiluCache(person.clan_id);
      return bio;
    });
  }

  // ==================== 批注（二期，决策清单 §G） ====================

  async getAnnotations(volumeId: bigint) {
    return this.prisma.bookAnnotation.findMany({
      where: { volume_id: volumeId },
      orderBy: { created_at: 'asc' },
    });
  }

  async createAnnotation(volumeId: bigint, userId: string, body: { anchor: string; note: string }) {
    if (!body.anchor) throw new BadRequestException('锚点不能为空');
    if (!body.note?.trim()) throw new BadRequestException('批注内容不能为空');
    const volume = await this.prisma.bookVolume.findUnique({ where: { id: volumeId } });
    if (!volume) throw new NotFoundException('卷宗不存在');
    return this.prisma.bookAnnotation.create({
      data: { volume_id: volumeId, anchor: body.anchor, note: body.note, created_by: userId },
    });
  }

  async deleteAnnotation(annotationId: bigint) {
    const ann = await this.prisma.bookAnnotation.findUnique({ where: { id: annotationId } });
    if (!ann) throw new NotFoundException('批注不存在');
    await this.prisma.bookAnnotation.delete({ where: { id: annotationId } });
  }

  // ==================== 分享只读链接（二期） ====================

  async createShareLink(clanId: bigint, userId: string, scope: string, token: string) {
    return this.prisma.shareLink.create({
      data: { clan_id: clanId, scope, token, created_by: userId },
    });
  }

  async listShareLinks(clanId: bigint) {
    return this.prisma.shareLink.findMany({
      where: { clan_id: clanId },
      orderBy: { created_at: 'desc' },
    });
  }

  async getShareLinkMeta(token: string) {
    return this.prisma.shareLink.findUnique({
      where: { token },
      select: { id: true, clan_id: true, token: true },
    });
  }

  async deleteShareLink(token: string) {
    const link = await this.prisma.shareLink.findUnique({ where: { token } });
    if (!link) throw new NotFoundException('分享链接不存在');
    await this.prisma.shareLink.delete({ where: { token } });
  }

  // ==================== 全文检索（一期 LIKE） ====================

  async search(clanId: bigint, q: string) {
    const keyword = q.trim();
    if (!keyword) return { persons: [], volumes: [] };

    const persons = await this.prisma.person.findMany({
      where: {
        clan_id: clanId,
        deleted_at: null,
        OR: [
          { full_name: { contains: keyword } },
          { bio: { is: { courtesy_name: { contains: keyword } } } },
          { bio: { is: { biography: { contains: keyword } } } },
          { bio: { is: { burial_place: { contains: keyword } } } },
        ],
      },
      select: {
        id: true,
        full_name: true,
        gender: true,
        birth_date: true,
        death_date: true,
        bio: { select: { courtesy_name: true, burial_place: true } },
      },
      take: 50,
    });

    const volumes = await this.prisma.bookVolume.findMany({
      where: {
        clan_id: clanId,
        type: 'document',
        content: { contains: keyword },
      },
      select: { id: true, title: true, sort_order: true },
      take: 20,
    });

    return {
      persons: persons.map((p) => ({
        person_id: p.id.toString(),
        full_name: p.full_name,
        gender: p.gender,
        courtesy_name: p.bio?.courtesy_name,
        burial_place: p.bio?.burial_place,
        birth_year: p.birth_date ? new Date(p.birth_date).getFullYear() : undefined,
        death_year: p.death_date ? new Date(p.death_date).getFullYear() : undefined,
      })),
      volumes: volumes.map((v) => ({ id: v.id.toString(), title: v.title, sort_order: v.sort_order })),
    };
  }

  // ==================== 导出（整本册谱：PDF / Word，二期扩展） ====================

  // 注：buildBookSections 已迁移到文件末尾（PR#1 重构）以支持按 layout 分流。

  /** 批注按 anchor 聚合，供导出选择输出（PR#1:统一只用 anchor 作为 key，buildBookSections 与 buildBookSections(section) 口径一致） */
  private async loadAnnotationMap(volumeIds: bigint[]): Promise<Map<string, string[]>> {
    const anns = await this.prisma.bookAnnotation.findMany({
      where: { volume_id: { in: volumeIds } },
      orderBy: { created_at: 'asc' },
    });
    const map = new Map<string, string[]>();
    for (const a of anns) {
      const key = a.anchor; // 'person:<id>' | 'para:<seq>'
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a.note);
    }
    return map;
  }

  /**
   * 整本 PDF（PR#1：支持世系表开本；二期：页眉页脚 + 批注可选输出）
   * @param opts.header 页眉文本（默认族谱名 + 导出日期）
   * @param opts.footer 页脚文本（默认页码模板）
   * @param opts.withAnnotations 是否输出批注
   * @param opts.forceLayout 强制版式 'su' | 'ou' | 'shixi_table' | undefined(按卷配置)
   */
  async exportPdf(
    clanId: bigint,
    opts: {
      header?: string;
      footer?: string;
      withAnnotations?: boolean;
      forceLayout?: 'su' | 'ou' | 'shixi_table';
    } = {},
  ): Promise<Buffer> {
    const [clan, volumes] = await Promise.all([
      this.prisma.clan.findUnique({ where: { id: clanId } }),
      this.getVolumes(clanId),
    ]);
    if (!clan) throw new NotFoundException('家族不存在');

    const annotationMap = opts.withAnnotations
      ? await this.loadAnnotationMap(volumes.map((v) => v.id))
      : new Map<string, string[]>();
    const sections = await this.buildBookSections(clanId, volumes, annotationMap, {
      forceLayout: opts.forceLayout,
    });

    const headerText = this.esc(opts.header || `${clan.name} · ${new Date().toLocaleDateString('zh-CN')}`);
    // 世系表开本对应的页脚格式:"第 X 页,共 Y 页"(与图片一致);其他保持 / 分隔
    const hasShixi = (opts.forceLayout ?? volumes.some((v) => (v.config as ShiluConfig | null)?.layout === 'shixi_table'));
    const footerText = this.esc(
      opts.footer ??
        (hasShixi
          ? '第 <span class="pageNumber"></span> 页,共 <span class="totalPages"></span> 页'
          : '第 <span class="pageNumber"></span> 页 / 共 <span class="totalPages"></span> 页'),
    );

    const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"/><style>
      body{font-family:'SimSun','KaiTi','Microsoft YaHei',serif;color:#333;margin:0;padding:24mm 20mm;}
      h1{text-align:center;font-family:'KaiTi',serif;font-size:26px;border-bottom:2px solid #333;padding-bottom:12px;}
      .vol-title{font-family:'KaiTi',serif;font-size:20px;margin:22px 0 10px;page-break-after:avoid;}
      .entry{margin:8px 0;page-break-inside:avoid;}
      .entry-head{font-size:14px;line-height:1.9;margin:0;}
      .bio{font-size:14px;line-height:1.9;margin:4px 0 4px 1em;text-indent:2em;}
      .annotation{font-size:12px;color:#8d6e63;margin:2px 0 2px 1em;}
      .vol-content{line-height:1.9;text-indent:2em;font-size:14px;}
      ${this.shixiTableCss()}
      </style></head><body>
      <h1>${this.esc(clan.name)}</h1>
      ${sections.join('')}
      </body></html>`;

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      executablePath: this.findBrowserPath(),
    });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'load' });
      await page.emulateMediaType('print');
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '20mm', right: '16mm', bottom: '20mm', left: '16mm' },
        displayHeaderFooter: true,
        headerTemplate: `<div style="font-size:9px;color:#888;width:100%;text-align:center;">${headerText}</div>`,
        footerTemplate: `<div style="font-size:9px;color:#888;width:100%;text-align:center;">${footerText}</div>`,
      });
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }

  /**
   * 导出 Word（.doc，Word 兼容 HTML；供线下二次编辑排版）
   * 与 PDF 同源内容（文档卷 + 苏式/欧式世录或世系表开本），可附批注。
   * PR#1 同步：世系表开本 layout='shixi_table' 一并支持；通过注入 shixiTableCss()
   *   + MSO @page 180mm×260mm 中式开本，让 Word 也按竖排、双层边框、姓名红色渲染。
   */
  async exportWord(
    clanId: bigint,
    opts: { withAnnotations?: boolean; forceLayout?: 'su' | 'ou' | 'shixi_table' } = {},
  ): Promise<Buffer> {
    const [clan, volumes] = await Promise.all([
      this.prisma.clan.findUnique({ where: { id: clanId } }),
      this.getVolumes(clanId),
    ]);
    if (!clan) throw new NotFoundException('家族不存在');

    const annotationMap = opts.withAnnotations
      ? await this.loadAnnotationMap(volumes.map((v) => v.id))
      : new Map<string, string[]>();
    const sections = await this.buildBookSections(clanId, volumes, annotationMap, {
      forceLayout: opts.forceLayout,
    });

    // 是否启用世系表开本(强制 > 卷配置),决定是否走中式开本页面尺寸
    const useShixiPage =
      opts.forceLayout === 'shixi_table' ||
      (opts.forceLayout === undefined &&
        volumes.some((v) => (v.config as ShiluConfig | null)?.layout === 'shixi_table'));

    // MSO @page:中式开本 180mm×260mm;非世系表保持 A4 纵向。mso-page-orientation
    // 让 MS Word 按指定方向排版,避免被默认 A4 横排挤压。
    const pageCss = useShixiPage
      ? `@page{size:180mm 260mm;mso-page-orientation:portrait;margin:0;} `
      : `@page{size:A4;mso-page-orientation:portrait;margin:24mm 20mm;} `;

    const html = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<?mso-application progid="Word.Document"?>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"/><title>${this.esc(clan.name)}</title>
<style>
${pageCss}body{font-family:'SimSun','KaiTi',serif;color:#333;}
h1{text-align:center;font-family:'KaiTi',serif;font-size:26px;border-bottom:2px solid #333;padding-bottom:12px;}
.vol-title{font-family:'KaiTi',serif;font-size:20px;margin:22px 0 10px;}
.entry{margin:8px 0;}
.entry-head{font-size:14px;line-height:1.9;margin:0;}
.bio{font-size:14px;line-height:1.9;margin:4px 0 4px 1em;text-indent:2em;}
.annotation{font-size:12px;color:#8d6e63;margin:2px 0 2px 1em;}
.vol-content{line-height:1.9;text-indent:2em;font-size:14px;}
${this.shixiTableCss()}
</style>
</head><body>
<h1>${this.esc(clan.name)}</h1>
${sections.join('')}
</body></html>`;

    return Buffer.from(html, 'utf-8');
  }

  private esc(s: string): string {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ==================== 世系表版式（PR#1 新增）===================
  // 传统中式开本:竖排、自上而下、从右向左;每页并列 <page_gen_count> 个世代。
  // 参照图片设计:右上角分页小圆圈;左下角竖排"族谱第 X 世至第 Y 世世系表";每列顶部灰色框红色"第 N 世";人物名红色楷体。

  /** 世系表单页 HTML:CSS 走 writing-mode: vertical-rl,代际从右到左 */
  private renderShixiTablePage(p: {
    gens: number[];
    entriesByGen: Map<number, ShiluEntry[]>;
    pageIdx: number;
    title: string;
    clanName?: string;
    cfg: ShiluConfig;
    density?: 'normal' | 'condense' | 'condense-strong';
  }): string {
    const surnameColor = p.cfg.surname_color ?? '#b22222';
    const showConnector = p.cfg.show_generation_connector !== false;
    const density = p.density ?? 'normal';
    const cols = p.gens
      .map((g) => {
        const list = (p.entriesByGen.get(g) || [])
          .slice()
          .sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999))
          .map((e) => this.renderShixiPersonHtml(e, surnameColor))
          .join('');
        return `<div class="shixi-col">
            <div class="shixi-col-header">第${g + 1}世</div>
            ${list}
          </div>`;
      })
      .join('');
    const connector = showConnector ? `<div class="shixi-connector"></div>` : '';
    const classes = ['shixi-page'];
    if (density === 'condense') classes.push('condense');
    if (density === 'condense-strong') classes.push('condense-strong');
    if (!showConnector) classes.push('no-connector');
    return `<section class="${classes.join(' ')}">
        <div class="shixi-page-dot"></div>
        <div class="shixi-title">${this.esc(p.title)}</div>
        ${connector}
        <div class="shixi-grid">${cols}</div>
      </section>`;
  }

  /**
   * 世系表"单代左右双列"页(用于单代人数过多时)
   * 同一代拆为左右两列(右列 = 人 1~N/2,左列 = N/2+1~N),共 1 页
   */
  private renderShixiSplitColPage(p: {
    gen: number;
    entries: ShiluEntry[];
    cfg: ShiluConfig;
  }): string {
    const surnameColor = p.cfg.surname_color ?? '#b22222';
    const showConnector = p.cfg.show_generation_connector !== false;
    const total = p.entries.length;
    const half = Math.ceil(total / 2);
    const rightArr = p.entries.slice(0, half);
    const leftArr = p.entries.slice(half);
    const renderCol = (arr: ShiluEntry[], label: string) =>
      `<div class="shixi-col"><div class="shixi-col-header">第${p.gen + 1}世·${label}</div>${arr
        .slice()
        .sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999))
        .map((e) => this.renderShixiPersonHtml(e, surnameColor))
        .join('')}</div>`;
    const classes = ['shixi-page', 'condense-strong'];
    if (!showConnector) classes.push('no-connector');
    const title = `族谱第${p.gen + 1}世世系表(${total}人)`;
    const connector = showConnector ? `<div class="shixi-connector"></div>` : '';
    return `<section class="${classes.join(' ')}">
        <div class="shixi-page-dot"></div>
        <div class="shixi-title">${this.esc(title)}</div>
        ${connector}
        <div class="shixi-grid">
          ${renderCol(rightArr, '前半')}
          ${renderCol(leftArr, '后半')}
        </div>
      </section>`;
  }

  /** 单个人物的 HTML 块：姓名块(最右,红字楷体大字) + 说明块(姓名左侧,多列布局)。
   * 【说明块】采用多列结构：每个信息字段(生卒/字号/籍贯/葬地/配偶/子女/功名)各自独立成一列,
   * 从右向左依次排列,符合传统中式族谱"古籍附录"式从右向左读排版。
   * 与前端 CepuPage.vue 的 shixiEntryHtml 同构,保证预览与导出 PDF 一致。 */
  private renderShixiPersonHtml(e: ShiluEntry, surnameColor: string): string {
    const fieldSpans: string[] = [];
    // 生卒(深灰)
    if (e.birth_year || e.death_year || e.is_living) {
      const birth = e.birth_year ? `${e.birth_year}` : '？';
      const death = e.is_living ? '今' : e.death_year ? `${e.death_year}` : '？';
      fieldSpans.push(`<div class="shixi-year">${birth}—${death}</div>`);
    }
    // 字号
    if (e.courtesy_name) fieldSpans.push(`<div class="shixi-line">字${this.esc(e.courtesy_name)}</div>`);
    // 籍贯
    if (e.native_place) fieldSpans.push(`<div class="shixi-line">籍${this.esc(e.native_place)}</div>`);
    // 葬地
    if (e.burial_place) fieldSpans.push(`<div class="shixi-line">葬${this.esc(e.burial_place)}</div>`);
    // 配偶(深蓝)
    if (e.spouses.length) {
      const sStr = e.spouses
        .map((s) => this.esc(s.name) + (s.native_place ? `（${this.esc(s.native_place)}）` : ''))
        .join('、');
      fieldSpans.push(`<div class="shixi-spouse">配${sStr}</div>`);
    }
    // 子女(深蓝)
    if (e.children.length) {
      const cStr = e.children
        .map((c) => this.esc(c.name) + (c.child_type && c.child_type !== 'BIOLOGICAL' ? '（继）' : ''))
        .join('、');
      fieldSpans.push(`<div class="shixi-children">子:${cStr}</div>`);
    }
    // 功名(棕褐加粗)
    if (e.achievements) fieldSpans.push(`<div class="shixi-achievement">${this.esc(e.achievements)}</div>`);
    // 轶事(棕褐)
    if (e.anecdotes) fieldSpans.push(`<div class="shixi-achievement">${this.esc(e.anecdotes)}</div>`);
    // 传记(独立列,可能较长)
    if (e.biography) fieldSpans.push(`<div class="shixi-bio">${this.esc(e.biography)}</div>`);
    const infoHtml = fieldSpans.length > 0
      ? `<div class="shixi-info">${fieldSpans.join('')}</div>`
      : '';
    return `<div class="shixi-person">`
      + `<div class="shixi-name" style="color:${surnameColor}">${this.esc(e.full_name)}</div>`
      + infoHtml
      + `</div>`;
  }

  /** 世系表卷分页:每 <pageGenCount> 个世代一页;单代人数过多时自动左右双列分页 */
  private buildShixiTablePages(
    entries: ShiluEntry[],
    cfg: ShiluConfig,
    _volumeLabel: string,
  ): string[] {
    const pageGen = Math.max(1, Math.min(20, cfg.page_gen_count ?? 5));
    const byGen = new Map<number, ShiluEntry[]>();
    for (const e of entries) {
      if (!byGen.has(e.generation)) byGen.set(e.generation, []);
      byGen.get(e.generation)!.push(e);
    }
    const sortedGens = [...byGen.keys()].sort((a, b) => a - b);
    if (sortedGens.length === 0) return [];
    const HARD_LIMIT = 16; // 单代人数 > 16 启用左右双列 split-page
    const pages: string[] = [];
    for (let i = 0; i < sortedGens.length; i += pageGen) {
      const chunkGens = sortedGens.slice(i, i + pageGen);
      let maxPerGen = 0;
      for (const g of chunkGens) {
        const list = byGen.get(g) || [];
        if (list.length > maxPerGen) maxPerGen = list.length;
      }
      if (maxPerGen <= HARD_LIMIT) {
        // 正常一页 + 自动密集模式
        const minGen = chunkGens[0];
        const maxGen = chunkGens[chunkGens.length - 1];
        const title =
          chunkGens.length === 1
            ? `族谱第${minGen + 1}世世系表`
            : `族谱第${minGen + 1}世至第${maxGen + 1}世世系表`;
        pages.push(
          this.renderShixiTablePage({
            gens: chunkGens,
            entriesByGen: byGen,
            pageIdx: pages.length + 1,
            title,
            cfg,
            density: this.pickShixiDensity(chunkGens, byGen),
          }),
        );
      } else {
        // chunk 内有单代人数过多,逐代渲染(>16 用 split-page,其它用标准)
        for (const g of chunkGens) {
          const list = byGen.get(g) || [];
          if (list.length <= HARD_LIMIT) {
            const title = `族谱第${g + 1}世世系表`;
            pages.push(
              this.renderShixiTablePage({
                gens: [g],
                entriesByGen: new Map([[g, list]]),
                pageIdx: pages.length + 1,
                title,
                cfg,
                density: this.pickShixiDensity([g], new Map([[g, list]])),
              }),
            );
          } else {
            pages.push(
              this.renderShixiSplitColPage({ gen: g, entries: list, cfg }),
            );
          }
        }
      }
    }
    return pages;
  }

  /** 自动判断世系表密度模式:标准 / 中等 / 强密集 */
  private pickShixiDensity(
    chunkGens: number[],
    byGen: Map<number, ShiluEntry[]>,
  ): 'normal' | 'condense' | 'condense-strong' {
    let maxPerGen = 0;
    for (const g of chunkGens) {
      const list = byGen.get(g) || [];
      if (list.length > maxPerGen) maxPerGen = list.length;
    }
    if (maxPerGen > 12) return 'condense-strong';
    if (maxPerGen > 6) return 'condense';
    return 'normal';
  }

  /** 世系表 CSS(Puppeteer 渲染用)
   * 与前端 CepuPage.vue 中 .shixi-* 同构(同语义、同字号、同颜色);语义化类名:
   * .shixi-name/.shixi-year/.shixi-line/.shixi-spouse/.shixi-children/
   * .shixi-achievement/.shixi-bio */
  private shixiTableCss(): string {
    return `
      .shixi-page{
        width:180mm; height:260mm;
        margin:0 auto 8mm;
        padding:24mm 12mm 14mm;
        box-sizing:border-box;
        position:relative;
        border:3px double #333;
        background:#fffdf6;
        writing-mode:vertical-rl;
        font-family:'KaiTi','SimSun','Songti SC','Microsoft YaHei',serif;
        page-break-after:always;
        break-after:page;
        overflow:hidden;
      }
      .shixi-page .shixi-page-dot{position:absolute; top:6mm; right:6mm; width:6mm; height:6mm; border:1.5px solid #333; border-radius:50%; background:#fffdf6; z-index:3;}
      .shixi-page .shixi-title{position:absolute; bottom:6mm; left:6mm; writing-mode:vertical-rl; font-family:'KaiTi','Songti SC',serif; color:#b22222; font-size:14pt; letter-spacing:8px; line-height:1.4; font-weight:600;}
      /* 顶端连接线：贯穿所有列顶端的水平线,被每列圆圈“穿过” */
      .shixi-connector{position:absolute; top:27mm; left:0; right:0; height:0; border-top:1.5px solid #333; writing-mode:horizontal-tb; pointer-events:none; z-index:2;}
      .shixi-page.no-connector .shixi-connector{display:none;}
      .shixi-grid{display:flex; flex-direction:row-reverse; height:100%; gap:3mm; align-items:stretch; position:relative;}
      /* 列：顶部留出空间给圆圈+列头,人物从下方纵向堆叠 */
      .shixi-col{flex:1 1 0; position:relative; padding:32mm 2mm 4mm; border-left:1px solid #888; display:flex; flex-direction:column; align-items:flex-end; justify-content:flex-start; gap:2mm; writing-mode:horizontal-tb; min-height:0;}
      .shixi-col:last-child{border-left:1px solid #888;}
      .shixi-col-header{position:absolute; top:17mm; left:50%; transform:translateX(-50%); background:#d9d9d9; border:1px solid #333; writing-mode:horizontal-tb; font-family:'KaiTi','Songti SC',serif; color:#b22222; font-size:14pt; font-weight:bold; padding:5px 12px; letter-spacing:6px; z-index:4;}
      /* 列顶端小圆圈：与上方的连接线交叉,形成传统吊线图 */
      .shixi-col::before{content:''; position:absolute; top:5mm; left:50%; transform:translateX(-50%); width:6mm; height:6mm; border:1.5px solid #333; border-radius:50%; background:#fffdf6; z-index:6; writing-mode:horizontal-tb; box-sizing:border-box;}
      .shixi-page.no-connector .shixi-col::before{display:none;}
      /* 人物：姓名块 + 说明块(多列布局)
       【说明块】是水平 flex + row-reverse,内部每个字段(div)是独立一列。
       姓名块(最右)与说明块(姓名左侧)各自走 vertical-rl。 */
      .shixi-person{display:flex; flex-direction:row-reverse; writing-mode:horizontal-tb; align-items:flex-start; min-height:50mm; max-height:170mm; flex-shrink:0; font-family:'KaiTi','Songti SC','SimSun','Microsoft YaHei',serif; overflow:hidden; gap:0;}
      /* 姓名块：独立列,红字楷体大字 */
      .shixi-person .shixi-name{writing-mode:vertical-rl; text-orientation:upright; text-align:center; font-family:'KaiTi','Songti SC',serif; font-size:20pt; font-weight:bold; line-height:1.05; flex-shrink:0; width:20pt; letter-spacing:0;}
      /* 说明块：水平 flex + row-reverse,内部字段各自独立成列
       * 横向空间不够时,字段自动向左换列(列方向),防止挤压字段 */
      .shixi-person .shixi-info{display:flex; flex-direction:row-reverse; writing-mode:horizontal-tb; align-items:flex-start; align-content:flex-start; flex-wrap:wrap-reverse; column-gap:2pt; row-gap:1pt; max-width:110pt; min-width:0; color:#1a1a1a;}
      /* 说明块内每个字段：vertical-rl,独立一列(字符宽 = 字号) */
      .shixi-person .shixi-info > div{writing-mode:vertical-rl; text-orientation:upright; text-align:center; font-size:9.5pt; line-height:1.6; letter-spacing:1px; flex-shrink:0; width:9.5pt; padding:0; margin:0 0.5pt; color:inherit;}
      /* 字段类型区分(类名同构) */
      .shixi-person .shixi-info .shixi-year{color:#1a1a1a; font-family:'Songti SC','SimSun',serif;}
      .shixi-person .shixi-info .shixi-line{color:#4a453e;}
      .shixi-person .shixi-info .shixi-spouse{color:#2c5282;}
      .shixi-person .shixi-info .shixi-children{color:#2c5282;}
      .shixi-person .shixi-info .shixi-achievement{color:#8b4513; font-weight:600;}
      .shixi-person .shixi-info .shixi-bio{color:#1a1a1a; font-size:9pt; line-height:1.9; letter-spacing:0.5px;}

      /* 中等密集模式: 7-12 人/代 */
      .shixi-page.condense .shixi-person{min-height:40mm; max-height:155mm;}
      .shixi-page.condense .shixi-person .shixi-name{font-size:17pt; width:17pt; line-height:1.05;}
      .shixi-page.condense .shixi-person .shixi-info{max-width:90pt; column-gap:2pt; row-gap:1pt;}
      .shixi-page.condense .shixi-person .shixi-info > div{font-size:9pt; width:9pt; line-height:1.5; margin:0 0.5pt;}
      .shixi-page.condense .shixi-person .shixi-info .shixi-bio{font-size:8pt; line-height:1.8;}
      .shixi-page.condense .shixi-col-header{font-size:12pt; padding:4px 10px; letter-spacing:4px;}
      .shixi-page.condense .shixi-title{font-size:12pt; letter-spacing:6px;}
      .shixi-page.condense .shixi-col{padding:28mm 2mm 4mm;}

      /* 强密集模式: >12 人/代 */
      .shixi-page.condense-strong .shixi-person{min-height:30mm; max-height:130mm;}
      .shixi-page.condense-strong .shixi-person .shixi-name{font-size:15pt; width:15pt;}
      .shixi-page.condense-strong .shixi-person .shixi-info{max-width:75pt; column-gap:1.5pt; row-gap:0.8pt;}
      .shixi-page.condense-strong .shixi-person .shixi-info > div{font-size:8pt; width:8pt; line-height:1.4; margin:0 0.3pt;}
      .shixi-page.condense-strong .shixi-person .shixi-info .shixi-bio{font-size:7pt; line-height:1.5;}
      .shixi-page.condense-strong .shixi-col-header{font-size:11pt; padding:3px 8px; letter-spacing:3px;}
      .shixi-page.condense-strong .shixi-col{padding:25mm 2mm 4mm;}
      .shixi-page.condense-strong .shixi-title{font-size:11pt; letter-spacing:4px;}
    `;
  }

  /** 整本册谱 PDF(PDF/Word 共用)section 渲染:按卷 config.layout 分流 */
  private async buildBookSections(
    clanId: bigint,
    volumes: any[],
    annotations: Map<string, string[]> = new Map(),
    options: { forceLayout?: 'su' | 'ou' | 'shixi_table' } = {},
  ): Promise<string[]> {
    const sections: string[] = [];
    for (const v of volumes) {
      if (v.type === 'document') {
        sections.push(`<h2 class="vol-title">${this.esc(v.title)}</h2><div class="vol-content">${v.content ?? ''}</div>`);
        continue;
      }
      const cfg = ((v.config as ShiluConfig | null) ?? {}) as ShiluConfig;
      // 强制版式 > 卷配置版式
      const layout = options.forceLayout ?? cfg.layout ?? 'su';
      const { entries } = await this.getVolume(clanId, v.id);

      if (layout === 'shixi_table') {
        const pages = this.buildShixiTablePages(entries, cfg, v.title);
        sections.push(
          pages.length
            ? `<h2 class="vol-title">${this.esc(v.title)}</h2>${pages.join('')}`
            : `<h2 class="vol-title">${this.esc(v.title)}</h2><div class="vol-content"><p>（该卷暂无世录条目）</p></div>`,
        );
        continue;
      }

      // 苏式 / 欧式 横排（一期既有逻辑迁移）
      const rows = entries
        .map((e) => {
          const rank = e.rank ? `第${e.rank} ` : '';
          const courtesy = e.courtesy_name ? `，字${e.courtesy_name}` : '';
          const years = e.birth_year
            ? `，${e.birth_year}${e.death_year ? ` - ${e.death_year}` : e.is_living ? ' - 今' : ''}`
            : '';
          const burial = e.burial_place ? `，葬${e.burial_place}` : '';
          const spouses = e.spouses.length
            ? `，配${e.spouses.map((s) => `${s.name}${s.native_place ? `（${s.native_place}）` : ''}`).join('、')}`
            : '';
          const kids = e.children.length
            ? `，子女：${e.children
                .map((c) => `${c.name}${c.child_type && c.child_type !== 'BIOLOGICAL' ? '（过继）' : ''}`)
                .join('、')}`
            : '';
          const bio = e.biography ? `<p class="bio">${this.esc(e.biography)}</p>` : '';
          const anns = annotations.get(`person:${e.person_id}`) || [];
          const annHtml = anns.length
            ? `<p class="annotation">批注:${anns.map((n) => this.esc(n)).join('；')}</p>`
            : '';
          return `<div class="entry"><p class="entry-head">${rank}${this.esc(e.full_name)}${courtesy}${years}${burial}${spouses}${kids}</p>${bio}${annHtml}</div>`;
        })
        .join('');
      sections.push(`<h2 class="vol-title">${this.esc(v.title)}</h2>${rows}`);
    }
    return sections;
  }
}
