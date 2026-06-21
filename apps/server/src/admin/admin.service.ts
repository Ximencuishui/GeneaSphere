import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@geneasphere/db';
import { Role, ReviewStatus, ApplicationStatus } from '@prisma/client';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

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
   * 检查用户是否是 Owner
   */
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
        ip_address: params.ipAddress,
      },
    });
  }
}
