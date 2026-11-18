import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@geneasphere/db';
import { Role, ReviewStatus, ApplicationStatus } from '@prisma/client';
import { ClanResolverService } from '../common/clan-resolver.service';
import { currentClientIp } from '../common/client-ip';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clanResolver: ClanResolverService,
  ) {}

  /**
   * 多家族 SaaS：根据 URL 上的 slug 解析到 clanId，并校验当前用户是该家族的 OWNER/ADMIN。
   * 所有 /api/admin/* controller 入口统一调用此方法替代原来的 BigInt(query.clanId) + requireAdmin。
   */
  async requireAdminBySlug(clanSlug: string, userId: string): Promise<bigint> {
    const clan = await this.clanResolver.resolveOrThrow(clanSlug);
    await this.requireAdmin(clan.id, userId);
    return clan.id;
  }

  /**
   * 多家族 SaaS：slug → clanId 并校验 OWNER。
   */
  async requireOwnerBySlug(clanSlug: string, userId: string): Promise<bigint> {
    const clan = await this.clanResolver.resolveOrThrow(clanSlug);
    await this.requireOwner(clan.id, userId);
    return clan.id;
  }

  /**
   * 检查用户是否有管理员权限
   */
  async requireAdmin(clanId: bigint, userId: string): Promise<void> {
    const clan = await this.prisma.clan.findUnique({
      where: { id: clanId },
      select: { admin_user_id: true },
    });

    if (!clan) {
      throw new NotFoundException(`Clan with ID ${clanId} not found`);
    }

    if (clan.admin_user_id !== userId) {
      // 检查是否是分配的管理员
      const member = await this.prisma.clanMember.findUnique({
        where: {
          clan_id_user_id: {
            clan_id: clanId,
            user_id: userId,
          },
        },
      });

      if (!member || (member.role !== Role.OWNER && member.role !== Role.ADMIN)) {
        throw new ForbiddenException('Admin access required');
      }
    }
  }

  /**
   * 影像库入口：族长、管理员、编辑者、观察员都能进入。
   * 写操作再由调用方按角色收紧。
   */
  async resolveMediaActor(clanSlug: string, userId: string): Promise<{ clanId: bigint; role: Role }> {
    const clan = await this.clanResolver.resolveOrThrow(clanSlug);
    const record = await this.prisma.clan.findUnique({
      where: { id: clan.id },
      select: { admin_user_id: true },
    });
    if (!record) {
      throw new NotFoundException(`Clan with ID ${clan.id} not found`);
    }
    if (record.admin_user_id === userId) {
      return { clanId: clan.id, role: Role.OWNER };
    }
    const member = await this.prisma.clanMember.findUnique({
      where: { clan_id_user_id: { clan_id: clan.id, user_id: userId } },
    });
    if (
      !member
      || (member.role !== Role.OWNER
        && member.role !== Role.ADMIN
        && member.role !== Role.EDITOR
        && member.role !== Role.VIEWER)
    ) {
      throw new ForbiddenException('不是该家族成员');
    }
    return { clanId: clan.id, role: member.role };
  }

  async requireOwner(clanId: bigint, userId: string): Promise<void> {
    const clan = await this.prisma.clan.findUnique({
      where: { id: clanId },
      select: { admin_user_id: true },
    });

    if (!clan) {
      throw new NotFoundException(`Clan with ID ${clanId} not found`);
    }

    if (clan.admin_user_id !== userId) {
      const member = await this.prisma.clanMember.findUnique({
        where: {
          clan_id_user_id: {
            clan_id: clanId,
            user_id: userId,
          },
        },
      });

      if (!member || member.role !== Role.OWNER) {
        throw new ForbiddenException('Owner access required');
      }
    }
  }

  /**
   * 记录审计日志
   */
  async logAction(params: {
    clanId?: bigint;
    userId: string;
    action: string;
    targetType?: string;
    targetId?: string;
    details?: string;
    ipAddress?: string;
  }): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        clan_id: params.clanId,
        user_id: params.userId,
        action: params.action,
        target_type: params.targetType,
        target_id: params.targetId,
        details: params.details,
        ip_address: params.ipAddress ?? currentClientIp(),
      },
    });
  }
}
