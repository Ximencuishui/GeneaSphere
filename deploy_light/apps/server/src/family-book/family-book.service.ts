import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@geneasphere/db';
import {
  CreateFamilyBookDto,
  UpdateFamilyBookDto,
  UpdateFamilyBookPageDto,
  PlaceFamilyBookOrderDto,
} from './dto/family-book.dto';

// 内部枚举字面量类型（与 Prisma schema 保持一致）
type FamilyBookGrouping = 'family' | 'branch' | 'generation';
type FamilyBookPageType =
  | 'cover'
  | 'toc'
  | 'section'
  | 'person'
  | 'family'
  | 'epilogue';
type FamilyBookStatus = 'draft' | 'preview' | 'ordered';

/**
 * 家庭图册服务
 *
 * 业务逻辑：
 *  1) 以起始人物为根，沿血缘向下延展 N 代，收集所有人 + 配偶；
 *  2) 按 family/branch/generation 分组；
 *  3) 为每个人物自动选择代表照片（来自 media_archives 关联）；
 *  4) 生成包含封面/目录/章节/人物页/后记的完整页面内容；
 *  5) 支持编辑页面文本、复用 print_orders 完成下单。
 */

interface CollectedPerson {
  id: bigint;
  full_name: string;
  gender: 'male' | 'female';
  birth_date?: Date | null;
  death_date?: Date | null;
  birth_place?: string | null;
  is_living: boolean;
  bio?: string | null;
  occupation?: string | null;
  residence?: string | null;
  generation: number; // 0=起始，1=子女，2=孙辈 …
  branch?: string | null;
  is_spouse: boolean;
  parent_id?: bigint | null;
  photo_url?: string | null;
}

interface FamilyGroup {
  family_id: string;
  title: string;
  husband?: CollectedPerson;
  wife?: CollectedPerson;
  children: CollectedPerson[];
  generation: number;
  branch?: string | null;
}

const COVER_TEMPLATE_LABELS: Record<string, string> = {
  red: '喜庆红',
  gold: '典雅金',
  green: '清新绿',
  ink: '水墨风',
  modern: '现代简约',
};

const FIELD_LABELS: Record<string, string> = {
  name: '姓名',
  photo: '照片',
  birth: '生年',
  death: '卒年',
  bio: '简介',
  occupation: '职业',
  residence: '住址',
  birth_place: '出生地',
};

const PRICE_PER_PAGE = 6; // 简化的报价：每页 6 元（A4 精装基价）

@Injectable()
export class FamilyBookService {
  /** 通过 (this.prisma as any) 访问新模型，避免 prisma generate 前类型报错 */
  private get db() {
    return this.prisma as any;
  }

  constructor(private readonly prisma: PrismaService) {}

  // ============================================================
  //                    项目 CRUD
  // ============================================================

  /**
   * 创建家庭图册项目（draft 状态）
   */
  async createProject(
    userId: string,
    clanId: bigint,
    dto: CreateFamilyBookDto,
  ) {
    const person = await this.prisma.person.findFirst({
      where: { id: BigInt(dto.start_person_id), clan_id: clanId },
    });
    if (!person) {
      throw new BadRequestException('起始人物不存在或不属于当前家族');
    }

    const title =
      dto.title?.trim() ||
      this.autoGenerateTitle(person.full_name, dto.generations ?? 3);

    const project = await this.db.familyBookProject.create({
      data: {
        user_id: userId,
        clan_id: clanId,
        start_person_id: BigInt(dto.start_person_id),
        generations: dto.generations ?? 3,
        include_spouse: dto.include_spouse ?? true,
        grouping: (dto.grouping ?? 'family') as FamilyBookGrouping,
        selected_fields:
          dto.selected_fields ?? ['name', 'photo', 'birth', 'bio'],
        cover_template: dto.cover_template ?? 'red',
        title: title.slice(0, 200),
        preface: dto.preface ?? null,
        status: 'draft',
      },
    });

    return {
      id: project.id.toString(),
      message: '家庭图册项目已创建',
    };
  }

  /**
   * 获取我的家庭图册项目列表
   */
  async listMyProjects(
    userId: string,
    page: number,
    pageSize: number,
  ): Promise<{ data: any[]; pagination: any }> {
    const skip = (page - 1) * pageSize;
    const where = { user_id: userId };

    const [projects, total] = await Promise.all([
      this.db.familyBookProject.findMany({
        where,
        include: {
          start_person: {
            select: { id: true, full_name: true, gender: true },
          },
          print_order: { select: { id: true, status: true } },
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: pageSize,
      }),
      this.db.familyBookProject.count({ where }),
    ]);

    const data = projects.map((p: any) => ({
      id: p.id.toString(),
      title: p.title,
      start_person: {
        id: p.start_person.id.toString(),
        full_name: p.start_person.full_name,
        gender: p.start_person.gender,
      },
      generations: p.generations,
      grouping: p.grouping,
      cover_template: p.cover_template,
      page_count: p.page_count,
      person_count: p.person_count,
      estimated_price: Number(p.estimated_price),
      status: p.status,
      print_order: p.print_order
        ? {
            id: p.print_order.id.toString(),
            status: p.print_order.status,
          }
        : null,
      created_at: p.created_at.toISOString(),
      updated_at: p.updated_at.toISOString(),
    }));

    return {
      data,
      pagination: {
        page,
        page_size: pageSize,
        total,
        total_pages: Math.ceil(total / pageSize) || 1,
      },
    };
  }

  /**
   * 获取项目详情（含分页内容）
   */
  async getProjectDetail(projectId: string, userId: string) {
    const project = await this.db.familyBookProject.findFirst({
      where: { id: BigInt(projectId), user_id: userId },
      include: {
        start_person: {
          select: {
            id: true,
            full_name: true,
            gender: true,
            birth_date: true,
            death_date: true,
          },
        },
        pages: {
          orderBy: { page_number: 'asc' },
        },
        print_order: {
          select: { id: true, status: true, specification: true },
        },
      },
    });

    if (!project) {
      throw new NotFoundException('家庭图册项目不存在');
    }

    return {
      id: project.id.toString(),
      title: project.title,
      preface: project.preface,
      start_person: {
        id: project.start_person.id.toString(),
        full_name: project.start_person.full_name,
        gender: project.start_person.gender,
        birth_date: project.start_person.birth_date?.toISOString() ?? null,
        death_date: project.start_person.death_date?.toISOString() ?? null,
      },
      generations: project.generations,
      include_spouse: project.include_spouse,
      grouping: project.grouping,
      selected_fields: project.selected_fields,
      cover_template: project.cover_template,
      page_count: project.page_count,
      person_count: project.person_count,
      estimated_price: Number(project.estimated_price),
      status: project.status,
      print_order: project.print_order
        ? {
            id: project.print_order.id.toString(),
            status: project.print_order.status,
            specification: project.print_order.specification,
          }
        : null,
      pages: project.pages.map((p: any) => ({
        id: p.id.toString(),
        page_number: p.page_number,
        page_type: p.page_type,
        title: p.title,
        subtitle: p.subtitle,
        body: p.body,
        content: p.content,
      })),
      created_at: project.created_at.toISOString(),
      updated_at: project.updated_at.toISOString(),
    };
  }

  /**
   * 更新项目设置
   */
  async updateProject(
    projectId: string,
    userId: string,
    dto: UpdateFamilyBookDto,
  ) {
    const project = await this.db.familyBookProject.findFirst({
      where: { id: BigInt(projectId), user_id: userId },
    });
    if (!project) throw new NotFoundException('项目不存在');

    await this.db.familyBookProject.update({
      where: { id: project.id },
      data: {
        generations: dto.generations ?? undefined,
        include_spouse: dto.include_spouse ?? undefined,
        grouping: (dto.grouping as FamilyBookGrouping) ?? undefined,
        selected_fields: dto.selected_fields ?? undefined,
        cover_template: (dto.cover_template as any) ?? undefined,
        title: dto.title?.trim() || undefined,
        preface: dto.preface ?? undefined,
      },
    });

    return { message: '项目已更新' };
  }

  /**
   * 删除项目
   */
  async deleteProject(projectId: string, userId: string) {
    const project = await this.db.familyBookProject.findFirst({
      where: { id: BigInt(projectId), user_id: userId },
    });
    if (!project) throw new NotFoundException('项目不存在');

    await this.db.familyBookProject.delete({
      where: { id: project.id },
    });
    return { message: '项目已删除' };
  }

  // ============================================================
  //                  预览 / 内容生成
  // ============================================================

  /**
   * 预览：估算人数与页数（不写入 pages 表）
   */
  async previewProject(projectId: string, userId: string) {
    const project = await this.db.familyBookProject.findFirst({
      where: { id: BigInt(projectId), user_id: userId },
    });
    if (!project) throw new NotFoundException('项目不存在');

    const persons = await this.collectDescendants(
      project.start_person_id,
      project.generations,
      project.include_spouse,
    );

    const groups = this.groupPersons(persons, project.grouping);
    const pageCount = this.computePageCount(groups, project.selected_fields);

    return {
      person_count: persons.length,
      group_count: groups.length,
      page_count: pageCount,
      estimated_price: +(pageCount * PRICE_PER_PAGE).toFixed(2),
    };
  }

  /**
   * 生成预览：写入 pages 表，状态变为 preview
   */
  async generatePreview(projectId: string, userId: string) {
    const project = await this.db.familyBookProject.findFirst({
      where: { id: BigInt(projectId), user_id: userId },
      include: {
        start_person: {
          select: { id: true, full_name: true, gender: true },
        },
      },
    });
    if (!project) throw new NotFoundException('项目不存在');

    const persons = await this.collectDescendants(
      project.start_person_id,
      project.generations,
      project.include_spouse,
    );
    const groups = this.groupPersons(persons, project.grouping);
    const pages = this.buildPages(project, persons, groups);

    // 清除旧 page 内容，重新写入
    await this.db.familyBookPage.deleteMany({
      where: { project_id: project.id },
    });

    if (pages.length > 0) {
      await this.db.familyBookPage.createMany({
        data: pages.map((p) => ({
          project_id: project.id,
          page_number: p.page_number,
          page_type: p.page_type,
          title: p.title ?? null,
          subtitle: p.subtitle ?? null,
          body: p.body ?? null,
          content: p.content,
        })),
      });
    }

    const estimatedPrice = +(pages.length * PRICE_PER_PAGE).toFixed(2);

    await this.db.familyBookProject.update({
      where: { id: project.id },
      data: {
        page_count: pages.length,
        person_count: persons.length,
        estimated_price: estimatedPrice,
        status: 'preview',
      },
    });

    return {
      message: '预览已生成',
      page_count: pages.length,
      person_count: persons.length,
      estimated_price: estimatedPrice,
    };
  }

  /**
   * 编辑某个页面的文本内容
   */
  async updatePage(
    projectId: string,
    userId: string,
    pageId: string,
    dto: UpdateFamilyBookPageDto,
  ) {
    const project = await this.db.familyBookProject.findFirst({
      where: { id: BigInt(projectId), user_id: userId },
    });
    if (!project) throw new NotFoundException('项目不存在');

    const page = await this.db.familyBookPage.findFirst({
      where: { id: BigInt(pageId), project_id: project.id },
    });
    if (!page) throw new NotFoundException('页面不存在');

    await this.db.familyBookPage.update({
      where: { id: page.id },
      data: {
        title: dto.title ?? undefined,
        subtitle: dto.subtitle ?? undefined,
        body: dto.body ?? undefined,
      },
    });

    return { message: '页面已更新' };
  }

  // ============================================================
  //                  印刷下单
  // ============================================================

  /**
   * 一键下单印刷：基于已有 pages 数量创建 print_orders 记录
   */
  async placePrintOrder(
    projectId: string,
    userId: string,
    clanId: bigint,
    dto: PlaceFamilyBookOrderDto,
  ) {
    const project = await this.db.familyBookProject.findFirst({
      where: { id: BigInt(projectId), user_id: userId },
    });
    if (!project) throw new NotFoundException('项目不存在');
    if (project.status !== 'preview') {
      throw new BadRequestException('仅预览状态的项目可以下单，请先生成预览');
    }

    const pages = await this.db.familyBookPage.count({
      where: { project_id: project.id },
    });
    if (pages === 0) {
      throw new BadRequestException('项目内容为空，无法下单');
    }

    const quantity = dto.quantity ?? 1;
    const unitPrice = +(pages * PRICE_PER_PAGE).toFixed(2);
    const totalAmount = +(unitPrice * quantity).toFixed(2);

    const order = await (this.prisma as any).printOrder.create({
      data: {
        clan_id: clanId,
        user_id: userId,
        specification: dto.specification,
        quantity,
        amount: totalAmount,
        status: 'PENDING',
        shipping_address: dto.shipping_address ?? undefined,
        family_book_project_id: project.id,
      },
    });

    await this.db.familyBookProject.update({
      where: { id: project.id },
      data: { status: 'ordered' as FamilyBookStatus },
    });

    return {
      message: '已下单',
      print_order_id: order.id.toString(),
      amount: totalAmount,
      page_count: pages,
      quantity,
    };
  }

  // ============================================================
  //                  家族成员搜索
  // ============================================================

  async searchPersons(clanId: bigint, keyword: string, limit: number) {
    const where: any = { clan_id: clanId };
    if (keyword?.trim()) {
      where.full_name = { contains: keyword.trim(), mode: 'insensitive' };
    }
    const persons = await this.prisma.person.findMany({
      where,
      select: {
        id: true,
        full_name: true,
        gender: true,
        birth_date: true,
        death_date: true,
      },
      orderBy: { full_name: 'asc' },
      take: Math.min(limit, 50),
    });
    return persons.map((p) => ({
      id: p.id.toString(),
      full_name: p.full_name,
      gender: p.gender,
      birth_date: p.birth_date?.toISOString() ?? null,
      death_date: p.death_date?.toISOString() ?? null,
    }));
  }

  // ============================================================
  //                  内部工具方法
  // ============================================================

  private autoGenerateTitle(name: string, generations: number): string {
    return `${name}家族·${generations}代同堂`;
  }

  /**
   * 沿血缘向下收集指定代数内的所有人 + 配偶
   */
  private async collectDescendants(
    rootId: bigint,
    generations: number,
    includeSpouse: boolean,
  ): Promise<CollectedPerson[]> {
    const result: CollectedPerson[] = [];
    const visited = new Set<string>();

    const root = await this.prisma.person.findUnique({
      where: { id: rootId },
      include: { media_links: { take: 1, include: { media: true } } },
    });
    if (!root) {
      throw new BadRequestException('起始人物不存在');
    }

    result.push(this.toCollected(root, 0, false, null, null));
    visited.add(root.id.toString());

    let currentLevel: bigint[] = [rootId];

    for (let gen = 1; gen <= generations; gen++) {
      const nextLevel: bigint[] = [];
      for (const pid of currentLevel) {
        const families = await this.prisma.familyUnit.findMany({
          where: {
            OR: [{ husband_id: pid }, { wife_id: pid }],
          },
        });
        for (const fam of families) {
          // 子女
          const children = await this.prisma.familyChild.findMany({
            where: { family_id: fam.id },
            orderBy: { birth_order: 'asc' },
          });
          for (const ch of children) {
            if (visited.has(ch.child_id.toString())) continue;
            const child = await this.prisma.person.findUnique({
              where: { id: ch.child_id },
              include: {
                media_links: { take: 1, include: { media: true } },
              },
            });
            if (!child) continue;
            visited.add(child.id.toString());
            result.push(
              this.toCollected(
                child,
                gen,
                false,
                pid,
                child.migration_branch,
              ),
            );
            nextLevel.push(child.id);
          }

          // 配偶
          if (includeSpouse) {
            const spouseId =
              fam.husband_id?.toString() === pid.toString()
                ? fam.wife_id
                : fam.husband_id;
            if (spouseId && !visited.has(spouseId.toString())) {
              const spouse = await this.prisma.person.findUnique({
                where: { id: spouseId },
                include: {
                  media_links: { take: 1, include: { media: true } },
                },
              });
              if (spouse) {
                visited.add(spouse.id.toString());
                result.push(
                  this.toCollected(
                    spouse,
                    gen,
                    true,
                    pid,
                    spouse.migration_branch,
                  ),
                );
              }
            }
          }
        }
      }
      currentLevel = nextLevel;
      if (currentLevel.length === 0) break;
    }

    return result;
  }

  private toCollected(
    p: any,
    generation: number,
    isSpouse: boolean,
    parentId: bigint | null,
    branch: string | null,
  ): CollectedPerson {
    const media = p.media_links?.[0]?.media;
    return {
      id: p.id,
      full_name: p.full_name,
      gender: p.gender,
      birth_date: p.birth_date ?? null,
      death_date: p.death_date ?? null,
      birth_place: p.birth_place ?? null,
      is_living: p.is_living,
      bio: p.bio ?? null,
      occupation: p.occupation ?? null,
      residence: p.residence ?? null,
      generation,
      is_spouse: isSpouse,
      branch,
      parent_id: parentId,
      photo_url: media?.file_url ?? null,
    };
  }

  /**
   * 按所选分组方式对人员分组
   */
  private groupPersons(
    persons: CollectedPerson[],
    grouping: FamilyBookGrouping,
  ): FamilyGroup[] {
    if (grouping === 'family') return this.groupByFamily(persons);
    if (grouping === 'branch') return this.groupByBranch(persons);
    return this.groupByGeneration(persons);
  }

  /**
   * 按家庭（每对夫妻 + 子女为一组）
   */
  private groupByFamily(persons: CollectedPerson[]): FamilyGroup[] {
    const groups: FamilyGroup[] = [];
    const used = new Set<string>();
    const groupsByParent = new Map<string, FamilyGroup>();

    for (const p of persons) {
      if (p.is_spouse) continue;
      const key = `gen${p.generation}-${p.id.toString()}`;
      if (!groupsByParent.has(key)) {
        const group: FamilyGroup = {
          family_id: key,
          title: `${p.full_name}之家`,
          children: [],
          generation: p.generation,
          branch: p.branch,
        };
        const spouse = persons.find(
          (q) => q.is_spouse && q.parent_id?.toString() === p.id.toString(),
        );
        if (spouse) group.wife = spouse;
        groupsByParent.set(key, group);
        groups.push(group);
      }
      const grp = groupsByParent.get(key)!;
      if (p.gender === 'male' && !grp.husband) grp.husband = p;
      else if (p.gender === 'female' && !grp.wife) grp.wife = p;
      else if (!grp.husband) grp.husband = p;
      used.add(p.id.toString());
    }

    for (const p of persons) {
      if (!p.is_spouse || used.has(p.id.toString())) continue;
      const target = groups.find(
        (g) =>
          g.generation === p.generation &&
          (g.husband?.id.toString() === p.parent_id?.toString() ||
            g.wife?.id.toString() === p.parent_id?.toString()),
      );
      if (target) {
        if (p.gender === 'male' && !target.husband) target.husband = p;
        else if (p.gender === 'female' && !target.wife) target.wife = p;
      } else {
        const key = `gen${p.generation}-spouse-${p.id.toString()}`;
        groups.push({
          family_id: key,
          title: `${p.full_name}之家`,
          husband: p.gender === 'male' ? p : undefined,
          wife: p.gender === 'female' ? p : undefined,
          children: [],
          generation: p.generation,
          branch: p.branch,
        });
      }
      used.add(p.id.toString());
    }

    // 收集子女
    for (const p of persons) {
      if (p.is_spouse) continue;
      if (!p.parent_id) continue;
      const target = groups.find((g) => {
        const husbandId = g.husband?.id.toString();
        const wifeId = g.wife?.id.toString();
        return (
          husbandId === p.parent_id?.toString() ||
          wifeId === p.parent_id?.toString()
        );
      });
      if (
        target &&
        !target.children.find(
          (c) => c.id.toString() === p.id.toString(),
        )
      ) {
        target.children.push(p);
      }
    }

    for (const g of groups) {
      g.children.sort((a, b) => {
        const ay = a.birth_date ? new Date(a.birth_date).getTime() : 0;
        const by = b.birth_date ? new Date(b.birth_date).getTime() : 0;
        return ay - by;
      });
    }

    groups.sort((a, b) => {
      if (a.generation !== b.generation) return a.generation - b.generation;
      const ay = a.children[0]?.birth_date
        ? new Date(a.children[0].birth_date).getTime()
        : 0;
      const by = b.children[0]?.birth_date
        ? new Date(b.children[0].birth_date).getTime()
        : 0;
      return ay - by;
    });

    return groups;
  }

  /**
   * 按房支分组（按起始人物的子女分支）
   */
  private groupByBranch(persons: CollectedPerson[]): FamilyGroup[] {
    const firstGen = persons.filter(
      (p) => p.generation === 1 && !p.is_spouse,
    );
    const groups: FamilyGroup[] = firstGen
      .sort((a, b) => {
        const ay = a.birth_date ? new Date(a.birth_date).getTime() : 0;
        const by = b.birth_date ? new Date(b.birth_date).getTime() : 0;
        return ay - by;
      })
      .map((p, idx) => {
        const branchName = p.branch || this.chineseBranchName(idx + 1);
        const familyGroups = this.collectBranchSubtree(p.id, persons);
        return {
          family_id: `branch-${p.id.toString()}`,
          title: `${branchName}（${p.full_name}）`,
          husband: familyGroups.husband,
          wife: familyGroups.wife,
          children: familyGroups.children,
          generation: 1,
          branch: branchName,
        };
      });

    const root = persons.find((p) => p.generation === 0);
    if (root) {
      groups.unshift({
        family_id: 'root',
        title: `${root.full_name}（始祖）`,
        husband: root.gender === 'male' ? root : undefined,
        wife: root.gender === 'female' ? root : undefined,
        children: [],
        generation: 0,
      });
    }

    return groups;
  }

  /**
   * 递归收集某个分支下的所有后代人员
   */
  private collectBranchSubtree(
    rootId: bigint,
    persons: CollectedPerson[],
  ): {
    husband?: CollectedPerson;
    wife?: CollectedPerson;
    children: CollectedPerson[];
  } {
    const root = persons.find(
      (p) => p.id.toString() === rootId.toString(),
    );
    if (!root) return { children: [] };
    const spouse = persons.find(
      (p) => p.is_spouse && p.parent_id?.toString() === rootId.toString(),
    );
    const children = persons.filter(
      (p) =>
        !p.is_spouse &&
        (p.parent_id?.toString() === rootId.toString() ||
          this.isDescendantOf(p.id, rootId, persons)),
    );
    return {
      husband: root.gender === 'male' ? root : undefined,
      wife: spouse ?? (root.gender === 'female' ? root : undefined),
      children,
    };
  }

  /**
   * 判断 target 是否是 root 的后代
   */
  private isDescendantOf(
    target: bigint,
    root: bigint,
    persons: CollectedPerson[],
  ): boolean {
    let cur = persons.find((p) => p.id.toString() === target.toString());
    while (cur && cur.parent_id) {
      if (cur.parent_id.toString() === root.toString()) return true;
      cur = persons.find(
        (p) => p.id.toString() === cur!.parent_id!.toString(),
      );
    }
    return false;
  }

  /**
   * 中文房支命名
   */
  private chineseBranchName(idx: number): string {
    const names = [
      '长房',
      '二房',
      '三房',
      '四房',
      '五房',
      '六房',
      '七房',
      '八房',
      '九房',
      '十房',
    ];
    return names[idx - 1] ?? `第${idx}房`;
  }

  /**
   * 按世代分组
   */
  private groupByGeneration(persons: CollectedPerson[]): FamilyGroup[] {
    const map = new Map<number, CollectedPerson[]>();
    for (const p of persons) {
      const list = map.get(p.generation) || [];
      list.push(p);
      map.set(p.generation, list);
    }
    const groups: FamilyGroup[] = [];
    const generations = Array.from(map.keys()).sort((a, b) => a - b);
    for (const g of generations) {
      const members = map.get(g)!;
      groups.push({
        family_id: `gen-${g}`,
        title: `第${g === 0 ? '一' : this.numToChinese(g + 1)}代`,
        children: members,
        generation: g,
      });
    }
    return groups;
  }

  /**
   * 数字转中文
   */
  private numToChinese(n: number): string {
    const digits = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
    if (n < 10) return digits[n] ?? String(n);
    if (n === 10) return '十';
    if (n < 20) return `十${digits[n - 10]}`;
    if (n < 100) {
      const t = Math.floor(n / 10);
      const o = n % 10;
      return `${digits[t]}十${o === 0 ? '' : digits[o]}`;
    }
    return String(n);
  }

  /**
   * 计算页数：封面1 + 目录1 + 后记1 + 每个组 1~2 页
   */
  private computePageCount(
    groups: FamilyGroup[],
    _selectedFields: string[],
  ): number {
    let count = 3; // cover + toc + epilogue
    for (const g of groups) {
      const members = [g.husband, g.wife, ...g.children].filter(
        (m): m is CollectedPerson => !!m,
      );
      count += Math.max(1, members.length);
    }
    return count;
  }

  /**
   * 构造完整的页面内容
   */
  private buildPages(
    project: any,
    persons: CollectedPerson[],
    groups: FamilyGroup[],
  ): {
    page_number: number;
    page_type: FamilyBookPageType;
    title?: string | null;
    subtitle?: string | null;
    body?: string | null;
    content: any;
  }[] {
    const pages: any[] = [];
    let pageNo = 1;

    // 1. 封面
    pages.push({
      page_number: pageNo++,
      page_type: 'cover' as FamilyBookPageType,
      title: project.title,
      subtitle: COVER_TEMPLATE_LABELS[project.cover_template] || '家庭图册',
      body: project.preface ?? null,
      content: {
        template: project.cover_template,
        title: project.title,
        start_person_name: project.start_person?.full_name,
        generations: project.generations,
        person_count: persons.length,
        created_at: new Date().toISOString(),
      },
    });

    // 2. 目录
    pages.push({
      page_number: pageNo++,
      page_type: 'toc' as FamilyBookPageType,
      title: '目录',
      subtitle: null,
      body: null,
      content: {
        sections: groups.map((g, idx) => ({
          index: idx + 1,
          title: g.title,
          generation: g.generation,
          member_count: [g.husband, g.wife, ...g.children].filter(Boolean)
            .length,
        })),
        total_pages: 0,
      },
    });

    // 3. 章节与人物页
    for (const group of groups) {
      pages.push({
        page_number: pageNo++,
        page_type: 'section' as FamilyBookPageType,
        title: group.title,
        subtitle: `第${this.numToChinese(group.generation + 1)}代`,
        body: null,
        content: {
          generation: group.generation,
          branch: group.branch,
          member_count: [group.husband, group.wife, ...group.children].filter(
            Boolean,
          ).length,
        },
      });

      const members: CollectedPerson[] = [
        ...(group.husband ? [group.husband] : []),
        ...(group.wife ? [group.wife] : []),
        ...group.children,
      ];

      for (const m of members) {
        const fields =
          (project.selected_fields as string[]) ?? [
            'name',
            'photo',
            'birth',
            'bio',
          ];
        pages.push({
          page_number: pageNo++,
          page_type: 'person' as FamilyBookPageType,
          title: m.full_name,
          subtitle: m.is_spouse ? '配偶' : null,
          body: fields.includes('bio') ? this.bioFromPerson(m) : null,
          content: this.buildPersonContent(m, fields),
        });
      }
    }

    // 4. 后记
    pages.push({
      page_number: pageNo++,
      page_type: 'epilogue' as FamilyBookPageType,
      title: '后记',
      subtitle: '家族传承 · 血脉永续',
      body: project.preface ?? '愿家族枝繁叶茂，血脉永续。',
      content: {
        total_persons: persons.length,
        total_groups: groups.length,
        generated_at: new Date().toISOString(),
      },
    });

    const toc = pages.find((p) => p.page_type === ('toc' as FamilyBookPageType));
    if (toc) {
      toc.content.total_pages = pages.length;
    }

    return pages;
  }

  private bioFromPerson(p: CollectedPerson): string {
    if (p.bio) return p.bio;
    const lines: string[] = [];
    if (p.birth_date) {
      lines.push(`生于${new Date(p.birth_date).getFullYear()}年。`);
    }
    if (p.death_date) {
      lines.push(`逝于${new Date(p.death_date).getFullYear()}年。`);
    }
    if (p.birth_place) lines.push(`出生于${p.birth_place}。`);
    if (p.residence) lines.push(`居住于${p.residence}。`);
    if (p.occupation) lines.push(`从事${p.occupation}。`);
    if (lines.length === 0) return '';
    return lines.join('');
  }

  private buildPersonContent(
    p: CollectedPerson,
    fields: string[],
  ): Record<string, any> {
    const content: Record<string, any> = {
      person_id: p.id.toString(),
      is_spouse: p.is_spouse,
      generation: p.generation,
    };
    for (const f of fields) {
      switch (f) {
        case 'name':
          content.name = p.full_name;
          break;
        case 'photo':
          content.photo_url = p.photo_url;
          content.photo_label = FIELD_LABELS.photo;
          break;
        case 'birth':
          content.birth_date = p.birth_date?.toISOString() ?? null;
          content.birth_year = p.birth_date
            ? new Date(p.birth_date).getFullYear()
            : null;
          content.birth_label = FIELD_LABELS.birth;
          break;
        case 'death':
          content.death_date = p.death_date?.toISOString() ?? null;
          content.death_year = p.death_date
            ? new Date(p.death_date).getFullYear()
            : null;
          content.death_label = FIELD_LABELS.death;
          break;
        case 'bio':
          content.bio = p.bio ?? this.bioFromPerson(p);
          content.bio_label = FIELD_LABELS.bio;
          break;
        case 'occupation':
          content.occupation = p.occupation ?? null;
          content.occupation_label = FIELD_LABELS.occupation;
          break;
        case 'residence':
          content.residence = p.residence ?? null;
          content.residence_label = FIELD_LABELS.residence;
          break;
        case 'birth_place':
          content.birth_place = p.birth_place ?? null;
          content.birth_place_label = FIELD_LABELS.birth_place;
          break;
        default:
          break;
      }
    }
    return content;
  }
}
