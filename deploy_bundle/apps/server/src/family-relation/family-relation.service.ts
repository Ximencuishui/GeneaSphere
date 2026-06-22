import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@geneasphere/db';
import {
  RelationChangeType,
  RelationChangeStatus,
  RelationPrivacyLevel,
  CustodyStatus,
  MarriageType,
  MarriageEndReason,
} from '@prisma/client';
import { NotificationService } from '../common/notification.service';
import { RelationValidator } from './utils/relation-validator';
import { PrivacyFilter, ViewerContext } from './utils/privacy-filter';
import { UpdateMarriageDto } from './dto/update-marriage.dto';
import { UpdateSpouseDto } from './dto/update-spouse.dto';
import { AddChildDto } from './dto/add-child.dto';
import { UpdateCustodyDto } from './dto/update-custody.dto';
import { UpdatePrivacyPreferenceDto } from './dto/privacy-preference.dto';
import { QueryHistoryDto } from './dto/query-history.dto';
import { AdminService } from '../admin/admin.service';

@Injectable()
export class FamilyRelationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
    private readonly validator: RelationValidator,
    private readonly privacyFilter: PrivacyFilter,
    private readonly adminService: AdminService,
  ) {}

  /**
   * 解析当前用户关联的本人 Person（relation_role=self）
   */
  async resolveOwnPerson(userId: string): Promise<{ person_id: string; clan_id: string }[]> {
    const links = await this.prisma.personUserLink.findMany({
      where: { user_id: userId, relation_role: 'self' },
      include: { person: { select: { clan_id: true, full_name: true } } },
    });
    return links.map((l) => ({
      person_id: l.person_id.toString(),
      clan_id: l.person.clan_id.toString(),
      full_name: l.person.full_name,
    }));
  }

  /**
   * 获取指定 person 的当前家庭关系
   */
  async getCurrentRelationship(personId: bigint, viewerUserId: string) {
    const person = await this.prisma.person.findUnique({
      where: { id: personId },
    });
    if (!person) throw new NotFoundException('人物不存在');

    // 获取当前婚姻（is_current=true 的最新一条）
    const currentMarriage = await this.prisma.marriageHistory.findFirst({
      where: { person_id: personId, is_current: true },
      include: { spouse: { select: { id: true, full_name: true } } },
      orderBy: { start_date: 'desc' },
    });

    // 子女（通过 child_custody_records 查询当前有效抚养记录）
    const custodyRecords = await this.prisma.childCustodyRecord.findMany({
      where: { parent_id: personId, effective_to: null },
      include: {
        child: { select: { id: true, full_name: true, gender: true } },
      },
    });

    // 子女也通过 FamilyUnit → FamilyChild 查询（族谱原有关系）
    const familyUnits = await this.prisma.familyUnit.findMany({
      where: {
        OR: [{ husband_id: personId }, { wife_id: personId }],
      },
      select: { id: true },
    });
    const familyUnitIds = familyUnits.map((fu) => fu.id);
    const familyChildren = await this.prisma.familyChild.findMany({
      where: { family_id: { in: familyUnitIds } },
      include: { child: { select: { id: true, full_name: true, gender: true } } },
    });

    // 合并子女列表（去重）
    const childMap = new Map<string, any>();
    for (const fc of familyChildren) {
      const id = fc.child.id.toString();
      childMap.set(id, {
        id,
        full_name: fc.child.full_name,
        gender: fc.child.gender,
      });
    }
    for (const cr of custodyRecords) {
      const id = cr.child.id.toString();
      childMap.set(id, {
        id,
        full_name: cr.child.full_name,
        gender: cr.child.gender,
        custody_status: cr.custody_status,
        custody_visible: true,
      });
    }

    return {
      person: { id: person.id.toString(), full_name: person.full_name, gender: person.gender },
      marriage: currentMarriage
        ? {
            status: 'married' as const,
            current_spouse: {
              id: currentMarriage.spouse.id.toString(),
              full_name: currentMarriage.spouse.full_name,
            },
            has_history: true,
          }
        : { status: 'not_in_marriage' as const, has_history: false },
      children: Array.from(childMap.values()),
    };
  }

  // ==================== 婚姻状态 ====================

  async updateMarriageStatus(userId: string, dto: UpdateMarriageDto) {
    const personId = BigInt(dto.person_id);
    await this.validator.assertOwnPerson(userId, personId);
    await this.validator.assertAdult(personId);

    // 风控检查
    const isRisky = await this.validator.checkMarriageRisk(personId);
    const needsManual = isRisky;

    const person = await this.prisma.person.findUnique({
      where: { id: personId },
      select: { clan_id: true, full_name: true },
    });
    if (!person) throw new NotFoundException('人物不存在');

    return this.prisma.$transaction(async (tx) => {
      // 获取当前活跃婚姻记录
      const currentMarriage = await tx.marriageHistory.findFirst({
        where: { person_id: personId, is_current: true },
      });

      // 构建变更前后状态快照
      const previousState = {
        marriage_status: currentMarriage ? 'married' : 'not_in_marriage',
        current_spouse_id: currentMarriage?.spouse_id?.toString() || null,
      };

      const now = new Date();

      // 如果当前有婚姻记录，先结束它
      if (currentMarriage) {
        let endReason: MarriageEndReason;
        if (dto.current_status === 'widowed') {
          endReason = MarriageEndReason.widowed;
        } else {
          endReason = MarriageEndReason.divorce;
        }

        await tx.marriageHistory.update({
          where: { id: currentMarriage.id },
          data: {
            is_current: false,
            end_date: now,
            end_reason: endReason,
            privacy_level: dto.keep_previous_spouse !== false ? 'admin' : 'clan',
          },
        });
      }

      // 如果新状态为 remarried 或 married，创建新婚姻记录
      if (dto.current_status === 'remarried' || dto.current_status === 'married') {
        // remarried 但未提供新配偶信息时，跳过（spouse 需要单独的 dto）
        // 这里仅记录婚姻状态变更，配偶具体信息由 updateSpouse 处理
      }

      const currentState = {
        marriage_status: dto.current_status,
        previous_spouse_kept: dto.keep_previous_spouse !== false,
      };

      // 写入变更记录
      const change = await tx.familyRelationChange.create({
        data: {
          clan_id: person.clan_id,
          person_id: personId,
          operator_user_id: userId,
          change_type: 'marriage',
          previous_state: previousState,
          current_state: currentState,
          privacy_level: dto.keep_previous_spouse !== false ? 'admin' : 'clan',
          change_reason: dto.change_reason,
          status: needsManual ? RelationChangeStatus.pending : RelationChangeStatus.auto_approved,
          needs_manual: needsManual,
        },
      });

      // 通知前任配偶（如果有关联 user）
      if (currentMarriage?.spouse_id) {
        await this.notifySpouseChange(
          tx,
          person.clan_id,
          currentMarriage.spouse_id,
          personId,
          person.full_name,
          dto.current_status,
        );
      }

      return { id: change.id.toString(), status: change.status, needs_manual: needsManual };
    });
  }

  // ==================== 配偶信息 ====================

  async updateSpouse(userId: string, dto: UpdateSpouseDto) {
    const personId = BigInt(dto.person_id);
    await this.validator.assertOwnPerson(userId, personId);
    await this.validator.assertAdult(personId);

    const person = await this.prisma.person.findUnique({
      where: { id: personId },
      select: { clan_id: true, full_name: true },
    });
    if (!person) throw new NotFoundException('人物不存在');

    return this.prisma.$transaction(async (tx) => {
      const previousState = { action: dto.action };

      if (dto.action === 'add' || dto.action === 'replace') {
        if (dto.action === 'replace') {
          // 结束现有婚姻
          const existing = await tx.marriageHistory.findFirst({
            where: { person_id: personId, is_current: true },
          });
          if (existing) {
            await tx.marriageHistory.update({
              where: { id: existing.id },
              data: { is_current: false, end_date: new Date(), end_reason: 'divorce' },
            });
          }
        }

        // 新增配偶
        let spouseId: bigint | null = null;

        if (dto.new_spouse && !dto.new_spouse.is_external) {
          // 内部配偶 — 查找或创建 Person
          let spouse = await tx.person.findFirst({
            where: {
              clan_id: person.clan_id,
              full_name: dto.new_spouse.full_name,
              gender: dto.new_spouse.gender,
            },
          });
          if (!spouse) {
            spouse = await tx.person.create({
              data: {
                clan_id: person.clan_id,
                full_name: dto.new_spouse.full_name,
                gender: dto.new_spouse.gender as any,
                birth_date: dto.new_spouse.birth_date ? new Date(dto.new_spouse.birth_date) : undefined,
                is_living: true,
              },
            });
          }
          spouseId = spouse.id;
        }

        const marriage = await tx.marriageHistory.create({
          data: {
            clan_id: person.clan_id,
            person_id: personId,
            spouse_id: spouseId || BigInt(0), // external 配偶暂用占位
            marriage_type: 'remarriage',
            start_date: dto.start_date ? new Date(dto.start_date) : new Date(),
            is_current: true,
            privacy_level: 'admin',
          },
        });

        if (dto.new_spouse?.is_external) {
          // 更新 spouse_id 或存储外部配偶姓名到 current_state
          await tx.marriageHistory.update({
            where: { id: marriage.id },
            data: {
              current_state: { external_spouse_name: dto.new_spouse.full_name },
            } as any,
          });
        }
      }

      if (dto.action === 'remove') {
        const existing = await tx.marriageHistory.findFirst({
          where: { person_id: personId, is_current: true },
        });
        if (existing) {
          await tx.marriageHistory.update({
            where: { id: existing.id },
            data: { is_current: false, end_date: new Date(), end_reason: 'divorce' },
          });
        }
      }

      const change = await tx.familyRelationChange.create({
        data: {
          clan_id: person.clan_id,
          person_id: personId,
          operator_user_id: userId,
          change_type: 'spouse',
          previous_state: previousState,
          current_state: { action: dto.action, spouse_name: dto.new_spouse?.full_name },
          privacy_level: 'admin',
          status: RelationChangeStatus.auto_approved,
        },
      });

      return { id: change.id.toString() };
    });
  }

  // ==================== 新增子女 ====================

  async addChild(userId: string, dto: AddChildDto) {
    const parentPersonId = BigInt(dto.parent_person_id);
    await this.validator.assertOwnPerson(userId, parentPersonId);
    await this.validator.assertAdult(parentPersonId);

    const parent = await this.prisma.person.findUnique({
      where: { id: parentPersonId },
      select: { clan_id: true, gender: true, full_name: true },
    });
    if (!parent) throw new NotFoundException('父/母不存在');

    return this.prisma.$transaction(async (tx) => {
      // 创建子女 Person
      const child = await tx.person.create({
        data: {
          clan_id: parent.clan_id,
          full_name: dto.child.full_name,
          gender: dto.child.gender as any,
          birth_date: dto.child.birth_date ? new Date(dto.child.birth_date) : undefined,
          is_living: true,
        },
      });

      // 创建 FamilyUnit + FamilyChild（仅记录亲子关系）
      let husbandId: bigint | null = null;
      let wifeId: bigint | null = null;

      if (parent.gender === 'male') {
        husbandId = parentPersonId;
      } else {
        wifeId = parentPersonId;
      }

      // 如果有配偶，尝试匹配
      const currentMarriage = await tx.marriageHistory.findFirst({
        where: { person_id: parentPersonId, is_current: true },
        include: { spouse: true },
      });
      if (currentMarriage) {
        if (currentMarriage.spouse.gender === 'male') husbandId = currentMarriage.spouse_id;
        else wifeId = currentMarriage.spouse_id;
      }

      const familyUnit = await tx.familyUnit.create({
        data: {
          clan_id: parent.clan_id,
          husband_id: husbandId,
          wife_id: wifeId,
        },
      });

      await tx.familyChild.create({
        data: {
          family_id: familyUnit.id,
          child_id: child.id,
          birth_order: 0,
        },
      });

      // 写入抚养记录
      await tx.childCustodyRecord.create({
        data: {
          clan_id: parent.clan_id,
          child_id: child.id,
          parent_id: parentPersonId,
          custody_status: dto.custody as CustodyStatus,
          is_biological: true,
          effective_from: new Date(),
          effective_to: null,
          created_by: userId,
        },
      });

      // 若配偶存在且是内部成员，也为配偶创建抚养记录
      if (currentMarriage && currentMarriage.spouse_id) {
        const spousePerson = await tx.person.findUnique({
          where: { id: currentMarriage.spouse_id },
          select: { clan_id: true },
        });
        if (spousePerson && spousePerson.clan_id === parent.clan_id) {
          await tx.childCustodyRecord.create({
            data: {
              clan_id: parent.clan_id,
              child_id: child.id,
              parent_id: currentMarriage.spouse_id,
              custody_status: dto.custody as CustodyStatus,
              is_biological: true,
              effective_from: new Date(),
              effective_to: null,
              created_by: userId,
            },
          });
        }
      }

      // 判断是否需要管理员审核
      const needsManual =
        dto.child.father_info_missing && parent.gender === 'female';

      const change = await tx.familyRelationChange.create({
        data: {
          clan_id: parent.clan_id,
          person_id: parentPersonId,
          operator_user_id: userId,
          change_type: 'child',
          current_state: {
            child_name: dto.child.full_name,
            child_gender: dto.child.gender,
            custody: dto.custody,
            father_info_missing: dto.child.father_info_missing,
            mother_info_missing: dto.child.mother_info_missing,
          },
          privacy_level: 'admin',
          change_reason: dto.change_reason,
          status: needsManual ? RelationChangeStatus.pending : RelationChangeStatus.auto_approved,
          needs_manual: needsManual,
        },
      });

      return {
        child_id: child.id.toString(),
        change_id: change.id.toString(),
        needs_manual: needsManual,
      };
    });
  }

  // ==================== 子女抚养关系 ====================

  async updateCustody(userId: string, childId: string, dto: UpdateCustodyDto) {
    const childBigInt = BigInt(childId);
    const childIdNum = BigInt(dto.child_id);

    if (childBigInt.toString() !== childIdNum.toString()) {
      throw new BadRequestException('子女 ID 不匹配');
    }

    const { parentId } = await this.validator.assertIsParent(userId, childBigInt);

    const child = await this.prisma.person.findUnique({
      where: { id: childBigInt },
      select: { clan_id: true, full_name: true },
    });
    if (!child) throw new NotFoundException('子女不存在');

    return this.prisma.$transaction(async (tx) => {
      // 关闭旧抚养记录
      await tx.childCustodyRecord.updateMany({
        where: { child_id: childBigInt, parent_id: parentId, effective_to: null },
        data: { effective_to: new Date() },
      });

      // 创建新记录
      await tx.childCustodyRecord.create({
        data: {
          clan_id: child.clan_id,
          child_id: childBigInt,
          parent_id: parentId,
          custody_status: dto.custody_status as CustodyStatus,
          is_biological: dto.is_biological ?? true,
          effective_from: new Date(),
          effective_to: null,
          created_by: userId,
        },
      });

      // 检测争议
      const isDisputed = await this.validator.detectDispute(childBigInt);

      if (isDisputed) {
        await tx.childCustodyRecord.updateMany({
          where: { child_id: childBigInt, effective_to: null },
          data: { dispute_flag: true },
        });
      }

      const change = await tx.familyRelationChange.create({
        data: {
          clan_id: child.clan_id,
          person_id: parentId,
          operator_user_id: userId,
          change_type: 'custody',
          current_state: {
            child_name: child.full_name,
            custody_status: dto.custody_status,
            is_disputed: isDisputed,
          },
          privacy_level: 'admin',
          change_reason: dto.change_reason,
          status: isDisputed ? RelationChangeStatus.pending : RelationChangeStatus.auto_approved,
          is_disputed: isDisputed,
          needs_manual: isDisputed,
        },
      });

      return {
        change_id: change.id.toString(),
        is_disputed: isDisputed,
        needs_manual: isDisputed,
      };
    });
  }

  // ==================== 历史查询 ====================

  async getHistory(userId: string, query: QueryHistoryDto) {
    const where: any = { operator_user_id: userId };
    if (query.change_type) where.change_type = query.change_type;
    if (query.person_id) where.person_id = BigInt(query.person_id);
    if (query.start_date || query.end_date) {
      where.created_at = {};
      if (query.start_date) where.created_at.gte = new Date(query.start_date);
      if (query.end_date) where.created_at.lte = new Date(query.end_date);
    }

    const page = query.page || 1;
    const pageSize = query.pageSize || 20;
    const skip = (page - 1) * pageSize;

    const [data, total] = await Promise.all([
      this.prisma.familyRelationChange.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: pageSize,
        include: {
          person: { select: { full_name: true } },
        },
      }),
      this.prisma.familyRelationChange.count({ where }),
    ]);

    const viewer: ViewerContext = { userId, isSelf: true, isAdmin: false };
    const filtered = this.privacyFilter.filterRelationChange(data, viewer);

    return {
      data: filtered.map((r) => ({
        id: (r as any).id?.toString(),
        change_type: (r as any).change_type,
        previous_state: (r as any).previous_state,
        current_state: (r as any).current_state,
        privacy_level: (r as any).privacy_level,
        status: (r as any).status,
        needs_manual: (r as any).needs_manual,
        is_disputed: (r as any).is_disputed,
        change_reason: (r as any).change_reason,
        created_at: (r as any).created_at,
        person_name: (r as any).person?.full_name,
      })),
      pagination: {
        page,
        page_size: pageSize,
        total,
        total_pages: Math.ceil(total / pageSize),
      },
    };
  }

  // ==================== 隐私偏好 ====================

  async getPrivacyPreference(userId: string) {
    let pref = await this.prisma.relationPrivacyPreference.findUnique({
      where: { user_id: userId },
    });
    if (!pref) {
      // 创建默认偏好
      pref = await this.prisma.relationPrivacyPreference.create({
        data: { user_id: userId },
      });
    }
    return {
      share_marriage_history: pref.share_marriage_history,
      share_custody_details: pref.share_custody_details,
      show_biological_status: pref.show_biological_status,
      enable_change_notifications: pref.enable_change_notifications,
    };
  }

  async updatePrivacyPreference(userId: string, dto: UpdatePrivacyPreferenceDto) {
    const data: any = {};
    if (dto.share_marriage_history !== undefined) data.share_marriage_history = dto.share_marriage_history;
    if (dto.share_custody_details !== undefined) data.share_custody_details = dto.share_custody_details;
    if (dto.show_biological_status !== undefined) data.show_biological_status = dto.show_biological_status;
    if (dto.enable_change_notifications !== undefined) data.enable_change_notifications = dto.enable_change_notifications;

    const pref = await this.prisma.relationPrivacyPreference.upsert({
      where: { user_id: userId },
      create: { user_id: userId, ...data },
      update: data,
    });

    return pref;
  }

  // ==================== 通知辅助 ====================

  private async notifySpouseChange(
    tx: any,
    clanId: bigint,
    spousePersonId: bigint,
    changerPersonId: bigint,
    changerName: string,
    status: string,
  ) {
    // 找到配偶关联的 user
    const spouseUserLink = await tx.personUserLink.findFirst({
      where: { person_id: spousePersonId, relation_role: 'self' },
    });
    if (!spouseUserLink) return;

    const statusText =
      status === 'not_in_marriage' ? '婚姻关系解除' : status === 'widowed' ? '丧偶' : '婚姻状态变更';

    await this.notificationService.notify({
      userId: spouseUserLink.user_id,
      clanId,
      type: 'SYSTEM' as any,
      title: '家庭关系变更通知',
      content: `${changerName} 的${statusText}，相关信息已更新。`,
      targetType: 'Person',
      targetId: changerPersonId.toString(),
    });
  }
}
