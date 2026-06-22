import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@geneasphere/db';
import { ApplicationStatus, Role } from '@prisma/client';

export interface MergeWizardData {
  application: any;
  applicantClan: any;
  mainClan: any;
  comparison: any;
}

export interface AnchorValidationResult {
  isValid: boolean;
  error?: string;
  warnings?: string[];
  anchorPerson?: any;
}

export interface GenerationAlignment {
  personId: bigint;
  fullName: string;
  originalGeneration: number;
  newGeneration: number;
  adjustment: number;
  hasConflict: boolean;
  conflictReason?: string;
}

@Injectable()
export class MergeService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 获取合并向导初始化数据
   */
  async getWizardData(applicationId: bigint, mainClanId: bigint): Promise<MergeWizardData> {
    const application = await this.prisma.mergeApplication.findUnique({
      where: { id: applicationId },
      include: {
        applicant: { select: { id: true, phone: true } },
        matched_person: true,
        clan: true,
      },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    // 获取主家族信息
    const mainClan = await this.prisma.clan.findUnique({
      where: { id: mainClanId },
      include: {
        persons: {
          where: { is_living: false }, // 默认只获取已故人员用于选择挂载点
          select: { id: true, full_name: true, gender: true, birth_date: true, death_date: true, is_living: true },
        },
      },
    });

    if (!mainClan) {
      throw new NotFoundException('Main clan not found');
    }

    // 执行比对
    const comparison = await this.performComparison(application);

    return {
      application,
      applicantClan: application.clan,
      mainClan,
      comparison,
    };
  }

  /**
   * 获取族谱树结构
   */
  async getClanTree(clanId: bigint): Promise<any[]> {
    const persons = await this.prisma.person.findMany({
      where: { clan_id: clanId },
      include: {
        children_in: {
          include: {
            child: { select: { id: true, full_name: true, gender: true, is_living: true } },
          },
        },
      },
    });

    // 构建树结构
    const personMap = new Map<string, any>();
    const roots: any[] = [];

    // 先创建所有节点
    persons.forEach((p) => {
      personMap.set(p.id.toString(), {
        id: p.id.toString(),
        fullName: p.full_name,
        gender: p.gender,
        birthDate: p.birth_date,
        deathDate: p.death_date,
        isLiving: p.is_living,
        children: [],
        depth: 0,
        hasPhoto: !!(p as any).avatar_url || !!(p as any).thumbnail_url,
        thumbnailUrl: (p as any).thumbnail_url || undefined,
        avatarUrl: (p as any).avatar_url || undefined,
      });
    });

    // 构建父子关系
    persons.forEach((p) => {
      const node = personMap.get(p.id.toString())!;
      p.children_in.forEach((childRel) => {
        const childNode = personMap.get(childRel.child_id.toString());
        if (childNode) {
          node.children.push(childNode);
        }
      });
    });

    // 找出根节点（没有父母的人）
    const childIds = new Set<string>();
    persons.forEach((p) => {
      p.children_in.forEach((c) => {
        childIds.add(c.child_id.toString());
      });
    });

    personMap.forEach((node, id) => {
      if (!childIds.has(id)) {
        roots.push(node);
      }
    });

    // 计算深度并扁平化
    const flattenTree = (nodes: any[], depth: number): any[] => {
      const result: any[] = [];
      nodes.forEach((node) => {
        node.depth = depth;
        result.push(node);
        result.push(...flattenTree(node.children, depth + 1));
      });
      return result;
    };

    return flattenTree(roots, 0);
  }

  /**
   * 获取人物的祖先链
   */
  async getAncestors(personId: bigint, clanId: bigint): Promise<any[]> {
    const ancestors = await this.prisma.personAncestry.findMany({
      where: {
        descendant_id: personId,
        ancestor: { clan_id: clanId },
      },
      include: {
        ancestor: {
          select: { id: true, full_name: true, gender: true, birth_date: true, death_date: true, is_living: true },
        },
      },
      orderBy: { depth: 'asc' },
    });

    return ancestors.map((a) => ({
      id: a.ancestor_id.toString(),
      fullName: a.ancestor.full_name,
      gender: a.ancestor.gender,
      birthDate: a.ancestor.birth_date,
      deathDate: a.ancestor.death_date,
      isLiving: a.ancestor.is_living,
      depth: a.depth,
    }));
  }

  /**
   * 验证挂载点合法性
   */
  async validateAnchor(
    anchorPersonId: bigint,
    mainClanId: bigint,
    applicantClanId: bigint,
  ): Promise<AnchorValidationResult> {
    const warnings: string[] = [];

    // 1. 检查挂载点是否存在且属于主家族
    const anchorPerson = await this.prisma.person.findFirst({
      where: { id: anchorPersonId, clan_id: mainClanId },
    });

    if (!anchorPerson) {
      return { isValid: false, error: '挂载点不存在或不属于主家族' };
    }

    // 2. 检查是否为已故人员
    if (anchorPerson.is_living) {
      return { isValid: false, error: '挂载点必须为已故人员' };
    }

    // 3. 检查是否属于申请方支系（防止循环）
    const belongsToApplicant = await this.prisma.personAncestry.findFirst({
      where: {
        ancestor_id: anchorPersonId,
        descendant: { clan_id: applicantClanId },
      },
    });

    if (belongsToApplicant) {
      return { isValid: false, error: '挂载点不能是申请方支系中的成员' };
    }

    // 4. 检查挂载点世代与申请方始祖世代偏差
    const anchorAncestors = await this.prisma.personAncestry.findMany({
      where: { descendant_id: anchorPersonId, ancestor: { clan_id: mainClanId } },
    });
    const anchorGeneration = anchorAncestors.length; // 挂载点相对于始祖的代数

    // 获取申请方始祖
    const applicantRoot = await this.findClanRoot(applicantClanId);
    if (applicantRoot) {
      const applicantAncestors = await this.prisma.personAncestry.findMany({
        where: { descendant_id: applicantRoot.id, ancestor: { clan_id: applicantClanId } },
      });
      const applicantGeneration = applicantAncestors.length;

      const generationDiff = Math.abs(anchorGeneration - applicantGeneration);
      if (generationDiff > 2) {
        warnings.push(`世代偏差较大（${generationDiff}代），请确认是否正确`);
      }
    }

    return {
      isValid: true,
      anchorPerson: {
        id: anchorPerson.id.toString(),
        fullName: anchorPerson.full_name,
        gender: anchorPerson.gender,
        birthDate: anchorPerson.birth_date,
        deathDate: anchorPerson.death_date,
        isLiving: anchorPerson.is_living,
        generation: anchorGeneration,
      },
      warnings,
    };
  }

  /**
   * 预览世代对齐
   */
  async previewAlignment(
    anchorPersonId: bigint,
    applicantClanId: bigint,
    mainClanId: bigint,
  ): Promise<GenerationAlignment[]> {
    // 获取挂载点的代数
    const anchorAncestors = await this.prisma.personAncestry.findMany({
      where: { descendant_id: anchorPersonId, ancestor: { clan_id: mainClanId } },
    });
    const anchorGeneration = anchorAncestors.length;

    // 获取申请方所有成员
    const applicantPersons = await this.prisma.person.findMany({
      where: { clan_id: applicantClanId },
    });

    const alignments: GenerationAlignment[] = [];

    for (const person of applicantPersons) {
      // 计算该成员相对于申请方始祖的代数
      const personAncestors = await this.prisma.personAncestry.findMany({
        where: { descendant_id: person.id, ancestor: { clan_id: applicantClanId } },
      });
      const originalGeneration = personAncestors.length;

      // 新代数 = 挂载点代数 + (该成员代数 - 始祖代数) + 1
      const newGeneration = anchorGeneration + originalGeneration + 1;
      const adjustment = newGeneration - originalGeneration;

      // 检查冲突（子代年龄大于父代）
      let hasConflict = false;
      let conflictReason: string | undefined;

      if (!person.is_living && person.birth_date) {
        const children = await this.prisma.familyChild.findMany({
          where: { family: { OR: [{ husband_id: person.id }, { wife_id: person.id }] } },
          include: { child: true },
        });

        for (const child of children) {
          if (child.child.birth_date && person.birth_date > child.child.birth_date) {
            hasConflict = true;
            conflictReason = `${person.full_name} 的出生日期晚于其子女 ${child.child.full_name}`;
            break;
          }
        }
      }

      alignments.push({
        personId: person.id,
        fullName: person.full_name,
        originalGeneration,
        newGeneration,
        adjustment,
        hasConflict,
        conflictReason,
      });
    }

    return alignments;
  }

  /**
   * 执行合并（在事务中）
   */
  async executeMerge(
    applicationId: bigint,
    anchorPersonId: bigint,
    generationOffset: number,
    operatorId: string,
  ): Promise<{ snapshotId: string; message: string }> {
    const app = await this.prisma.mergeApplication.findUnique({
      where: { id: applicationId },
      include: { clan: true },
    });

    if (!app) {
      throw new NotFoundException('Application not found');
    }

    if (app.status !== ApplicationStatus.APPROVED) {
      throw new BadRequestException('Application must be in APPROVED status to merge');
    }

    const applicantClanId = app.clan_id;
    const mainClanId = app.clan_id; // 主家族就是申请方现在关联的家族（审核通过后）

    // 找到申请方始祖
    const applicantRoot = await this.findClanRoot(applicantClanId);
    if (!applicantRoot) {
      throw new BadRequestException('Cannot find root person of applicant clan');
    }

    // 1. 创建快照（包括主家族和申请方家族的数据）
    const snapshotId = await this.createFullSnapshot(
      mainClanId,
      applicantClanId,
      applicationId,
      anchorPersonId,
      applicantRoot.id,
      operatorId,
    );

    // 2. 在事务中执行合并
    await this.prisma.$transaction(async (tx) => {
      // 2.1 创建合并后的家庭单元
      const newFamily = await tx.familyUnit.create({
        data: {
          clan_id: mainClanId,
          husband_id: anchorPersonId,
          wife_id: null, // 可以扩展为支持双亲
          union_type: 'merger',
        },
      });

      // 2.2 将申请方始祖添加为挂载点的子女
      await tx.familyChild.create({
        data: {
          family_id: newFamily.id,
          child_id: applicantRoot.id,
          birth_order: 1,
        },
      });

      // 2.3 更新申请方所有成员的 clan_id
      await tx.person.updateMany({
        where: { clan_id: applicantClanId },
        data: { clan_id: mainClanId },
      });

      // 2.4 更新 family_units 的 clan_id
      await tx.familyUnit.updateMany({
        where: { clan_id: applicantClanId },
        data: { clan_id: mainClanId },
      });

      // 2.5 更新 family_children 的引用（通过 family_units）
      const applicantFamilies = await tx.familyUnit.findMany({
        where: { clan_id: mainClanId, union_type: 'normal' }, // 原来的申请方家庭
        select: { id: true },
      });

      // 2.6 重算闭包表
      await this.recalculateAncestryAfterMerge(tx, mainClanId, applicantRoot.id, anchorPersonId, generationOffset);

      // 2.7 更新申请状态
      await tx.mergeApplication.update({
        where: { id: applicationId },
        data: {
          status: ApplicationStatus.MERGED,
          merge_target_id: anchorPersonId,
        },
      });

      // 2.8 将申请人加入主家族（如果还不是成员）
      await tx.clanMember.upsert({
        where: {
          clan_id_user_id: {
            clan_id: mainClanId,
            user_id: app.applicant_id,
          },
        },
        update: { role: Role.EDITOR },
        create: {
          clan_id: mainClanId,
          user_id: app.applicant_id,
          role: Role.EDITOR,
        },
      });
    });

    return { snapshotId, message: 'Merge completed successfully' };
  }

  /**
   * 回滚合并操作
   */
  async rollbackMerge(snapshotId: bigint, operatorId: string): Promise<void> {
    const snapshot = await this.prisma.dataSnapshot.findUnique({
      where: { id: snapshotId },
    });

    if (!snapshot) {
      throw new NotFoundException('Snapshot not found');
    }

    if (snapshot.is_reverted) {
      throw new BadRequestException('Snapshot has already been reverted');
    }

    if (new Date() > snapshot.expires_at) {
      throw new BadRequestException('Snapshot has expired (24 hour limit)');
    }

    // 检查操作权限
    // await this.adminService.requireAdmin(snapshot.clan_id, operatorId);

    const snapshotData = snapshot.data as any;

    await this.prisma.$transaction(async (tx) => {
      // 1. 恢复主家族数据
      if (snapshotData.mainClanPersons) {
        for (const person of snapshotData.mainClanPersons) {
          await tx.person.upsert({
            where: { id: BigInt(person.id) },
            update: {
              full_name: person.full_name,
              gender: person.gender,
              birth_date: person.birth_date ? new Date(person.birth_date) : null,
              death_date: person.death_date ? new Date(person.death_date) : null,
              is_living: person.is_living,
            },
            create: {
              id: BigInt(person.id),
              clan_id: snapshot.clan_id,
              full_name: person.full_name,
              gender: person.gender,
              birth_date: person.birth_date ? new Date(person.birth_date) : null,
              death_date: person.death_date ? new Date(person.death_date) : null,
              is_living: person.is_living,
            },
          });
        }
      }

      // 2. 恢复申请方家族数据
      if (snapshotData.applicantClanPersons) {
        for (const person of snapshotData.applicantClanPersons) {
          await tx.person.upsert({
            where: { id: BigInt(person.id) },
            update: {
              clan_id: BigInt(person.clan_id),
              full_name: person.full_name,
              gender: person.gender,
              birth_date: person.birth_date ? new Date(person.birth_date) : null,
              death_date: person.death_date ? new Date(person.death_date) : null,
              is_living: person.is_living,
            },
            create: {
              id: BigInt(person.id),
              clan_id: BigInt(person.clan_id),
              full_name: person.full_name,
              gender: person.gender,
              birth_date: person.birth_date ? new Date(person.birth_date) : null,
              death_date: person.death_date ? new Date(person.death_date) : null,
              is_living: person.is_living,
            },
          });
        }
      }

      // 3. 恢复家庭单元
      if (snapshotData.familyUnits) {
        for (const family of snapshotData.familyUnits) {
          await tx.familyUnit.upsert({
            where: { id: BigInt(family.id) },
            update: {
              clan_id: BigInt(family.clan_id),
              husband_id: family.husband_id ? BigInt(family.husband_id) : null,
              wife_id: family.wife_id ? BigInt(family.wife_id) : null,
              union_type: family.union_type,
            },
            create: {
              id: BigInt(family.id),
              clan_id: BigInt(family.clan_id),
              husband_id: family.husband_id ? BigInt(family.husband_id) : null,
              wife_id: family.wife_id ? BigInt(family.wife_id) : null,
              union_type: family.union_type,
            },
          });
        }
      }

      // 4. 恢复家庭子女关系
      if (snapshotData.familyChildren) {
        for (const child of snapshotData.familyChildren) {
          await tx.familyChild.upsert({
            where: { id: BigInt(child.id) },
            update: {
              family_id: BigInt(child.family_id),
              child_id: BigInt(child.child_id),
              birth_order: child.birth_order,
            },
            create: {
              id: BigInt(child.id),
              family_id: BigInt(child.family_id),
              child_id: BigInt(child.child_id),
              birth_order: child.birth_order,
            },
          });
        }
      }

      // 5. 恢复闭包表
      if (snapshotData.ancestry) {
        await tx.personAncestry.deleteMany({
          where: {
            OR: [
              { ancestor: { clan_id: snapshot.clan_id } },
              { ancestor: { clan_id: snapshot.applicant_clan_id! } },
            ],
          },
        });

        for (const entry of snapshotData.ancestry) {
          await tx.personAncestry.create({
            data: {
              ancestor_id: BigInt(entry.ancestor_id),
              descendant_id: BigInt(entry.descendant_id),
              depth: entry.depth,
            },
          }).catch(() => {}); // 忽略重复键
        }
      }

      // 6. 更新申请状态
      if (snapshot.merge_application_id) {
        await tx.mergeApplication.update({
          where: { id: snapshot.merge_application_id },
          data: { status: ApplicationStatus.REVERTED },
        });
      }

      // 7. 标记快照已回滚
      await tx.dataSnapshot.update({
        where: { id: snapshotId },
        data: { is_reverted: true },
      });
    });
  }

  /**
   * 获取可回滚的合并快照
   */
  async getMergeSnapshots(clanId: bigint): Promise<any[]> {
    const snapshots = await this.prisma.dataSnapshot.findMany({
      where: {
        clan_id: clanId,
        operation_type: 'MERGE',
        is_reverted: false,
        expires_at: { gt: new Date() },
      },
      orderBy: { created_at: 'desc' },
    });

    return snapshots.map((s) => ({
      id: s.id.toString(),
      mergeApplicationId: s.merge_application_id?.toString(),
      applicantClanId: s.applicant_clan_id?.toString(),
      mergeTargetId: s.merge_target_id?.toString(),
      branchRootId: s.branch_root_id?.toString(),
      reason: s.reason,
      createdAt: s.created_at,
      expiresAt: s.expires_at,
      expiresInMinutes: Math.max(0, Math.round((s.expires_at.getTime() - Date.now()) / 60000)),
    }));
  }

  // ==================== 私有辅助方法 ====================

  /**
   * 查找家族始祖（没有父母的人）
   */
  private async findClanRoot(clanId: bigint): Promise<any | null> {
    // 获取所有有父母的人
    const childIds = await this.prisma.familyChild.findMany({
      where: { child: { clan_id: clanId } },
      select: { child_id: true },
    });
    const childIdSet = new Set(childIds.map((c) => c.child_id.toString()));

    // 找到没有父母的人
    const rootPersons = await this.prisma.person.findMany({
      where: {
        clan_id: clanId,
        is_living: false, // 通常始祖是已故的
      },
    });

    for (const person of rootPersons) {
      if (!childIdSet.has(person.id.toString())) {
        return person;
      }
    }

    // 如果没找到已故的，返回第一个
    if (rootPersons.length > 0) {
      return rootPersons[0];
    }

    return null;
  }

  /**
   * 执行比对
   */
  private async performComparison(app: any): Promise<any> {
    const matches: any[] = [];

    // 字辈匹配
    if (app.xipai_info && app.xipai_info.length > 0) {
      const xipaiMatches = await this.prisma.xipai.findMany({
        where: {
          clan_id: app.clan_id,
          character: { in: app.xipai_info },
        },
      });

      matches.push(
        ...xipaiMatches.map((x) => ({
          type: 'XIPAI',
          value: x.character,
          generation: x.generation,
          score: 30,
        })),
      );
    }

    // 地名匹配
    if (app.origin_place) {
      const locationMatches = await this.prisma.mediaArchive.findMany({
        where: {
          clan_id: app.clan_id,
          taken_location: { contains: app.origin_place },
        },
        take: 5,
      });

      if (locationMatches.length > 0) {
        matches.push({
          type: 'LOCATION',
          value: app.origin_place,
          count: locationMatches.length,
          score: 20,
        });
      }
    }

    const totalScore = matches.reduce((sum, m) => sum + m.score, 0);

    return {
      matches,
      totalScore: Math.min(totalScore, 100),
      suggestion: totalScore > 50 ? 'LIKELY_MATCH' : 'NEEDS_REVIEW',
    };
  }

  /**
   * 创建完整快照（主家族 + 申请方家族）
   */
  private async createFullSnapshot(
    mainClanId: bigint,
    applicantClanId: bigint,
    applicationId: bigint,
    anchorPersonId: bigint,
    branchRootId: bigint,
    userId: string,
  ): Promise<string> {
    // 获取主家族数据
    const mainClanPersons = await this.prisma.person.findMany({
      where: { clan_id: mainClanId },
    });

    const mainClanFamilies = await this.prisma.familyUnit.findMany({
      where: { clan_id: mainClanId },
    });

    const mainClanChildren = await this.prisma.familyChild.findMany({
      where: { family: { clan_id: mainClanId } },
    });

    // 获取申请方家族数据
    const applicantClanPersons = await this.prisma.person.findMany({
      where: { clan_id: applicantClanId },
    });

    const applicantFamilies = await this.prisma.familyUnit.findMany({
      where: { clan_id: applicantClanId },
    });

    const applicantChildren = await this.prisma.familyChild.findMany({
      where: { family: { clan_id: applicantClanId } },
    });

    // 获取闭包表
    const ancestry = await this.prisma.personAncestry.findMany({
      where: {
        OR: [
          { ancestor: { clan_id: mainClanId } },
          { ancestor: { clan_id: applicantClanId } },
        ],
      },
    });

    const snapshotData = {
      mainClanPersons: mainClanPersons.map((p) => ({
        id: p.id.toString(),
        full_name: p.full_name,
        gender: p.gender,
        birth_date: p.birth_date?.toISOString() || null,
        death_date: p.death_date?.toISOString() || null,
        is_living: p.is_living,
      })),
      mainClanFamilies: mainClanFamilies.map((f) => ({
        id: f.id.toString(),
        clan_id: f.clan_id.toString(),
        husband_id: f.husband_id?.toString() || null,
        wife_id: f.wife_id?.toString() || null,
        union_type: f.union_type,
      })),
      familyChildren: [...mainClanChildren, ...applicantChildren].map((c) => ({
        id: c.id.toString(),
        family_id: c.family_id.toString(),
        child_id: c.child_id.toString(),
        birth_order: c.birth_order,
      })),
      applicantClanPersons: applicantClanPersons.map((p) => ({
        id: p.id.toString(),
        clan_id: p.clan_id.toString(),
        full_name: p.full_name,
        gender: p.gender,
        birth_date: p.birth_date?.toISOString() || null,
        death_date: p.death_date?.toISOString() || null,
        is_living: p.is_living,
      })),
      familyUnits: [...mainClanFamilies, ...applicantFamilies].map((f) => ({
        id: f.id.toString(),
        clan_id: f.clan_id.toString(),
        husband_id: f.husband_id?.toString() || null,
        wife_id: f.wife_id?.toString() || null,
        union_type: f.union_type,
      })),
      ancestry: ancestry.map((a) => ({
        ancestor_id: a.ancestor_id.toString(),
        descendant_id: a.descendant_id.toString(),
        depth: a.depth,
      })),
    };

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24小时

    const snapshot = await this.prisma.dataSnapshot.create({
      data: {
        clan_id: mainClanId,
        merge_application_id: applicationId,
        applicant_clan_id: applicantClanId,
        merge_target_id: anchorPersonId,
        branch_root_id: branchRootId,
        operation_type: 'MERGE',
        data: snapshotData,
        reason: 'Pre-merge snapshot',
        created_by: userId,
        expires_at: expiresAt,
      },
    });

    return snapshot.id.toString();
  }

  /**
   * 归宗合并后的闭包表重算
   * 核心算法：为申请方支系的所有后代添加主家族挂载点以上所有祖先的路径
   */
  private async recalculateAncestryAfterMerge(
    tx: any,
    mainClanId: bigint,
    branchRootId: bigint,
    anchorPersonId: bigint,
    generationOffset: number,
  ): Promise<void> {
    // 1. 获取主家族中 anchorPerson 的所有祖先（包括自身）
    const mainAncestors = await tx.personAncestry.findMany({
      where: { descendant_id: anchorPersonId, ancestor: { clan_id: mainClanId } },
      include: { ancestor: true },
    });

    // 2. 获取申请方家族中 branchRoot 的所有后代（包括自身）
    const branchDescendants = await tx.personAncestry.findMany({
      where: { ancestor_id: branchRootId, ancestor: { clan_id: mainClanId } }, // 注意：此时 clan_id 可能还是旧的
      include: { descendant: true },
    });

    // 3. 收集所有需要处理的申请方成员ID
    const branchPersonIds = new Set<string>();
    branchDescendants.forEach((d: any) => {
      branchPersonIds.add(d.descendant_id.toString());
    });

    // 4. 删除旧的闭包表记录（申请方相关的）
    await tx.personAncestry.deleteMany({
      where: {
        OR: [
          { ancestor_id: { in: Array.from(branchPersonIds).map((id) => BigInt(id)) } },
          { descendant_id: { in: Array.from(branchPersonIds).map((id) => BigInt(id)) } },
        ],
      },
    });

    // 5. 为每个申请方成员创建新的闭包表记录
    const newAncRecords: { ancestor_id: bigint; descendant_id: bigint; depth: number }[] = [];

    // 5.1 添加主家族祖先路径（相对于挂载点的深度偏移）
    const anchorDepth = mainAncestors.length; // 挂载点在主家族中的深度

    for (const descendant of branchDescendants) {
      const originalDepth = descendant.depth;

      // 添加主家族祖先路径
      for (const ancestor of mainAncestors) {
        const newDepth = ancestor.depth + originalDepth + 1 + generationOffset;
        newAncRecords.push({
          ancestor_id: ancestor.ancestor_id,
          descendant_id: descendant.descendant_id,
          depth: newDepth,
        });
      }
    }

    // 5.2 保留并更新支系内部的原有路径（depth 增加）
    for (const descendant of branchDescendants) {
      // 该成员相对于始祖的原始深度
      const originalBranchDepth = descendant.depth;

      // 为该成员添加所有其他支系后代作为其子孙
      for (const other of branchDescendants) {
        if (other.descendant_id === descendant.descendant_id) continue;

        // 计算两者之间的关系：如果 other 是 descendant 的后代，则添加
        const otherAncestors = await tx.personAncestry.findMany({
          where: {
            descendant_id: other.descendant_id,
            ancestor_id: descendant.descendant_id,
          },
        });

        if (otherAncestors.length > 0) {
          // other 是 descendant 的后代
          for (const otherAncestor of otherAncestors) {
            // 在新的闭包表中添加
            newAncRecords.push({
              ancestor_id: descendant.descendant_id,
              descendant_id: other.descendant_id,
              depth: otherAncestor.depth,
            });
          }
        }
      }
    }

    // 5.3 批量插入新记录
    if (newAncRecords.length > 0) {
      const batchSize = 500;
      for (let i = 0; i < newAncRecords.length; i += batchSize) {
        const batch = newAncRecords.slice(i, i + batchSize);
        await tx.personAncestry.createMany({
          data: batch,
          skipDuplicates: true,
        });
      }
    }
  }
}
