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
  layout?: 'su' | 'ou'; // 一期只实现 su（苏式）
}

@Injectable()
export class CepuService {
  private readonly logger = new Logger(CepuService.name);
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
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.bookVolume.update({
        where: { id: volumeId },
        data: {
          ...(body.title !== undefined && { title: body.title }),
          ...(body.content !== undefined && volume.type === 'document' && { content: body.content }),
          ...(body.config !== undefined && volume.type === 'shilu' && { config: body.config }),
        },
      });
      await this.snapshotVolume(tx as any, updated, userId);
      return updated;
    });
  }

  // ==================== 卷宗版本历史（二期，决策清单 §F1） ====================

  /** 写一条版本快照（版本号 = 现有最大 + 1，可显式指定） */
  private async snapshotVolume(
    tx: any,
    volume: { id: bigint; title: string; content: string | null; config: any },
    userId: string,
    explicitVersion?: number,
  ) {
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
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.bookVolume.update({
        where: { id: volumeId },
        data: { title: snap.title, content: snap.content, config: snap.config },
      });
      await this.snapshotVolume(tx as any, updated, userId);
      return updated;
    });
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
    const persons = await this.prisma.person.findMany({
      where: { clan_id: clanId, deleted_at: null },
      select: { id: true, full_name: true, gender: true, birth_date: true, death_date: true, is_living: true },
    });
    if (persons.length === 0) return [];

    const personIds = persons.map((p) => p.id);
    const idStr = (id: bigint) => id.toString();

    // 1) 辈分 + 房派根：闭包表相对族根深度
    const root = await this.findClanRoot(clanId, personIds);
    const generationMap = new Map<string, number>();
    const branchRootMap = new Map<string, string>();
    if (root) {
      const rootAncestry = await this.prisma.personAncestry.findMany({
        where: { ancestor_id: root, descendant_id: { in: personIds } },
        select: { descendant_id: true, depth: true, ancestor_id: true },
      });
      // 若存在多个根（数据异常），取根可达的人
      for (const r of rootAncestry) {
        const d = idStr(r.descendant_id);
        if (!generationMap.has(d)) generationMap.set(d, r.depth);
      }
      // 房派根 = 深度 1 的祖先（始祖直接子女）；用 depth=1 父链向上回溯
      const parentEdges = await this.prisma.personAncestry.findMany({
        where: { ancestor_id: { in: personIds }, descendant_id: { in: personIds }, depth: 1 },
        select: { ancestor_id: true, descendant_id: true },
      });
      const parentOf = new Map<string, string>();
      for (const e of parentEdges) parentOf.set(idStr(e.descendant_id), idStr(e.ancestor_id));
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
    const familyChildren = await this.prisma.familyChild.findMany({
      where: { child_id: { in: personIds } },
      select: { child_id: true, birth_order: true, child_type: true, family_id: true },
    });
    const rankMap = new Map<string, number>();
    const childTypeMap = new Map<string, string>();
    const famRows = await this.prisma.familyUnit.findMany({
      where: { clan_id: clanId },
      select: { id: true, husband_id: true, wife_id: true },
    });
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

    // 3) 父子/配偶/子女/媒体 一次性预取
    const parentEdgesAll = await this.prisma.personAncestry.findMany({
      where: { ancestor_id: { in: personIds }, descendant_id: { in: personIds }, depth: 1 },
      select: { ancestor_id: true, descendant_id: true },
    });
    const fatherOf = new Map<string, string>();
    for (const e of parentEdgesAll) {
      const d = idStr(e.descendant_id);
      if (!fatherOf.has(d)) fatherOf.set(d, idStr(e.ancestor_id));
    }
    const nameById = new Map(persons.map((p) => [idStr(p.id), p.full_name]));
    const genderById = new Map(persons.map((p) => [idStr(p.id), p.gender]));

    const bios = await this.prisma.personBio.findMany({
      where: { person_id: { in: personIds } },
    });
    const bioById = new Map(bios.map((b) => [idStr(b.person_id), b]));

    const mediaLinks = await this.prisma.mediaPersonLink.findMany({
      where: { person_id: { in: personIds } },
      include: { media: { select: { file_url: true } } },
    });
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
      // 配偶：person 作为 husband/wife 的家庭，取对侧
      const spouses: ShiluEntry['spouses'] = [];
      const children: ShiluEntry['children'] = [];
      const bioOfOther = new Map<string, string>();
      for (const b of bios) bioOfOther.set(idStr(b.person_id), b.native_place ?? undefined);

      for (const f of famRows) {
        let spouseId: bigint | null = null;
        if (f.husband_id === p.id) spouseId = f.wife_id;
        else if (f.wife_id === p.id) spouseId = f.husband_id;
        if (spouseId == null) continue;

        const spouseStr = idStr(spouseId);
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

        const kids = childrenByFamily.get(f.id.toString()) ?? [];
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

  /** 定位族根（无父者，与 tree.findClanRootPerson 同口径） */
  private async findClanRoot(clanId: bigint, personIds: bigint[]) {
    const parentEdges = await this.prisma.personAncestry.findMany({
      where: { descendant_id: { in: personIds }, depth: 1 },
      select: { descendant_id: true },
    });
    const hasParent = new Set(parentEdges.map((e) => e.descendant_id.toString()));
    const roots = await this.prisma.person.findMany({
      where: { clan_id: clanId, deleted_at: null },
      orderBy: { id: 'asc' },
      select: { id: true },
    });
    const root = roots.find((r) => !hasParent.has(r.id.toString())) ?? roots[0];
    return root?.id ?? null;
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

  /** 公共章节构建：文档卷内容 + 世录卷条目（苏式文本），可选附带批注 */
  private async buildBookSections(
    clanId: bigint,
    volumes: any[],
    annotations: Map<string, string[]> = new Map(),
  ): Promise<string[]> {
    const sections: string[] = [];
    for (const v of volumes) {
      if (v.type === 'document') {
        sections.push(`<h2 class="vol-title">${this.esc(v.title)}</h2><div class="vol-content">${v.content ?? ''}</div>`);
      } else {
        const { entries } = await this.getVolume(clanId, v.id);
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
            // 批注（可选输出）
            const anns = annotations.get(`person:${e.person_id}`) || [];
            const annHtml = anns.length
              ? `<p class="annotation">批注：${anns.map((n) => this.esc(n)).join('；')}</p>`
              : '';
            return `<div class="entry"><p class="entry-head">${rank}${this.esc(e.full_name)}${courtesy}${years}${burial}${spouses}${kids}</p>${bio}${annHtml}</div>`;
          })
          .join('');
        sections.push(`<h2 class="vol-title">${this.esc(v.title)}</h2>${rows}`);
      }
    }
    return sections;
  }

  /** 批注按 (volumeId, anchor) 聚合，供导出选择输出 */
  private async loadAnnotationMap(volumeIds: bigint[]): Promise<Map<string, string[]>> {
    const anns = await this.prisma.bookAnnotation.findMany({
      where: { volume_id: { in: volumeIds } },
      orderBy: { created_at: 'asc' },
    });
    const map = new Map<string, string[]>();
    for (const a of anns) {
      const key = `${a.volume_id}:${a.anchor}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a.note);
    }
    return map;
  }

  /**
   * 整本 PDF（二期：支持页眉页脚自定义 + 批注可选输出）
   * @param opts.header 页眉文本（默认族谱名 + 导出日期）
   * @param opts.footer 页脚文本（默认页码模板）
   * @param opts.withAnnotations 是否输出批注
   */
  async exportPdf(
    clanId: bigint,
    opts: { header?: string; footer?: string; withAnnotations?: boolean } = {},
  ): Promise<Buffer> {
    const [clan, volumes] = await Promise.all([
      this.prisma.clan.findUnique({ where: { id: clanId } }),
      this.getVolumes(clanId),
    ]);
    if (!clan) throw new NotFoundException('家族不存在');

    const annotationMap = opts.withAnnotations
      ? await this.loadAnnotationMap(volumes.map((v) => v.id))
      : new Map<string, string[]>();
    const sections = await this.buildBookSections(clanId, volumes, annotationMap);

    const headerText = this.esc(opts.header || `${clan.name} · ${new Date().toLocaleDateString('zh-CN')}`);
    const footerText = this.esc(opts.footer ?? '第 <span class="pageNumber"></span> 页 / 共 <span class="totalPages"></span> 页');

    const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"/><style>
      body{font-family:'SimSun','KaiTi','Microsoft YaHei',serif;color:#333;margin:0;padding:24mm 20mm;}
      h1{text-align:center;font-family:'KaiTi',serif;font-size:26px;border-bottom:2px solid #333;padding-bottom:12px;}
      .vol-title{font-family:'KaiTi',serif;font-size:20px;margin:22px 0 10px;page-break-after:avoid;}
      .entry{margin:8px 0;page-break-inside:avoid;}
      .entry-head{font-size:14px;line-height:1.9;margin:0;}
      .bio{font-size:14px;line-height:1.9;margin:4px 0 4px 1em;text-indent:2em;}
      .annotation{font-size:12px;color:#8d6e63;margin:2px 0 2px 1em;}
      .vol-content{line-height:1.9;text-indent:2em;font-size:14px;}
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
   * 与 PDF 同源内容（文档卷 + 苏式世录文本），可附批注。
   */
  async exportWord(
    clanId: bigint,
    opts: { withAnnotations?: boolean } = {},
  ): Promise<Buffer> {
    const [clan, volumes] = await Promise.all([
      this.prisma.clan.findUnique({ where: { id: clanId } }),
      this.getVolumes(clanId),
    ]);
    if (!clan) throw new NotFoundException('家族不存在');

    const annotationMap = opts.withAnnotations
      ? await this.loadAnnotationMap(volumes.map((v) => v.id))
      : new Map<string, string[]>();
    const sections = await this.buildBookSections(clanId, volumes, annotationMap);

    const html = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<?mso-application progid="Word.Document"?>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"/><title>${this.esc(clan.name)}</title>
<style>
body{font-family:'SimSun','KaiTi',serif;color:#333;}
h1{text-align:center;font-family:'KaiTi',serif;font-size:26px;border-bottom:2px solid #333;padding-bottom:12px;}
.vol-title{font-family:'KaiTi',serif;font-size:20px;margin:22px 0 10px;}
.entry{margin:8px 0;}
.entry-head{font-size:14px;line-height:1.9;margin:0;}
.bio{font-size:14px;line-height:1.9;margin:4px 0 4px 1em;text-indent:2em;}
.annotation{font-size:12px;color:#8d6e63;margin:2px 0 2px 1em;}
.vol-content{line-height:1.9;text-indent:2em;font-size:14px;}
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
}
