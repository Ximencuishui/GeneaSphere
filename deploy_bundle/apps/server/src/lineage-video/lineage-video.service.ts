import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@geneasphere/db';
import { VideoProjectStatus } from '@prisma/client';

export interface LineagePerson {
  id: string;
  full_name: string;
  gender: string;
  birth_year?: number;
  death_year?: number;
  relationship: string;
  generation: number; // negative = ancestor, 0 = center, positive = descendant
}

interface LineagePersonInternal {
  id: bigint;
  full_name: string;
  gender: string;
  birth_year?: number;
  death_year?: number;
  relationship: string;
  generation: number;
}

export interface LineagePreview {
  persons: LineagePerson[];
  person_count: number;
  media_count: number;
  video_count: number;
  estimated_duration_seconds: number;
}

export interface CreateProjectResult {
  id: string;
  queue_position: number;
  estimated_wait_minutes: number;
}

@Injectable()
export class LineageVideoService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 根据方向和代数精准查找直系血缘人物
   */
  async getDirectLineagePersons(
    centerPersonId: bigint,
    direction: string,
    upGenerations: number,
    downGenerations: number,
    includeSpouse: boolean,
  ): Promise<LineagePersonInternal[]> {
    const persons: LineagePersonInternal[] = [];
    const visited = new Set<string>();

    // 中心人物
    const center = await this.prisma.person.findUnique({
      where: { id: centerPersonId },
    });
    if (!center) {
      throw new BadRequestException('中心人物不存在');
    }

    persons.push({
      id: center.id,
      full_name: center.full_name,
      gender: center.gender,
      birth_year: center.birth_date ? new Date(center.birth_date).getFullYear() : undefined,
      death_year: center.death_date ? new Date(center.death_date).getFullYear() : undefined,
      relationship: '中心人物',
      generation: 0,
    });
    visited.add(center.id.toString());

    // 向上追溯祖先
    if (upGenerations > 0) {
      if (direction === 'paternal' || direction === 'both') {
        await this.traceAncestors(centerPersonId, upGenerations, 'paternal', includeSpouse, persons, visited);
      }
      if (direction === 'maternal' || direction === 'both') {
        await this.traceAncestors(centerPersonId, upGenerations, 'maternal', includeSpouse, persons, visited);
      }
    }

    // 向下延展后代
    if (downGenerations > 0) {
      await this.traceDescendants(centerPersonId, downGenerations, includeSpouse, persons, visited);
    }

    // 按代排序：从最古老到最新
    persons.sort((a, b) => a.generation - b.generation);

    return persons;
  }

  /**
   * 向上追溯祖先（通过 FamilyUnit 逐级查找）
   */
  private async traceAncestors(
    personId: bigint,
    maxGenerations: number,
    direction: 'paternal' | 'maternal',
    includeSpouse: boolean,
    persons: LineagePersonInternal[],
    visited: Set<string>,
  ): Promise<void> {
    let currentPersonId = personId;

    for (let gen = 1; gen <= maxGenerations; gen++) {
      // 查找包含当前人物的 FamilyUnit（作为子女）
      const familyChild = await this.prisma.familyChild.findFirst({
        where: { child_id: currentPersonId },
        include: { family: true },
      });

      if (!familyChild) break;

      const family = familyChild.family;
      // 根据方向选择父/母
      const parentId = direction === 'paternal' ? family.husband_id : family.wife_id;
      const spouseId = direction === 'paternal' ? family.wife_id : family.husband_id;

      if (!parentId) break;

      if (!visited.has(parentId.toString())) {
        const parent = await this.prisma.person.findUnique({
          where: { id: parentId },
        });
        if (parent) {
          visited.add(parent.id.toString());
          const relPrefix = direction === 'paternal' ? '父系' : '母系';
          persons.push({
            id: parent.id,
            full_name: parent.full_name,
            gender: parent.gender,
            birth_year: parent.birth_date ? new Date(parent.birth_date).getFullYear() : undefined,
            death_year: parent.death_date ? new Date(parent.death_date).getFullYear() : undefined,
            relationship: `${relPrefix}第${gen}代`,
            generation: -gen,
          });
        }
      }

      // 包含配偶
      if (includeSpouse && spouseId && !visited.has(spouseId.toString())) {
        const spouse = await this.prisma.person.findUnique({
          where: { id: spouseId },
        });
        if (spouse) {
          visited.add(spouse.id.toString());
          const relPrefix = direction === 'paternal' ? '父系' : '母系';
          persons.push({
            id: spouse.id,
            full_name: spouse.full_name,
            gender: spouse.gender,
            birth_year: spouse.birth_date ? new Date(spouse.birth_date).getFullYear() : undefined,
            death_year: spouse.death_date ? new Date(spouse.death_date).getFullYear() : undefined,
            relationship: `${relPrefix}第${gen}代配偶`,
            generation: -gen,
          });
        }
      }

      // 继续向上追溯
      currentPersonId = parentId;
    }
  }

  /**
   * 向下延展后代
   */
  private async traceDescendants(
    personId: bigint,
    maxGenerations: number,
    includeSpouse: boolean,
    persons: LineagePersonInternal[],
    visited: Set<string>,
  ): Promise<void> {
    // BFS 逐级向下
    let currentLevel = [personId];

    for (let gen = 1; gen <= maxGenerations; gen++) {
      const nextLevel: bigint[] = [];

      for (const pid of currentLevel) {
        // 查找以此人为父母之一的 FamilyUnit
        const families = await this.prisma.familyUnit.findMany({
          where: {
            OR: [{ husband_id: pid }, { wife_id: pid }],
          },
        });

        for (const family of families) {
          // 获取子女
          const children = await this.prisma.familyChild.findMany({
            where: { family_id: family.id },
            orderBy: { birth_order: 'asc' },
          });

          for (const child of children) {
            if (visited.has(child.child_id.toString())) continue;

            const childPerson = await this.prisma.person.findUnique({
              where: { id: child.child_id },
            });
            if (childPerson) {
              visited.add(childPerson.id.toString());
              persons.push({
                id: childPerson.id,
                full_name: childPerson.full_name,
                gender: childPerson.gender,
                birth_year: childPerson.birth_date ? new Date(childPerson.birth_date).getFullYear() : undefined,
                death_year: childPerson.death_date ? new Date(childPerson.death_date).getFullYear() : undefined,
                relationship: `第${gen}代后代`,
                generation: gen,
              });
              nextLevel.push(childPerson.id);
            }
          }

          // 包含子女的配偶（即儿媳/女婿）
          if (includeSpouse) {
            const spouseId = family.husband_id === pid ? family.wife_id : family.husband_id;
            if (spouseId && !visited.has(spouseId.toString())) {
              const spouse = await this.prisma.person.findUnique({
                where: { id: spouseId },
              });
              if (spouse) {
                visited.add(spouse.id.toString());
                persons.push({
                  id: spouse.id,
                  full_name: spouse.full_name,
                  gender: spouse.gender,
                  birth_year: spouse.birth_date ? new Date(spouse.birth_date).getFullYear() : undefined,
                  death_year: spouse.death_date ? new Date(spouse.death_date).getFullYear() : undefined,
                  relationship: `第${gen}代配偶`,
                  generation: gen,
                });
              }
            }
          }
        }
      }

      currentLevel = nextLevel;
      if (currentLevel.length === 0) break;
    }
  }

  /**
   * 预览素材
   */
  async previewMaterials(
    centerPersonId: bigint,
    direction: string,
    upGenerations: number,
    downGenerations: number,
    includeSpouse: boolean,
  ): Promise<LineagePreview> {
    const persons = await this.getDirectLineagePersons(
      centerPersonId,
      direction,
      upGenerations,
      downGenerations,
      includeSpouse,
    );

    const personIds = persons.map((p) => p.id);

    // 查询关联的照片/视频
    const mediaLinks = await this.prisma.mediaPersonLink.findMany({
      where: { person_id: { in: personIds } },
      include: {
        media: {
          select: { id: true, media_type: true },
        },
      },
    });

    const imageCount = mediaLinks.filter((l) => l.media.media_type === 'image').length;
    const videoCount = mediaLinks.filter((l) => l.media.media_type === 'video').length;
    const totalMedia = mediaLinks.length;

    // 返回前将 BigInt id 序列化为 string
    return {
      persons: persons.map((p) => ({
        id: p.id.toString(),
        full_name: p.full_name,
        gender: p.gender,
        birth_year: p.birth_year,
        death_year: p.death_year,
        relationship: p.relationship,
        generation: p.generation,
      })),
      person_count: persons.length,
      media_count: totalMedia,
      video_count: videoCount,
      estimated_duration_seconds: Math.min(totalMedia * 3, 300),
    };
  }

  /**
   * 创建直系血缘视频项目
   */
  async createProject(
    userId: string,
    clanId: bigint,
    centerPersonId: bigint,
    direction: string,
    upGenerations: number,
    downGenerations: number,
    includeSpouse: boolean,
    style: string,
    usePriority: boolean,
  ): Promise<CreateProjectResult> {
    // 验证中心人物属于当前家族
    const person = await this.prisma.person.findFirst({
      where: { id: centerPersonId, clan_id: clanId },
    });
    if (!person) {
      throw new BadRequestException('中心人物不存在或不属于当前家族');
    }

    // 检查月度用量（免费用户每月2条）
    const isVip = await this.isVipUser(userId);
    if (!isVip && !usePriority) {
      const monthlyUsage = await this.getMonthlyUsage(userId);
      if (monthlyUsage >= 2) {
        throw new BadRequestException('免费用户每月可生成2条直系血缘视频，本月额度已用完。请购买VIP或下月再试。');
      }
    }

    // 获取直系血缘人物
    const lineagePersons = await this.getDirectLineagePersons(
      centerPersonId,
      direction,
      upGenerations,
      downGenerations,
      includeSpouse,
    );

    // 收集素材
    const personIds = lineagePersons.map((p) => p.id);
    const mediaLinks = await this.prisma.mediaPersonLink.findMany({
      where: { person_id: { in: personIds } },
      orderBy: { media: { taken_year: 'asc' } },
    });

    if (mediaLinks.length === 0) {
      throw new BadRequestException('该直系血缘线上暂无照片素材，请先上传照片');
    }

    // 排队位置
    const queuePosition = await this.calculateQueuePosition(usePriority || isVip);

    // 创建项目
    const project = await this.prisma.lineageVideoProject.create({
      data: {
        user_id: userId,
        center_person_id: centerPersonId,
        direction: direction as any,
        up_generations: upGenerations,
        down_generations: downGenerations,
        include_spouse: includeSpouse,
        style: style || 'nostalgic',
        status: VideoProjectStatus.queued,
        priority: usePriority || isVip,
        queue_position: queuePosition,
      },
    });

    // 创建素材关联（限制50张）
    const limitedLinks = mediaLinks.slice(0, 50);
    if (limitedLinks.length > 0) {
      await this.prisma.lineageVideoMaterialLink.createMany({
        data: limitedLinks.map((link, index) => ({
          lineage_project_id: project.id,
          media_id: link.media_id,
          person_id: link.person_id,
          sequence_order: index + 1,
        })),
      });
    }

    const estimatedWaitMinutes = usePriority || isVip ? 0 : queuePosition * 5;

    return {
      id: project.id.toString(),
      queue_position: queuePosition,
      estimated_wait_minutes: estimatedWaitMinutes,
    };
  }

  /**
   * 获取用户项目列表
   */
  async listUserProjects(
    userId: string,
    page: number = 1,
    pageSize: number = 10,
  ): Promise<{ data: any[]; pagination: any }> {
    const where = { user_id: userId };
    const skip = (page - 1) * pageSize;

    const [projects, total] = await Promise.all([
      this.prisma.lineageVideoProject.findMany({
        where,
        include: {
          center_person: {
            select: { id: true, full_name: true, gender: true, birth_date: true, death_date: true },
          },
          materials: {
            include: {
              media: { select: { id: true, file_url: true } },
            },
          },
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.lineageVideoProject.count({ where }),
    ]);

    const data = projects.map((p) => ({
      id: p.id.toString(),
      center_person: {
        id: p.center_person.id.toString(),
        full_name: p.center_person.full_name,
        gender: p.center_person.gender,
      },
      direction: p.direction,
      up_generations: p.up_generations,
      down_generations: p.down_generations,
      include_spouse: p.include_spouse,
      status: p.status,
      queue_position: p.queue_position,
      priority: p.priority,
      video_url: p.video_url,
      duration_seconds: p.duration_seconds,
      style: p.style,
      material_count: p.materials.length,
      created_at: p.created_at.toISOString(),
      completed_at: p.completed_at?.toISOString(),
      error_message: p.error_message,
    }));

    return {
      data,
      pagination: {
        page,
        page_size: pageSize,
        total,
        total_pages: Math.ceil(total / pageSize),
      },
    };
  }

  /**
   * 获取项目详情
   */
  async getProjectDetail(projectId: string, userId: string): Promise<any> {
    const project = await this.prisma.lineageVideoProject.findFirst({
      where: { id: BigInt(projectId), user_id: userId },
      include: {
        center_person: {
          select: { id: true, full_name: true, gender: true, birth_date: true, death_date: true },
        },
        materials: {
          include: {
            media: {
              select: { id: true, file_url: true, taken_year: true, description: true, media_type: true },
            },
            person: {
              select: { id: true, full_name: true, gender: true },
            },
          },
          orderBy: { sequence_order: 'asc' },
        },
      },
    });

    if (!project) {
      throw new NotFoundException('项目不存在');
    }

    return {
      id: project.id.toString(),
      center_person: {
        id: project.center_person.id.toString(),
        full_name: project.center_person.full_name,
        gender: project.center_person.gender,
        birth_date: project.center_person.birth_date?.toISOString(),
        death_date: project.center_person.death_date?.toISOString(),
      },
      direction: project.direction,
      up_generations: project.up_generations,
      down_generations: project.down_generations,
      include_spouse: project.include_spouse,
      status: project.status,
      queue_position: project.queue_position,
      priority: project.priority,
      video_url: project.video_url,
      duration_seconds: project.duration_seconds,
      style: project.style,
      materials: project.materials.map((m) => ({
        media_id: m.media_id.toString(),
        file_url: m.media.file_url,
        taken_year: m.media.taken_year,
        description: m.media.description,
        media_type: m.media.media_type,
        person_id: m.person_id.toString(),
        person_name: m.person.full_name,
        sequence_order: m.sequence_order,
      })),
      material_count: project.materials.length,
      created_at: project.created_at.toISOString(),
      completed_at: project.completed_at?.toISOString(),
      error_message: project.error_message,
    };
  }

  /**
   * 取消项目
   */
  async cancelProject(projectId: string, userId: string): Promise<void> {
    const project = await this.prisma.lineageVideoProject.findFirst({
      where: { id: BigInt(projectId), user_id: userId },
    });
    if (!project) throw new NotFoundException('项目不存在');
    if (project.status !== VideoProjectStatus.queued) {
      throw new BadRequestException('只能取消排队中的项目');
    }
    await this.prisma.lineageVideoProject.delete({
      where: { id: BigInt(projectId) },
    });
  }

  /**
   * 删除项目
   */
  async deleteProject(projectId: string, userId: string): Promise<void> {
    const project = await this.prisma.lineageVideoProject.findFirst({
      where: { id: BigInt(projectId), user_id: userId },
    });
    if (!project) throw new NotFoundException('项目不存在');

    await this.prisma.lineageVideoMaterialLink.deleteMany({
      where: { lineage_project_id: BigInt(projectId) },
    });
    await this.prisma.lineageVideoProject.delete({
      where: { id: BigInt(projectId) },
    });
  }

  /**
   * 获取月度用量
   */
  async getMonthlyUsage(userId: string): Promise<number> {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    return this.prisma.lineageVideoProject.count({
      where: {
        user_id: userId,
        created_at: { gte: startOfMonth },
        status: { not: VideoProjectStatus.failed },
      },
    });
  }

  /**
   * 在家族内搜索人物
   */
  async searchPersons(clanId: bigint, keyword: string, limit: number) {
    const where: any = { clan_id: clanId };
    if (keyword.trim()) {
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
      take: limit,
    });

    return persons.map((p) => ({
      id: p.id.toString(),
      full_name: p.full_name,
      gender: p.gender,
      birth_date: p.birth_date?.toISOString(),
      death_date: p.death_date?.toISOString(),
    }));
  }

  // ==================== 私有方法 ====================

  private async calculateQueuePosition(isPriority: boolean): Promise<number> {
    const count = await this.prisma.lineageVideoProject.count({
      where: {
        status: VideoProjectStatus.queued,
        priority: isPriority ? undefined : false,
      },
    });
    return count + 1;
  }

  private async isVipUser(userId: string): Promise<boolean> {
    const order = await this.prisma.videoVipOrder.findFirst({
      where: {
        user_id: userId,
        expires_at: { gt: new Date() },
      },
    });
    return !!order;
  }
}
