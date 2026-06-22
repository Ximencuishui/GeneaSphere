import { Injectable } from '@nestjs/common';
import { PrismaService } from '@geneasphere/db';
import { NotificationType } from '@prisma/client';

@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 发送通知给指定用户
   */
  async notify(params: {
    userId: string;
    clanId?: bigint;
    type: NotificationType;
    title: string;
    content: string;
    targetType?: string;
    targetId?: string;
  }): Promise<void> {
    await this.prisma.notification.create({
      data: {
        user_id: params.userId,
        clan_id: params.clanId,
        type: params.type,
        title: params.title,
        content: params.content,
        target_type: params.targetType,
        target_id: params.targetId,
      },
    });
  }

  /**
   * 影像审核结果通知
   */
  async notifyMediaReview(params: {
    uploaderId: string;
    clanId: bigint;
    mediaId: string;
    approved: boolean;
    reason?: string;
  }): Promise<void> {
    if (params.approved) {
      await this.notify({
        userId: params.uploaderId,
        clanId: params.clanId,
        type: NotificationType.MEDIA_APPROVED,
        title: '照片已通过审核',
        content: '您上传的照片已通过审核，现已在相册中展示。',
        targetType: 'MediaArchive',
        targetId: params.mediaId,
      });
    } else {
      await this.notify({
        userId: params.uploaderId,
        clanId: params.clanId,
        type: NotificationType.MEDIA_REJECTED,
        title: '照片被驳回',
        content: `您上传的照片未通过审核。驳回理由：${params.reason || '无'}`,
        targetType: 'MediaArchive',
        targetId: params.mediaId,
      });
    }
  }

  /**
   * 生平审核结果通知
   */
  async notifyBioReview(params: {
    authorId: string;
    clanId: bigint;
    personId: string;
    title: string;
    approved: boolean;
    reason?: string;
  }): Promise<void> {
    if (params.approved) {
      await this.notify({
        userId: params.authorId,
        clanId: params.clanId,
        type: NotificationType.BIO_APPROVED,
        title: '生平已通过审核',
        content: `您提交的生平「${params.title}」已通过审核。`,
        targetType: 'Person',
        targetId: params.personId,
      });
    } else {
      await this.notify({
        userId: params.authorId,
        clanId: params.clanId,
        type: NotificationType.BIO_REJECTED,
        title: '生平被驳回',
        content: `您提交的生平「${params.title}」未通过审核。驳回理由：${params.reason || '无'}`,
        targetType: 'Person',
        targetId: params.personId,
      });
    }
  }

  /**
   * 归宗申请结果通知
   */
  async notifyMergeResult(params: {
    applicantId: string;
    clanId: bigint;
    applicationId: string;
    approved: boolean;
    reason?: string;
  }): Promise<void> {
    if (params.approved) {
      await this.notify({
        userId: params.applicantId,
        clanId: params.clanId,
        type: NotificationType.MERGE_APPROVED,
        title: '认亲申请已通过',
        content: '您的认亲申请已通过审核，欢迎加入本家族！',
        targetType: 'MergeApplication',
        targetId: params.applicationId,
      });
    } else {
      await this.notify({
        userId: params.applicantId,
        clanId: params.clanId,
        type: NotificationType.MERGE_REJECTED,
        title: '认亲申请未通过',
        content: `您的认亲申请未通过审核。理由：${params.reason || '无'}`,
        targetType: 'MergeApplication',
        targetId: params.applicationId,
      });
    }
  }

  /**
   * 角色变更通知
   */
  async notifyRoleChange(params: {
    userId: string;
    clanId: bigint;
    newRole: string;
  }): Promise<void> {
    await this.notify({
      userId: params.userId,
      clanId: params.clanId,
      type: NotificationType.ROLE_CHANGED,
      title: '角色已变更',
      content: `您在家族中的角色已变更为：${params.newRole}`,
    });
  }

  /**
   * 归宗合并初审通过通知（进入待合并状态）
   */
  async notifyMergeApproved(params: {
    applicantId: string;
    clanId: bigint;
    applicationId: string;
  }): Promise<void> {
    await this.notify({
      userId: params.applicantId,
      clanId: params.clanId,
      type: NotificationType.MERGE_APPROVED,
      title: '认亲申请初审通过',
      content: '您的认亲申请已通过初审，请等待执行归宗合并操作。',
      targetType: 'MergeApplication',
      targetId: params.applicationId,
    });
  }

  /**
   * 归宗合并完成通知
   */
  async notifyMergeComplete(params: {
    applicantId: string;
    clanId: bigint;
    applicationId: string;
    anchorPersonId: string;
  }): Promise<void> {
    await this.notify({
      userId: params.applicantId,
      clanId: params.clanId,
      type: NotificationType.MERGE_COMPLETED,
      title: '归宗合并已完成',
      content: '恭喜！您的支系已成功并入主家族。',
      targetType: 'MergeApplication',
      targetId: params.applicationId,
    });
  }

  /**
   * 归宗合并回滚通知
   */
  async notifyMergeRollback(params: {
    applicantId: string;
    clanId: bigint;
    applicationId: string;
  }): Promise<void> {
    await this.notify({
      userId: params.applicantId,
      clanId: params.clanId,
      type: NotificationType.MERGE_ROLLBACK,
      title: '归宗合并已回滚',
      content: '归宗合并操作已被回滚，您的支系已恢复独立状态。',
      targetType: 'MergeApplication',
      targetId: params.applicationId,
    });
  }

  /**
   * 获取用户的通知列表
   */
  async getNotifications(
    userId: string,
    options: { isRead?: boolean; page?: number; pageSize?: number } = {},
  ) {
    const page = options.page || 1;
    const pageSize = options.pageSize || 20;
    const skip = (page - 1) * pageSize;

    const where: any = { user_id: userId };
    if (options.isRead !== undefined) {
      where.is_read = options.isRead;
    }

    const [data, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({
        where: { user_id: userId, is_read: false },
      }),
    ]);

    return {
      data: data.map((n) => ({
        id: n.id.toString(),
        type: n.type,
        title: n.title,
        content: n.content,
        target_type: n.target_type,
        target_id: n.target_id,
        is_read: n.is_read,
        created_at: n.created_at,
      })),
      pagination: {
        page,
        page_size: pageSize,
        total,
        total_pages: Math.ceil(total / pageSize),
      },
      unread_count: unreadCount,
    };
  }

  /**
   * 标记通知为已读
   */
  async markAsRead(userId: string, notificationIds?: string[]): Promise<void> {
    const where: any = { user_id: userId };
    if (notificationIds && notificationIds.length > 0) {
      where.id = { in: notificationIds.map((id) => BigInt(id)) };
    } else {
      where.is_read = false;
    }

    await this.prisma.notification.updateMany({
      where,
      data: {
        is_read: true,
        read_at: new Date(),
      },
    });
  }
}