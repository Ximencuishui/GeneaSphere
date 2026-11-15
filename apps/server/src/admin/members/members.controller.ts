import { Controller, Get, Patch, Delete, Body, Param, Query, UseGuards, Request, NotFoundException, BadRequestException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminService } from '../admin.service';
import { PrismaService } from '@geneasphere/db';
import { Role } from '@prisma/client';

const MEMBER_ROLES: Role[] = [Role.OWNER, Role.ADMIN, Role.EDITOR, Role.VIEWER];

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
   * ClanMember 没有世代字段，不接受 generation 过滤。
   */
  @Get()
  @ApiOperation({ summary: 'Get member list with pagination and filters' })
  async getMembers(
    @Request() req,
    @Query('clanSlug') clanSlug: string,
    @Query('page') pageStr = '1',
    @Query('pageSize') pageSizeStr = '20',
    @Query('role') role?: string,
    @Query('keyword') keyword?: string,
  ) {
    const userId = req.user.userId;
    const clanId = await this.adminService.requireAdminBySlug(clanSlug, userId);

    const page = parseInt(pageStr) || 1;
    const pageSize = parseInt(pageSizeStr) || 20;
    const skip = (page - 1) * pageSize;

    const where: any = { clan_id: clanId };
    if (role && MEMBER_ROLES.includes(role as Role)) {
      where.role = role as Role;
    }
    const kw = keyword?.trim();
    if (kw) {
      where.OR = [
        { user: { phone: { contains: kw } } },
        { user: { nickname: { contains: kw } } },
        {
          user: {
            person_links: {
              some: {
                person: { clan_id: clanId, full_name: { contains: kw } },
              },
            },
          },
        },
      ];
    }

    const [members, total] = await Promise.all([
      this.prisma.clanMember.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              phone: true,
              nickname: true,
              person_links: {
                where: { relation_role: 'self', person: { clan_id: clanId } },
                select: { person: { select: { full_name: true } } },
                take: 1,
              },
            },
          },
        },
        orderBy: { joined_at: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.clanMember.count({ where }),
    ]);

    return {
      data: members.map((m) => ({
        id: m.id.toString(),
        user_id: m.user_id,
        phone: m.user.phone,
        nickname: m.user.nickname,
        full_name: m.user.person_links[0]?.person.full_name ?? null,
        role: m.role,
        joined_at: m.joined_at,
      })),
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
    @Body() body: { role: string },
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

    if (member.role === Role.OWNER) {
      throw new BadRequestException('不能直接修改家族主人的角色，请先转让所有权');
    }

    if (!MEMBER_ROLES.includes(body.role as Role) || body.role === Role.OWNER) {
      throw new BadRequestException('无效的角色');
    }

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
   * 转让 Owner 权限。仅当前家族主人可操作。
   */
  @Patch('transfer-ownership')
  @ApiOperation({ summary: 'Transfer clan ownership to another member' })
  async transferOwnership(
    @Request() req,
    @Body() body: { targetUserId: string; clanSlug: string },
  ) {
    const userId = req.user.userId;
    const clanId = await this.adminService.requireOwnerBySlug(body.clanSlug, userId);

    if (!body.targetUserId || body.targetUserId === userId) {
      throw new BadRequestException('请指定本家族的其他成员');
    }

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

    await this.prisma.$transaction([
      this.prisma.clanMember.update({
        where: {
          clan_id_user_id: {
            clan_id: clanId,
            user_id: body.targetUserId,
          },
        },
        data: { role: Role.OWNER },
      }),
      this.prisma.clanMember.update({
        where: {
          clan_id_user_id: {
            clan_id: clanId,
            user_id: userId,
          },
        },
        data: { role: Role.ADMIN },
      }),
      this.prisma.clan.update({
        where: { id: clanId },
        data: { admin_user_id: body.targetUserId },
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
   * 与族谱人物的关联只认 PersonUserLink，不根据手机号猜测姓名。
   * 命中关联且该人物仍有子女时拒绝移除，不改动血缘数据。
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

    if (member.user_id === userId) {
      throw new BadRequestException('不能移除自己，请联系其他管理员处理');
    }

    if (member.role === Role.OWNER) {
      throw new BadRequestException('不能移除家族主人，请先转让所有权');
    }

    if (member.role === Role.ADMIN) {
      const adminCount = await this.prisma.clanMember.count({
        where: {
          clan_id: member.clan_id,
          role: { in: [Role.OWNER, Role.ADMIN] },
        },
      });
      if (adminCount <= 1) {
        throw new BadRequestException(
          'Cannot remove the last admin/owner. 请先提升其他成员为管理员后再移除当前成员',
        );
      }
    }

    const links = await this.prisma.personUserLink.findMany({
      where: {
        user_id: member.user_id,
        person: { clan_id: member.clan_id },
      },
      select: { person_id: true },
    });
    if (links.length > 0) {
      const personIds = links.map((link) => link.person_id);
      const families = await this.prisma.familyUnit.findMany({
        where: {
          clan_id: member.clan_id,
          children: { some: {} },
          OR: [{ husband_id: { in: personIds } }, { wife_id: { in: personIds } }],
        },
        select: { id: true },
      });
      if (families.length > 0) {
        throw new BadRequestException(
          '该成员已通过人物关联挂到仍有子女的族谱人物，请先调整家庭关系后再移除。本次不会改动族谱血缘。',
        );
      }
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
      details: `Removed member user=${member.user_id}`,
    });

    return { message: 'Member removed successfully' };
  }
}
