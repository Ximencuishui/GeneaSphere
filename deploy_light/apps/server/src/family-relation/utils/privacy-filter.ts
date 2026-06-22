import { Injectable } from '@nestjs/common';
import { PrismaService } from '@geneasphere/db';

export interface ViewerContext {
  userId: string;
  isSelf: boolean;
  isAdmin: boolean;
}

/**
 * 隐私过滤工具
 * 按需求文档 3.3.1 节表格规则过滤敏感字段
 */
@Injectable()
export class PrivacyFilter {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 过滤婚姻历史记录
   * - self 级别：仅本人可见
   * - admin 级别：本人 + 家族管理员可见
   * - clan 级别：全族可见
   */
  filterMarriageHistory<T extends { privacy_level: string }>(
    records: T[],
    viewer: ViewerContext,
  ): T[] {
    return records.filter((r) => {
      if (r.privacy_level === 'clan') return true;
      if (r.privacy_level === 'admin') return viewer.isSelf || viewer.isAdmin;
      if (r.privacy_level === 'self') return viewer.isSelf;
      return false;
    });
  }

  /**
   * 过滤子女抚养记录
   */
  filterCustodyRecords<T extends { privacy_level?: string; is_biological?: boolean }>(
    records: T[],
    viewer: ViewerContext,
    pref?: { shareCustodyDetails: boolean },
  ): T[] {
    return records.map((r) => {
      // 非本人且非管理员时，移除 is_biological 和抚养细节
      if (!viewer.isSelf && !viewer.isAdmin) {
        if (!pref?.shareCustodyDetails) {
          const { is_biological, ...rest } = r as any;
          return rest as T;
        }
      }
      return r;
    });
  }

  /**
   * 过滤 FamilyRelationChange 记录的敏感字段
   */
  filterRelationChange<T extends { privacy_level: string; previous_state?: any; current_state?: any }>(
    records: T[],
    viewer: ViewerContext,
  ): T[] {
    const visible = records.filter((r) => {
      if (r.privacy_level === 'clan') return true;
      if (r.privacy_level === 'admin') return viewer.isSelf || viewer.isAdmin;
      if (r.privacy_level === 'self') return viewer.isSelf;
      return false;
    });

    return visible.map((r) => {
      if (!viewer.isSelf && !viewer.isAdmin) {
        // 对其他族人隐藏 previous_state 详情，仅保留摘要
        return {
          ...r,
          previous_state: undefined,
          current_state: this.sanitizeState(r.current_state),
        };
      }
      return r;
    }) as T[];
  }

  /**
   * 清洗 current_state，移除敏感内部字段
   */
  private sanitizeState(state: any): any {
    if (!state) return state;
    const sensitiveFields = ['is_biological', 'end_reason', 'change_reason'];
    const sanitized = { ...state };
    for (const field of sensitiveFields) {
      delete sanitized[field];
    }
    return sanitized;
  }

  /**
   * 构建查看者上下文
   */
  async buildViewerContext(
    viewerUserId: string,
    targetPersonId: bigint,
    clanId: bigint,
    adminService: { requireAdmin: (clanId: bigint, userId: string) => Promise<void> },
  ): Promise<ViewerContext> {
    const isSelf = await this.isOwnPerson(viewerUserId, targetPersonId);
    let isAdmin = false;
    try {
      await adminService.requireAdmin(clanId, viewerUserId);
      isAdmin = true;
    } catch {
      isAdmin = false;
    }
    return { userId: viewerUserId, isSelf, isAdmin };
  }

  private async isOwnPerson(userId: string, personId: bigint): Promise<boolean> {
    const link = await this.prisma.personUserLink.findFirst({
      where: { user_id: userId, person_id: personId, relation_role: 'self' },
    });
    return !!link;
  }
}
