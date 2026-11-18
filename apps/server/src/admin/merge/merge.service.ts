import { Injectable, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@geneasphere/db';
import { ApplicationStatus, ChildRelationType, Role } from '@prisma/client';

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
        applicant_clan: true,
        branch_root_person: true,
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
      applicantClan: application.applicant_clan ?? application.clan,
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
   * 初审通过。页面只在 PENDING 上提供该操作，合法来源只有 PENDING。
   * 条件更新匹配 0 行时拒绝，避免从 REJECTED / MERGED / REVERTED 再次通过。
   */
  async approveApplication(applicationId: bigint, reviewerId: string): Promise<{ status: ApplicationStatus }> {
    return this.transitionFromPending(applicationId, {
      status: ApplicationStatus.APPROVED,
      reviewed_by: reviewerId,
      reviewed_at: new Date(),
    }, '申请当前状态不允许通过');
  }

  /**
   * 拒绝。页面只在 PENDING 上提供该操作。
   */
  async rejectApplication(
    applicationId: bigint,
    reviewerId: string,
    reason: string,
  ): Promise<{ status: ApplicationStatus }> {
    return this.transitionFromPending(applicationId, {
      status: ApplicationStatus.REJECTED,
      reject_reason: reason,
      reviewed_by: reviewerId,
      reviewed_at: new Date(),
    }, '申请当前状态不允许拒绝');
  }

  /**
   * 转人工核查。页面只在 PENDING 上提供该操作。
   */
  async markNeedsManualReview(applicationId: bigint): Promise<{ status: ApplicationStatus }> {
    return this.transitionFromPending(applicationId, {
      status: ApplicationStatus.NEEDS_MANUAL_REVIEW,
    }, '申请当前状态不允许转人工核查');
  }

  private async transitionFromPending(
    applicationId: bigint,
    data: {
      status: ApplicationStatus;
      reviewed_by?: string;
      reviewed_at?: Date;
      reject_reason?: string;
    },
    conflictMessage: string,
  ): Promise<{ status: ApplicationStatus }> {
    const updated = await this.prisma.mergeApplication.updateMany({
      where: { id: applicationId, status: ApplicationStatus.PENDING },
      data,
    });
    if (updated.count !== 1) {
      throw new ConflictException(conflictMessage);
    }
    return { status: data.status };
  }

  /**
   * 执行合并。generationOffset 只保留调用兼容，不写入 person_ancestry.depth。
   */
  async executeMerge(
    applicationId: bigint,
    anchorPersonId: bigint,
    branchRootPersonId: bigint | null,
    generationOffset: number,
    operatorId: string,
  ): Promise<{ snapshotId: string; message: string }> {
    void generationOffset;
    const app = await this.prisma.mergeApplication.findUnique({
      where: { id: applicationId },
    });

    if (!app) {
      throw new NotFoundException('Application not found');
    }

    if (app.status !== ApplicationStatus.APPROVED) {
      throw new BadRequestException('Application must be in APPROVED status to merge');
    }

    if (app.applicant_clan_id == null) {
      throw new BadRequestException('申请没有申请方家族，不能执行合并');
    }

    const storedRoot = app.branch_root_person_id ?? null;
    if (storedRoot && branchRootPersonId && storedRoot !== branchRootPersonId) {
      throw new BadRequestException('支系根与申请记录冲突');
    }
    const rootId = storedRoot ?? branchRootPersonId;
    if (!rootId) {
      throw new BadRequestException('缺少被挂载的支系根');
    }

    const applicantClanId = app.applicant_clan_id;
    const applicationBefore = {
      status: ApplicationStatus.APPROVED,
      merge_target_id: app.merge_target_id ? app.merge_target_id.toString() : null,
    };

    const snapshotId = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.mergeApplication.updateMany({
        where: { id: applicationId, status: ApplicationStatus.APPROVED },
        data: { status: ApplicationStatus.MERGED },
      });
      if (claimed.count !== 1) {
        throw new ConflictException('申请不是待合并状态，或已有合并正在执行');
      }

      const anchor = await tx.person.findUnique({ where: { id: anchorPersonId } });
      const branchRoot = await tx.person.findUnique({ where: { id: rootId } });
      if (!anchor || !branchRoot) {
        throw new NotFoundException('挂载点或支系根不存在');
      }
      if (anchor.clan_id !== app.clan_id) {
        throw new BadRequestException('挂载点不属于受理家族');
      }

      await this.assertMayAttach(tx, branchRoot, anchor, applicantClanId);
      const merged = await this.buildMergedClosure(tx, anchor.id, branchRoot.id);

      const applicantPersons = await tx.person.findMany({ where: { clan_id: applicantClanId } });
      const ancestorIds = [...new Set(merged.anchorRows.map((row) => row.ancestor_id.toString()))].map((id) => BigInt(id));
      const ancestorPersons = ancestorIds.length
        ? await tx.person.findMany({ where: { id: { in: ancestorIds } } })
        : [];
      const personById = new Map<string, any>();
      for (const person of [...applicantPersons, ...ancestorPersons]) {
        personById.set(person.id.toString(), person);
      }
      const affectedPersons = [...personById.values()];
      const affectedIds = affectedPersons.map((person) => person.id);

      const bios = affectedIds.length
        ? await tx.personBio.findMany({ where: { person_id: { in: affectedIds } } })
        : [];
      const events = affectedIds.length
        ? await tx.personEvent.findMany({ where: { person_id: { in: affectedIds } } })
        : [];
      const families = await tx.familyUnit.findMany({
        where: { clan_id: { in: [anchor.clan_id, applicantClanId] } },
      });
      const familyIds = families.map((family) => family.id);
      const children = familyIds.length
        ? await tx.familyChild.findMany({ where: { family_id: { in: familyIds } } })
        : [];
      const applicantPersonIds = applicantPersons.map((person) => person.id);
      const mediaLinks = applicantPersonIds.length
        ? await tx.mediaPersonLink.findMany({ where: { person_id: { in: applicantPersonIds } } })
        : [];
      const mediaIds = [...new Set(mediaLinks.map((link) => link.media_id.toString()))].map((id) => BigInt(id));
      const mediaArchives = mediaIds.length
        ? await tx.mediaArchive.findMany({ where: { id: { in: mediaIds } } })
        : [];
      const ancestry = affectedIds.length
        ? await tx.personAncestry.findMany({
            where: {
              OR: [
                { ancestor_id: { in: affectedIds } },
                { descendant_id: { in: affectedIds } },
              ],
            },
          })
        : [];

      const snapshot = await tx.dataSnapshot.create({
        data: {
          clan_id: anchor.clan_id,
          merge_application_id: applicationId,
          applicant_clan_id: applicantClanId,
          merge_target_id: anchor.id,
          branch_root_id: branchRoot.id,
          operation_type: 'MERGE',
          reason: 'Pre-merge snapshot',
          created_by: operatorId,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
          data: {
            applicationBefore,
            persons: affectedPersons.map((person) => this.serializePerson(person)),
            personBios: bios.map((bio) => this.serializeBio(bio)),
            personEvents: events.map((event) => ({
              id: event.id.toString(),
              person_id: event.person_id.toString(),
              event_year: event.event_year,
              content: event.content,
              sort_order: event.sort_order,
            })),
            mediaArchives: mediaArchives.map((media) => this.serializeMedia(media)),
            familyUnits: families.map((family) => this.serializeFamily(family)),
            familyChildren: children.map((child) => ({
              id: child.id.toString(),
              family_id: child.family_id.toString(),
              child_id: child.child_id.toString(),
              birth_order: child.birth_order,
              child_type: child.child_type,
            })),
            ancestry: ancestry.map((edge) => ({
              ancestor_id: edge.ancestor_id.toString(),
              descendant_id: edge.descendant_id.toString(),
              depth: edge.depth,
            })),
          },
        },
      });

      const existingParentEdge = await tx.familyChild.findFirst({
        where: {
          child_id: branchRoot.id,
          family: {
            husband_id: anchor.id,
            wife_id: null,
          },
        },
      });
      if (!existingParentEdge) {
        const newFamily = await tx.familyUnit.create({
          data: {
            clan_id: anchor.clan_id,
            husband_id: anchor.id,
            wife_id: null,
            union_type: 'merger',
          },
        });
        await tx.familyChild.create({
          data: {
            family_id: newFamily.id,
            child_id: branchRoot.id,
            birth_order: 1,
            child_type: ChildRelationType.BIOLOGICAL,
          },
        });
      }

      await tx.person.updateMany({
        where: { clan_id: applicantClanId },
        data: { clan_id: anchor.clan_id },
      });
      await tx.familyUnit.updateMany({
        where: { clan_id: applicantClanId },
        data: { clan_id: anchor.clan_id },
      });
      if (mediaIds.length > 0) {
        await tx.mediaArchive.updateMany({
          where: { id: { in: mediaIds } },
          data: { clan_id: anchor.clan_id },
        });
      }

      await tx.personAncestry.deleteMany({
        where: { descendant_id: { in: merged.branchIds } },
      });
      await this.insertAncestry(tx, merged.edges);

      await tx.mergeApplication.update({
        where: { id: applicationId },
        data: { merge_target_id: anchor.id },
      });
      await tx.clanMember.upsert({
        where: {
          clan_id_user_id: {
            clan_id: anchor.clan_id,
            user_id: app.applicant_id,
          },
        },
        update: { role: Role.EDITOR },
        create: {
          clan_id: anchor.clan_id,
          user_id: app.applicant_id,
          role: Role.EDITOR,
        },
      });

      return snapshot.id.toString();
    }, { timeout: 20000 });

    return { snapshotId, message: 'Merge completed successfully' };
  }

  /**
   * 回滚合并。过期和已回滚在事务外拒绝，事务内不写库。
   */
  async rollbackMerge(snapshotId: bigint, _operatorId: string): Promise<void> {
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
    if (snapshot.operation_type !== 'MERGE') {
      throw new BadRequestException('Snapshot is not a merge snapshot');
    }

    const snapshotData = snapshot.data as any;
    if (!snapshotData || !Array.isArray(snapshotData.persons) || !Array.isArray(snapshotData.ancestry)) {
      throw new BadRequestException('Snapshot payload is incomplete');
    }

    await this.prisma.$transaction(async (tx) => {
      if (!snapshot.merge_application_id) {
        throw new ConflictException('快照没有绑定认亲申请');
      }
      const previousTarget = snapshotData.applicationBefore?.merge_target_id ?? null;
      const moved = await tx.mergeApplication.updateMany({
        where: { id: snapshot.merge_application_id, status: ApplicationStatus.MERGED },
        data: {
          status: ApplicationStatus.APPROVED,
          merge_target_id: previousTarget ? BigInt(previousTarget) : null,
        },
      });
      if (moved.count !== 1) {
        throw new ConflictException('申请不是已合并状态，不能回滚');
      }

      for (const person of snapshotData.persons) {
        await tx.person.update({
          where: { id: BigInt(person.id) },
          data: {
            clan_id: BigInt(person.clan_id),
            full_name: person.full_name,
            gender: person.gender,
            birth_date: this.parseIso(person.birth_date),
            death_date: this.parseIso(person.death_date),
            is_living: person.is_living,
            birth_place: person.birth_place ?? null,
            birth_lat: person.birth_lat ?? null,
            birth_lng: person.birth_lng ?? null,
            death_place: person.death_place ?? null,
            death_lat: person.death_lat ?? null,
            death_lng: person.death_lng ?? null,
            avatar_url: person.avatar_url ?? null,
            thumbnail_url: person.thumbnail_url ?? null,
            migration_branch: person.migration_branch ?? null,
            deleted_at: this.parseIso(person.deleted_at),
            deleted_by: person.deleted_by ?? null,
          },
        });
      }

      for (const bio of snapshotData.personBios ?? []) {
        const data = this.bioData(bio);
        await tx.personBio.upsert({
          where: { person_id: BigInt(bio.person_id) },
          update: data,
          create: { person_id: BigInt(bio.person_id), ...data },
        });
      }

      for (const event of snapshotData.personEvents ?? []) {
        await tx.personEvent.upsert({
          where: { id: BigInt(event.id) },
          update: {
            person_id: BigInt(event.person_id),
            event_year: event.event_year ?? null,
            content: event.content,
            sort_order: event.sort_order ?? 0,
          },
          create: {
            id: BigInt(event.id),
            person_id: BigInt(event.person_id),
            event_year: event.event_year ?? null,
            content: event.content,
            sort_order: event.sort_order ?? 0,
          },
        });
      }

      for (const media of snapshotData.mediaArchives ?? []) {
        await tx.mediaArchive.update({
          where: { id: BigInt(media.id) },
          data: { clan_id: BigInt(media.clan_id) },
        });
      }

      const snapshotFamilyIds = (snapshotData.familyUnits ?? []).map((family: any) => BigInt(family.id));
      if (snapshot.merge_target_id) {
        await tx.familyUnit.deleteMany({
          where: {
            union_type: 'merger',
            clan_id: snapshot.clan_id,
            husband_id: snapshot.merge_target_id,
            ...(snapshotFamilyIds.length > 0 ? { id: { notIn: snapshotFamilyIds } } : {}),
          },
        });
      }

      const snapshotChildIds = (snapshotData.familyChildren ?? []).map((child: any) => BigInt(child.id));
      if (snapshot.branch_root_id) {
        await tx.familyChild.deleteMany({
          where: {
            child_id: snapshot.branch_root_id,
            ...(snapshotChildIds.length > 0 ? { id: { notIn: snapshotChildIds } } : {}),
          },
        });
      }

      for (const family of snapshotData.familyUnits ?? []) {
        const data = {
          clan_id: BigInt(family.clan_id),
          husband_id: family.husband_id ? BigInt(family.husband_id) : null,
          wife_id: family.wife_id ? BigInt(family.wife_id) : null,
          union_type: family.union_type,
          marriage_date: this.parseIso(family.marriage_date),
          marriage_order: family.marriage_order ?? 1,
          divorce_date: this.parseIso(family.divorce_date),
          end_reason: family.end_reason ?? null,
          is_current: family.is_current ?? true,
          note: family.note ?? null,
        };
        await tx.familyUnit.upsert({
          where: { id: BigInt(family.id) },
          update: data,
          create: { id: BigInt(family.id), ...data },
        });
      }

      for (const child of snapshotData.familyChildren ?? []) {
        const data = {
          family_id: BigInt(child.family_id),
          child_id: BigInt(child.child_id),
          birth_order: child.birth_order,
          child_type: child.child_type ?? 'BIOLOGICAL',
        };
        await tx.familyChild.upsert({
          where: { id: BigInt(child.id) },
          update: data,
          create: { id: BigInt(child.id), ...data },
        });
      }

      const affectedIds = snapshotData.persons.map((person: any) => BigInt(person.id));
      if (affectedIds.length > 0) {
        await tx.personAncestry.deleteMany({
          where: {
            OR: [
              { ancestor_id: { in: affectedIds } },
              { descendant_id: { in: affectedIds } },
            ],
          },
        });
      }
      await this.insertAncestry(
        tx,
        snapshotData.ancestry.map((edge: any) => ({
          ancestor_id: BigInt(edge.ancestor_id),
          descendant_id: BigInt(edge.descendant_id),
          depth: edge.depth,
        })),
      );

      const marked = await tx.dataSnapshot.updateMany({
        where: { id: snapshotId, is_reverted: false },
        data: { is_reverted: true },
      });
      if (marked.count !== 1) {
        throw new ConflictException('快照已回滚');
      }
    }, { timeout: 20000 });
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

  private async assertMayAttach(tx: any, branchRoot: any, anchor: any, applicantClanId: bigint): Promise<void> {
    if (branchRoot.id === anchor.id) {
      throw new BadRequestException('支系根不能是挂载点本人');
    }
    if (anchor.is_living !== false) {
      throw new BadRequestException('挂载点必须是已故人员');
    }
    if (branchRoot.clan_id !== applicantClanId) {
      throw new BadRequestException('支系根不属于申请方家族');
    }
    const parentless = await this.isParentless(tx, branchRoot.id);
    if (branchRoot.clan_id === anchor.clan_id && parentless) {
      throw new BadRequestException('不能把本族没有父母的人挂成子女');
    }
    if (branchRoot.clan_id === anchor.clan_id) {
      throw new BadRequestException('申请方家族与挂载点家族相同');
    }
    const rootToAnchor = await tx.personAncestry.findFirst({
      where: { ancestor_id: branchRoot.id, descendant_id: anchor.id, depth: { gte: 1 } },
    });
    const anchorToRoot = await tx.personAncestry.findFirst({
      where: { ancestor_id: anchor.id, descendant_id: branchRoot.id, depth: { gte: 1 } },
    });
    if (rootToAnchor || anchorToRoot) {
      throw new BadRequestException('挂载点与被挂人之间已有血缘路径');
    }
  }

  private async isParentless(tx: any, personId: bigint): Promise<boolean> {
    const asChild = await tx.familyChild.findFirst({ where: { child_id: personId } });
    if (asChild) return false;
    const asDescendant = await tx.personAncestry.findFirst({
      where: { descendant_id: personId, depth: { gte: 1 } },
    });
    return !asDescendant;
  }

  private async buildMergedClosure(tx: any, anchorId: bigint, branchRootId: bigint): Promise<{
    edges: { ancestor_id: bigint; descendant_id: bigint; depth: number }[];
    branchIds: bigint[];
    anchorRows: { ancestor_id: bigint; descendant_id: bigint; depth: number }[];
  }> {
    const anchorRows = await tx.personAncestry.findMany({ where: { descendant_id: anchorId } });
    const branchRows = [...await tx.personAncestry.findMany({ where: { ancestor_id: branchRootId } })];
    const branchIds = [...new Set(branchRows.map((row: any) => row.descendant_id.toString()))].map((id) => BigInt(id));
    if (!branchIds.some((id) => id === branchRootId)) {
      branchIds.push(branchRootId);
      branchRows.push({ ancestor_id: branchRootId, descendant_id: branchRootId, depth: 0 });
    }

    const edgesIntoB = await tx.personAncestry.findMany({
      where: { descendant_id: { in: branchIds } },
    });
    const edgesOutOfB = await tx.personAncestry.findMany({
      where: {
        ancestor_id: { in: branchIds },
        descendant_id: { notIn: branchIds },
      },
    });
    if (edgesOutOfB.length > 0) {
      throw new BadRequestException('支系已有指向外部的血缘边');
    }

    const kept = new Map<string, { ancestor_id: bigint; descendant_id: bigint; depth: number }>();
    for (const edge of edgesIntoB) {
      kept.set(this.edgeKey(edge.ancestor_id, edge.descendant_id), {
        ancestor_id: edge.ancestor_id,
        descendant_id: edge.descendant_id,
        depth: edge.depth,
      });
    }
    for (const personId of branchIds) {
      const key = this.edgeKey(personId, personId);
      if (!kept.has(key)) {
        kept.set(key, { ancestor_id: personId, descendant_id: personId, depth: 0 });
      }
    }

    for (const ancestor of anchorRows) {
      for (const descendant of branchRows) {
        const depth = ancestor.depth + descendant.depth + 1;
        if (depth < 1) {
          throw new BadRequestException('闭包深度非法');
        }
        const key = this.edgeKey(ancestor.ancestor_id, descendant.descendant_id);
        const existing = kept.get(key);
        if (existing) {
          throw new BadRequestException('闭包主键或深度冲突');
        }
        kept.set(key, {
          ancestor_id: ancestor.ancestor_id,
          descendant_id: descendant.descendant_id,
          depth,
        });
      }
    }

    return { edges: [...kept.values()], branchIds, anchorRows };
  }

  private edgeKey(ancestorId: bigint, descendantId: bigint): string {
    return `${ancestorId.toString()}:${descendantId.toString()}`;
  }

  private async insertAncestry(
    tx: any,
    rows: { ancestor_id: bigint; descendant_id: bigint; depth: number }[],
  ): Promise<void> {
    const batchSize = 500;
    for (let i = 0; i < rows.length; i += batchSize) {
      await tx.personAncestry.createMany({ data: rows.slice(i, i + batchSize) });
    }
  }

  private parseIso(value: string | null | undefined): Date | null {
    if (!value) return null;
    return new Date(value);
  }

  private serializePerson(person: any) {
    return {
      id: person.id.toString(),
      clan_id: person.clan_id.toString(),
      full_name: person.full_name,
      gender: person.gender,
      birth_date: person.birth_date ? new Date(person.birth_date).toISOString() : null,
      death_date: person.death_date ? new Date(person.death_date).toISOString() : null,
      is_living: person.is_living,
      birth_place: person.birth_place ?? null,
      birth_lat: person.birth_lat ?? null,
      birth_lng: person.birth_lng ?? null,
      death_place: person.death_place ?? null,
      death_lat: person.death_lat ?? null,
      death_lng: person.death_lng ?? null,
      avatar_url: person.avatar_url ?? null,
      thumbnail_url: person.thumbnail_url ?? null,
      migration_branch: person.migration_branch ?? null,
      deleted_at: person.deleted_at ? new Date(person.deleted_at).toISOString() : null,
      deleted_by: person.deleted_by ?? null,
    };
  }

  private serializeBio(bio: any) {
    return {
      person_id: bio.person_id.toString(),
      courtesy_name: bio.courtesy_name ?? null,
      native_place: bio.native_place ?? null,
      burial_place: bio.burial_place ?? null,
      achievements: bio.achievements ?? null,
      anecdotes: bio.anecdotes ?? null,
      biography: bio.biography ?? null,
      marital_notes: bio.marital_notes ?? null,
      adoption_note: bio.adoption_note ?? null,
      premature: bio.premature ?? null,
      taboo_name: bio.taboo_name ?? null,
      art_name: bio.art_name ?? null,
      posthumous_name: bio.posthumous_name ?? null,
      infant_name: bio.infant_name ?? null,
      alias_name: bio.alias_name ?? null,
      former_name: bio.former_name ?? null,
      nickname: bio.nickname ?? null,
      ethnicity: bio.ethnicity ?? null,
      education: bio.education ?? null,
      occupation: bio.occupation ?? null,
      job_title: bio.job_title ?? null,
      alma_mater: bio.alma_mater ?? null,
      employer: bio.employer ?? null,
      lunar_birth: bio.lunar_birth ?? null,
      lunar_death: bio.lunar_death ?? null,
      religion: bio.religion ?? null,
      blood_type: bio.blood_type ?? null,
      epitaph: bio.epitaph ?? null,
      source_note: bio.source_note ?? null,
      generation_char: bio.generation_char ?? null,
      contact_phone: bio.contact_phone ?? null,
    };
  }

  private bioData(bio: any) {
    const serialized = this.serializeBio({ ...bio, person_id: BigInt(bio.person_id) });
    const { person_id: _personId, ...rest } = serialized;
    return rest;
  }

  private serializeFamily(family: any) {
    return {
      id: family.id.toString(),
      clan_id: family.clan_id.toString(),
      husband_id: family.husband_id ? family.husband_id.toString() : null,
      wife_id: family.wife_id ? family.wife_id.toString() : null,
      union_type: family.union_type ?? null,
      marriage_date: family.marriage_date ? new Date(family.marriage_date).toISOString() : null,
      marriage_order: family.marriage_order ?? 1,
      divorce_date: family.divorce_date ? new Date(family.divorce_date).toISOString() : null,
      end_reason: family.end_reason ?? null,
      is_current: family.is_current ?? true,
      note: family.note ?? null,
    };
  }

  private serializeMedia(media: any) {
    return {
      id: media.id.toString(),
      clan_id: media.clan_id.toString(),
      file_url: media.file_url ?? null,
      display_url: media.display_url ?? null,
      thumb_url: media.thumb_url ?? null,
      original_key: media.original_key ?? null,
      media_type: media.media_type ?? null,
      original_filename: media.original_filename ?? null,
      description: media.description ?? null,
      category: media.category ?? null,
      album_id: media.album_id ? media.album_id.toString() : null,
      privacy_level: media.privacy_level ?? null,
      deleted_at: media.deleted_at ? new Date(media.deleted_at).toISOString() : null,
    };
  }

}
