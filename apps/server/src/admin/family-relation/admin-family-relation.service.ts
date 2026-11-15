import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@geneasphere/db';
import { RelationChangeStatus } from '@prisma/client';
import { AdminService } from '../admin.service';
import { NotificationService } from '../../common/notification.service';
import { PedigreeService } from '../../pedigree/pedigree.service';
import { serializeBigInt } from '../../common/bigint-serializer';

const REVIEWABLE = [RelationChangeStatus.pending, RelationChangeStatus.needs_manual];

@Injectable()
export class AdminFamilyRelationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminService: AdminService,
    private readonly notificationService: NotificationService,
    private readonly pedigreeService: PedigreeService,
  ) {}

  /**
   * 审核队列列表
   */
  async listChanges(callerUserId: string, params: {
    clanSlug: string;
    status?: string;
    changeType?: string;
    page: number;
    pageSize: number;
  }) {
    const clanIdBig = await this.adminService.requireAdminBySlug(params.clanSlug, callerUserId);
    const where: any = { clan_id: clanIdBig };

    if (params.status) where.status = params.status;
    if (params.changeType) where.change_type = params.changeType;
    if (!params.status) {
      // 默认显示待处理
      where.status = { in: ['pending', 'needs_manual'] };
    }

    const skip = (params.page - 1) * params.pageSize;
    const [data, total] = await Promise.all([
      this.prisma.familyRelationChange.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: params.pageSize,
        include: {
          person: { select: { full_name: true } },
          operator: { select: { phone: true } },
        },
      }),
      this.prisma.familyRelationChange.count({ where }),
    ]);

    return {
      data: data.map((r) => ({
        id: r.id.toString(),
        person_id: r.person_id.toString(),
        person_name: r.person.full_name,
        operator_phone: r.operator.phone,
        change_type: r.change_type,
        previous_state: r.previous_state,
        current_state: r.current_state,
        privacy_level: r.privacy_level,
        status: r.status,
        needs_manual: r.needs_manual,
        is_disputed: r.is_disputed,
        change_reason: r.change_reason,
        created_at: r.created_at,
      })),
      pagination: {
        page: params.page,
        page_size: params.pageSize,
        total,
        total_pages: Math.ceil(total / params.pageSize),
      },
    };
  }

  /**
   * 变更详情
   */
  async getChange(callerUserId: string, changeId: string) {
    const id = BigInt(changeId);
    const change = await this.prisma.familyRelationChange.findUnique({
      where: { id },
      include: {
        person: { select: { full_name: true, clan_id: true } },
        operator: { select: { phone: true } },
        target_person: { select: { full_name: true } },
        reviewer: { select: { phone: true } },
      },
    });
    if (!change) throw new NotFoundException('变更记录不存在');

    await this.adminService.requireAdmin(change.person.clan_id, callerUserId);

    return {
      id: change.id.toString(),
      clan_id: change.clan_id.toString(),
      person_id: change.person_id.toString(),
      person_name: change.person.full_name,
      operator_phone: change.operator.phone,
      change_type: change.change_type,
      previous_state: change.previous_state,
      current_state: change.current_state,
      privacy_level: change.privacy_level,
      status: change.status,
      change_reason: change.change_reason,
      target_person_name: change.target_person?.full_name,
      needs_manual: change.needs_manual,
      is_disputed: change.is_disputed,
      reject_reason: change.reject_reason,
      reviewed_at: change.reviewed_at,
      created_at: change.created_at,
    };
  }

  /**
   * 通过变更
   */
  async approveChange(adminUserId: string, changeId: string) {
    const id = BigInt(changeId);
    const change = await this.prisma.familyRelationChange.findUnique({
      where: { id },
      include: { person: { select: { clan_id: true } } },
    });
    if (!change) throw new NotFoundException('变更记录不存在');

    await this.adminService.requireAdmin(change.person.clan_id, adminUserId);

    await this.prisma.$transaction(async (tx) => {
      await this.applyDeferred(tx, change);
      const updated = await tx.familyRelationChange.updateMany({
        where: { id, status: { in: REVIEWABLE } },
        data: {
          status: RelationChangeStatus.approved,
          approved_by: adminUserId,
          reviewed_at: new Date(),
        },
      });
      if (updated.count !== 1) {
        throw new BadRequestException('只能审核待审或需线下确认的变更');
      }
    });

    // 审计日志
    await this.adminService.logAction({
      clanId: change.person.clan_id,
      userId: adminUserId,
      action: 'RELATION_CHANGE_APPROVE',
      targetType: 'FamilyRelationChange',
      targetId: changeId,
      details: JSON.stringify({ change_type: change.change_type, person_id: change.person_id.toString() }),
    });

    // 通知当事人
    await this.notificationService.notify({
      userId: change.operator_user_id,
      clanId: change.person.clan_id,
      type: 'SYSTEM' as any,
      title: '家庭关系变更已通过',
      content: '您的家庭关系变更申请已通过审核。',
      targetType: 'FamilyRelationChange',
      targetId: changeId,
    });

    return { id: changeId, status: 'approved' };
  }

  /**
   * 驳回变更
   */
  async rejectChange(adminUserId: string, changeId: string, reason: string) {
    if (!reason) throw new BadRequestException('驳回理由必填');

    const id = BigInt(changeId);
    const change = await this.prisma.familyRelationChange.findUnique({
      where: { id },
      include: { person: { select: { clan_id: true } } },
    });
    if (!change) throw new NotFoundException('变更记录不存在');

    await this.adminService.requireAdmin(change.person.clan_id, adminUserId);

    await this.prisma.$transaction(async (tx) => {
      const state = (change.current_state || {}) as { applied?: boolean };
      const previous = (change.previous_state || {}) as { current_spouse_id?: string | null };
      if (change.change_type === 'marriage' && state.applied !== false && previous.current_spouse_id) {
        await tx.marriageHistory.updateMany({
          where: {
            person_id: change.person_id,
            spouse_id: BigInt(previous.current_spouse_id),
          },
          data: { is_current: true, end_date: null, end_reason: null },
        });
      }
      const updated = await tx.familyRelationChange.updateMany({
        where: { id, status: { in: REVIEWABLE } },
        data: {
          status: RelationChangeStatus.rejected,
          approved_by: adminUserId,
          reviewed_at: new Date(),
          reject_reason: reason,
        },
      });
      if (updated.count !== 1) {
        throw new BadRequestException('只能审核待审或需线下确认的变更');
      }
    });

    await this.adminService.logAction({
      clanId: change.person.clan_id,
      userId: adminUserId,
      action: 'RELATION_CHANGE_REJECT',
      targetType: 'FamilyRelationChange',
      targetId: changeId,
      details: JSON.stringify({ reason, change_type: change.change_type }),
    });

    await this.notificationService.notify({
      userId: change.operator_user_id,
      clanId: change.person.clan_id,
      type: 'SYSTEM' as any,
      title: '家庭关系变更被驳回',
      content: `您的家庭关系变更申请被驳回。驳回理由：${reason}`,
      targetType: 'FamilyRelationChange',
      targetId: changeId,
    });

    return { id: changeId, status: 'rejected' };
  }

  /**
   * 标记为需线下确认
   */
  async markManual(adminUserId: string, changeId: string) {
    const id = BigInt(changeId);
    const change = await this.prisma.familyRelationChange.findUnique({
      where: { id },
      include: { person: { select: { clan_id: true } } },
    });
    if (!change) throw new NotFoundException('变更记录不存在');

    await this.adminService.requireAdmin(change.person.clan_id, adminUserId);

    const updated = await this.prisma.familyRelationChange.updateMany({
      where: { id, status: { in: REVIEWABLE } },
      data: {
        status: RelationChangeStatus.needs_manual,
        needs_manual: true,
        approved_by: adminUserId,
        reviewed_at: new Date(),
      },
    });
    if (updated.count !== 1) {
      throw new BadRequestException('只能把待审或需线下确认的变更标为线下确认');
    }

    await this.adminService.logAction({
      clanId: change.person.clan_id,
      userId: adminUserId,
      action: 'RELATION_CHANGE_MANUAL',
      targetType: 'FamilyRelationChange',
      targetId: changeId,
      details: JSON.stringify({ change_type: change.change_type }),
    });

    await this.notificationService.notify({
      userId: change.operator_user_id,
      clanId: change.person.clan_id,
      type: 'SYSTEM' as any,
      title: '家庭关系变更需线下确认',
      content: '您的家庭关系变更申请已被标记为"需线下确认"，请上传相关证明材料。',
      targetType: 'FamilyRelationChange',
      targetId: changeId,
    });

    return { id: changeId, status: 'needs_manual' };
  }

  /**
   * 争议列表
   */
  async listDisputes(callerUserId: string, clanSlug: string) {
    const clanIdBig = await this.adminService.requireAdminBySlug(clanSlug, callerUserId);
    const rows = await this.prisma.familyRelationChange.findMany({
      where: { clan_id: clanIdBig, is_disputed: true },
      orderBy: { created_at: 'desc' },
      include: {
        person: { select: { full_name: true } },
      },
    });
    return serializeBigInt(rows);
  }

  /**
   * 解决争议
   */
  async resolveDispute(adminUserId: string, changeId: string, custodyStatus: string) {
    const id = BigInt(changeId);
    const change = await this.prisma.familyRelationChange.findUnique({
      where: { id },
      include: { person: { select: { clan_id: true } } },
    });
    if (!change) throw new NotFoundException('争议记录不存在');

    await this.adminService.requireAdmin(change.person.clan_id, adminUserId);
    if (!change.target_person_id) {
      throw new BadRequestException('争议缺少目标子女，无法落库');
    }
    if (!change.is_disputed) {
      throw new BadRequestException('该记录不是待解决的子女争议');
    }

    const clan = await this.prisma.clan.findUnique({
      where: { id: change.clan_id },
      select: { name: true },
    });

    await this.prisma.$transaction(async (tx) => {
      await this.writeCustody(tx, change, custodyStatus);
      const updated = await tx.familyRelationChange.updateMany({
        where: { id, is_disputed: true, status: { in: REVIEWABLE } },
        data: {
          is_disputed: false,
          status: RelationChangeStatus.approved,
          approved_by: adminUserId,
          reviewed_at: new Date(),
        },
      });
      if (updated.count !== 1) {
        throw new BadRequestException('只能解决仍待处理的争议');
      }
    });

    await this.adminService.logAction({
      clanId: change.person.clan_id,
      userId: adminUserId,
      action: 'RELATION_DISPUTE_RESOLVE',
      targetType: 'FamilyRelationChange',
      targetId: changeId,
      details: JSON.stringify({ custody_status: custodyStatus, child_id: change.target_person_id.toString() }),
    });

    await this.notificationService.notify({
      userId: change.operator_user_id,
      clanId: change.person.clan_id,
      type: 'SYSTEM' as any,
      title: '子女归属争议已解决',
      content: `您在「${clan?.name || '本家族'}」的子女归属争议已被管理员解决。`,
      targetType: 'FamilyRelationChange',
      targetId: changeId,
    });

    return { id: changeId, status: 'resolved', custody_status: custodyStatus };
  }

  private async applyDeferred(tx: any, change: any) {
    const state = (change.current_state || {}) as any;
    if (state.applied !== false) return;
    if (change.change_type === 'marriage') {
      const previous = (change.previous_state || {}) as { current_spouse_id?: string | null };
      if (previous.current_spouse_id) {
        const endReason = state.marriage_status === 'widowed' ? 'widowed' : 'divorce';
        await tx.marriageHistory.updateMany({
          where: {
            person_id: change.person_id,
            spouse_id: BigInt(previous.current_spouse_id),
            is_current: true,
          },
          data: { is_current: false, end_date: new Date(), end_reason: endReason },
        });
      }
      return;
    }
    if (change.change_type === 'child') {
      await this.applyDeferredChild(tx, change, state);
      return;
    }
    if (change.change_type === 'custody') {
      await this.writeCustody(tx, change, state.custody_status);
    }
  }

  private async applyDeferredChild(tx: any, change: any, state: any) {
    const parent = await tx.person.findUnique({
      where: { id: change.person_id },
      select: { clan_id: true, gender: true },
    });
    if (!parent) throw new NotFoundException('父/母不存在');
    const child = await tx.person.create({
      data: {
        clan_id: parent.clan_id,
        full_name: state.child_name,
        gender: state.child_gender,
        birth_date: state.birth_date ? new Date(state.birth_date) : undefined,
        is_living: true,
      },
    });
    const husbandId = parent.gender === 'male' ? change.person_id : null;
    const wifeId = parent.gender === 'female' ? change.person_id : null;
    const familyUnit = await tx.familyUnit.create({
      data: { clan_id: parent.clan_id, husband_id: husbandId, wife_id: wifeId },
    });
    await this.pedigreeService.attachChildToParents(tx, {
      clan_id: parent.clan_id,
      child_id: child.id,
      parent_ids: [change.person_id],
      family_id: familyUnit.id,
    });
    await tx.childCustodyRecord.create({
      data: {
        clan_id: parent.clan_id,
        child_id: child.id,
        parent_id: change.person_id,
        custody_status: state.custody,
        is_biological: true,
        effective_from: new Date(),
        effective_to: null,
        created_by: change.operator_user_id,
      },
    });
    await tx.familyRelationChange.update({
      where: { id: change.id },
      data: { target_person_id: child.id },
    });
  }

  private async writeCustody(tx: any, change: any, custodyStatus: string) {
    const childId = change.target_person_id as bigint | null;
    if (!childId) throw new BadRequestException('争议缺少目标子女，无法落库');
    const state = (change.current_state || {}) as { applied?: boolean; is_biological?: boolean };
    if (state.applied === false) {
      await tx.childCustodyRecord.updateMany({
        where: { child_id: childId, parent_id: change.person_id, effective_to: null },
        data: { effective_to: new Date() },
      });
      await tx.childCustodyRecord.create({
        data: {
          clan_id: change.clan_id,
          child_id: childId,
          parent_id: change.person_id,
          custody_status: custodyStatus,
          is_biological: state.is_biological ?? true,
          effective_from: new Date(),
          effective_to: null,
          dispute_flag: false,
          created_by: change.operator_user_id,
        },
      });
    }
    await tx.childCustodyRecord.updateMany({
      where: { child_id: childId, effective_to: null },
      data: { dispute_flag: false, custody_status: custodyStatus },
    });
  }
}
