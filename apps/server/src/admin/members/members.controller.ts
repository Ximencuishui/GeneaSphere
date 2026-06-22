import { Controller, Get, Patch, Delete, Body, Param, Query, UseGuards, Request, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminService } from '../admin.service';
import { PrismaService } from '@geneasphere/db';
import { Role } from '@prisma/client';

@ApiTags('admin/members')
@Controller('api/admin/members')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MembersController {
  constructor(
    private readonly adminService: AdminService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * 获取成员列表（分页+筛选）
   */
  @Get()
  @ApiOperation({ summary: 'Get member list with pagination and filters' })
  async getMembers(
    @Request() req,
    @Query('clanId') clanIdStr: string,
    @Query('page') pageStr = '1',
    @Query('pageSize') pageSizeStr = '20',
    @Query('role') role?: string,
    @Query('generation') generationStr?: string,
    @Query('keyword') keyword?: string,
  ) {
    const userId = req.user.userId;
    const clanId = BigInt(clanIdStr);

    await this.adminService.requireAdmin(clanId, userId);

    const page = parseInt(pageStr) || 1;
    const pageSize = parseInt(pageSizeStr) || 20;
    const skip = (page - 1) * pageSize;

    // 构建查询条件
    const where: any = { clan_id: clanId };

    if (role) {
      const memberRoles = await this.prisma.clanMember.findMany({
        where: { clan_id: clanId, role: role as Role },
        select: { user_id: true },
      });
      // 还需要包含 Owner (clan.admin_user_id)
      const clan = await this.prisma.clan.findUnique({
        where: { id: clanId },
        select: { admin_user_id: true },
      });
    }

    // 获取成员列表（通过 clanMember 表）
    const [members, total] = await Promise.all([
      this.prisma.clanMember.findMany({
        where: { clan_id: clanId },
        include: {
          user: { select: { id: true, phone: true } },
        },
        orderBy: { joined_at: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.clanMember.count({
        where: { clan_id: clanId },
      }),
    ]);

    // 获取每个成员的人员信息
    const memberDetails = await Promise.all(
      members.map(async (m) => {
        const person = await this.prisma.person.findFirst({
          where: { clan_id: clanId },
          // 假设可以通过 user_id 关联（需要扩展 schema）
        });

        return {
          id: m.id.toString(),
          user_id: m.user_id,
          phone: m.user.phone,
          role: m.role,
          joined_at: m.joined_at,
        };
      })
    );

    return {
      data: memberDetails,
      pagination: {
        page,
        page_size: pageSize,
        total,
        total_pages: Math.ceil(total / pageSize),
      },
    };
  }

  /**
   * 修改成员角色
   */
  @Patch(':id/role')
  @ApiOperation({ summary: 'Update member role' })
  async updateRole(
    @Request() req,
    @Param('id') memberIdStr: string,
    @Body() body: { role: string; password?: string },
  ) {
    const userId = req.user.userId;
    const memberId = BigInt(memberIdStr);

    const member = await this.prisma.clanMember.findUnique({
      where: { id: memberId },
    });

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    await this.adminService.requireOwner(member.clan_id, userId);

    // 检查是否是最后一个 Admin
    if (body.role !== 'ADMIN' && member.role === 'ADMIN') {
      const adminCount = await this.prisma.clanMember.count({
        where: { clan_id: member.clan_id, role: 'ADMIN' },
      });
      if (adminCount <= 1) {
        throw new BadRequestException('Cannot remove the last admin');
      }
    }

    const updated = await this.prisma.clanMember.update({
      where: { id: memberId },
      data: { role: body.role as Role },
    });

    await this.adminService.logAction({
      clanId: member.clan_id,
      userId,
      action: 'UPDATE_MEMBER_ROLE',
      targetType: 'ClanMember',
      targetId: memberIdStr,
      details: `Changed role to ${body.role}`,
    });

    return { message: 'Role updated successfully', role: updated.role };
  }

  /**
   * 转让 Owner 权限
   */
  @Patch('transfer-ownership')
  @ApiOperation({ summary: 'Transfer clan ownership to another member' })
  async transferOwnership(
    @Request() req,
    @Body() body: { targetUserId: string; clanId: string },
  ) {
    const userId = req.user.userId;
    const clanId = BigInt(body.clanId);

    // 仅当前 Owner 可转让
    await this.adminService.requireOwner(clanId, userId);

    // 检查目标用户是否已是该家族的成员
    const targetMember = await this.prisma.clanMember.findUnique({
      where: {
        clan_id_user_id: {
          clan_id: clanId,
          user_id: body.targetUserId,
        },
      },
    });

    if (!targetMember) {
      throw new NotFoundException('Target user is not a member of this clan');
    }

    // 执行转让：新 Owner 设为 OWNER，原 Owner 降为 ADMIN
    await this.prisma.$transaction([
      // 新 Owner
      this.prisma.clanMember.update({
        where: {
          clan_id_user_id: {
            clan_id: clanId,
            user_id: body.targetUserId,
          },
        },
        data: { role: Role.OWNER },
      }),
      // 原 Owner 降为 ADMIN
      this.prisma.clanMember.update({
        where: {
          clan_id_user_id: {
            clan_id: clanId,
            user_id: userId,
          },
        },
        data: { role: Role.ADMIN },
      }),
    ]);

    await this.adminService.logAction({
      clanId,
      userId,
      action: 'TRANSFER_OWNERSHIP',
      targetType: 'Clan',
      targetId: clanId.toString(),
      details: `Ownership transferred from ${userId} to ${body.targetUserId}`,
    });

    return { message: 'Ownership transferred successfully' };
  }

  /**
   * 移除成员（从家族中删除）
   */
  @Delete(':id')
  @ApiOperation({ summary: 'Remove member from clan' })
  async removeMember(
    @Request() req,
    @Param('id') memberIdStr: string,
  ) {
    const userId = req.user.userId;
    const memberId = BigInt(memberIdStr);

    const member = await this.prisma.clanMember.findUnique({
      where: { id: memberId },
      include: {
        user: { select: { id: true, phone: true } },
      },
    });

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    await this.adminService.requireAdmin(member.clan_id, userId);

    // 检查该成员是否关联到本家族中拥有子女的人员记录。
    // 由于 schema 中 person 未直接关联 user_id，采用通过 phone 后缀匹配姓名等
    // 作为辅助查找途径。如未来 schema 补充 user_id 字段，可直接使用精确查询。
    const userPhone = member.user.phone;

    // 在 FamilyUnit 中查找作为丈夫/妻子且有子女的人员名与该成员手机号后 4 位匹配的记录
    const familiesWithChildren = await this.prisma.familyUnit.findMany({
      where: {
        clan_id: member.clan_id,
        children: { some: {} },
      },
      include: {
        husband: { select: { id: true, full_name: true } },
        wife: { select: { id: true, full_name: true } },
        children: { select: { child_id: true } },
      },
    });

    const blockingRelations: { personId: string; personName: string; childCount: number }[] = [];
    for (const family of familiesWithChildren) {
      const candidates = [family.husband, family.wife].filter(Boolean) as Array<{
        id: bigint;
        full_name: string;
      }>;
      for (const person of candidates) {
        // 简化关联：会员手机号末 4 位出现于姓名中，或名称与账号匹配
        if (
          person.full_name.includes(userPhone.slice(-4)) ||
          userPhone.includes(person.full_name)
        ) {
          blockingRelations.push({
            personId: person.id.toString(),
            personName: person.full_name,
            childCount: family.children.length,
          });
        }
      }
    }

    if (blockingRelations.length > 0) {
      throw new BadRequestException(
        `该成员关联到本家族中拥有子女的人员记录，无法直接移除。请先转移子女关系。关联人员：${blockingRelations
          .map((r) => `${r.personName}（${r.childCount} 名子女）`)
          .join('、')}`,
      );
    }

    await this.prisma.clanMember.delete({
      where: { id: memberId },
    });

    await this.adminService.logAction({
      clanId: member.clan_id,
      userId,
      action: 'REMOVE_MEMBER',
      targetType: 'ClanMember',
      targetId: memberIdStr,
      details: `Removed member phone=${userPhone}`,
    });

    return { message: 'Member removed successfully' };
  }
}
