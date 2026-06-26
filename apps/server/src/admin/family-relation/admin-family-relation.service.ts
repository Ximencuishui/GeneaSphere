import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@geneasphere/db';
import { RelationChangeStatus } from '@prisma/client';
import { AdminService } from '../admin.service';
import { NotificationService } from '../../common/notification.service';

@Injectable()
export class AdminFamilyRelationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminService: AdminService,
    private readonly notificationService: NotificationService,
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

    const updated = await this.prisma.familyRelationChange.update({
      where: { id },
      data: {
        status: RelationChangeStatus.approved,
        approved_by: adminUserId,
        reviewed_at: new Date(),
      },
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

    const updated = await this.prisma.familyRelationChange.update({
      where: { id },
      data: {
        status: RelationChangeStatus.rejected,
        approved_by: adminUserId,
        reviewed_at: new Date(),
        reject_reason: reason,
      },
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

    const updated = await this.prisma.familyRelationChange.update({
      where: { id },
      data: {
        status: RelationChangeStatus.needs_manual,
        needs_manual: true,
        approved_by: adminUserId,
        reviewed_at: new Date(),
      },
    });

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
    return this.prisma.familyRelationChange.findMany({
      where: { clan_id: clanIdBig, is_disputed: true },
      orderBy: { created_at: 'desc' },
      include: {
        person: { select: { full_name: true } },
      },
    });
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

    // 更新冲突的抚养记录
    await this.prisma.childCustodyRecord.updateMany({
      where: {
        child_id: change.target_person_id!,
        dispute_flag: true,
      },
      data: {
        dispute_flag: false,
        custody_status: custodyStatus as any,
      },
    });

    const updated = await this.prisma.familyRelationChange.update({
      where: { id },
      data: {
        is_disputed: false,
        status: RelationChangeStatus.approved,
        approved_by: adminUserId,
        reviewed_at: new Date(),
      },
    });

    await this.adminService.logAction({
      clanId: change.person.clan_id,
      userId: adminUserId,
      action: 'RELATION_DISPUTE_RESOLVE',
      targetType: 'FamilyRelationChange',
      targetId: changeId,
      details: JSON.stringify({ custody_status: custodyStatus }),
    });

    await this.notificationService.notify({
      userId: change.operator_user_id,
      clanId: change.person.clan_id,
      type: 'SYSTEM' as any,
      title: '子女归属争议已解决',
      content: `您在 ${change.person.clan_id} 的子女归属争议已被管理员解决。`,
      targetType: 'FamilyRelationChange',
      targetId: changeId,
    });

    return { id: changeId, status: 'resolved', custody_status: custodyStatus };
  }
}
