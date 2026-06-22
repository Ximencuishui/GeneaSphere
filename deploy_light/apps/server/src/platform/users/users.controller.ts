import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '@geneasphere/db';
import { UserPlatformBanStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PlatformAuthGuard } from '../auth/platform-auth.guard';
import { PlatformOperationLogService } from '../common/platform-operation-log.service';
import { getClientIp } from '../common/ip.util';

function maskPhone(phone: string): string {
  if (!phone) return '';
  return phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2');
}

function genTempPassword(): string {
  // 8 位随机密码：字母+数字
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let pwd = '';
  for (let i = 0; i < 8; i++) {
    pwd += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pwd;
}

@ApiTags('platform/users')
@ApiBearerAuth('platform')
@UseGuards(PlatformAuthGuard)
@Controller('api/platform/users')
export class UsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logService: PlatformOperationLogService,
  ) {}

  @Get()
  @ApiOperation({ summary: '全平台用户列表' })
  async list(
    @Query('keyword') keyword?: string,
    @Query('familyId') familyIdStr?: string,
    @Query('status') status?: string,
    @Query('page') pageStr = '1',
    @Query('pageSize') pageSizeStr = '20',
  ) {
    const page = parseInt(pageStr) || 1;
    const pageSize = parseInt(pageSizeStr) || 20;
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (keyword) {
      where.phone = { contains: keyword };
    }
    if (status) {
      where.ban_status = status;
    }

    let userIdsFilter: string[] | undefined;
    if (familyIdStr) {
      const fid = BigInt(familyIdStr);
      const members = await this.prisma.clanMember.findMany({
        where: { clan_id: fid },
        select: { user_id: true },
      });
      userIdsFilter = members.map((m) => m.user_id);
      where.id = { in: userIdsFilter };
    }

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    // 关联查询每个用户所属家族
    const userIds = items.map((u) => u.id);
    const memberships = await this.prisma.clanMember.findMany({
      where: { user_id: { in: userIds } },
      include: { clan: { select: { id: true, name: true } } },
    });
    const familyMap = new Map<string, { id: string; name: string }[]>();
    memberships.forEach((m) => {
      const arr = familyMap.get(m.user_id) || [];
      arr.push({ id: m.clan.id.toString(), name: m.clan.name });
      familyMap.set(m.user_id, arr);
    });

    return {
      data: items.map((u) => ({
        id: u.id,
        phone_masked: maskPhone(u.phone),
        ban_status: u.ban_status,
        ban_until: u.ban_until,
        last_login_at: null,
        last_login_ip: u.last_login_ip,
        last_login_device: u.last_login_device,
        families: familyMap.get(u.id) || [],
        created_at: u.created_at,
      })),
      pagination: {
        page,
        page_size: pageSize,
        total,
        total_pages: Math.ceil(total / pageSize),
      },
    };
  }

  @Get(':id')
  @ApiOperation({ summary: '用户详情' })
  async detail(@Param('id') id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('用户不存在');

    const memberships = await this.prisma.clanMember.findMany({
      where: { user_id: id },
      include: { clan: { select: { id: true, name: true } } },
    });
    const recentLogs = await this.prisma.auditLog.findMany({
      where: { user_id: id },
      orderBy: { created_at: 'desc' },
      take: 10,
    });

    return {
      id: user.id,
      phone: user.phone,
      phone_masked: maskPhone(user.phone),
      ban_status: user.ban_status,
      ban_until: user.ban_until,
      last_login_ip: user.last_login_ip,
      last_login_device: user.last_login_device,
      created_at: user.created_at,
      families: memberships.map((m) => ({
        id: m.clan.id.toString(),
        name: m.clan.name,
        role: m.role,
        joined_at: m.joined_at,
      })),
      recent_logs: recentLogs.map((l) => ({
        id: l.id.toString(),
        action: l.action,
        target_type: l.target_type,
        target_id: l.target_id,
        details: l.details,
        created_at: l.created_at,
      })),
    };
  }

  @Post(':id/ban')
  @ApiOperation({ summary: '封禁用户' })
  async ban(
    @Param('id') id: string,
    @Body() body: { duration: 'PERMANENT' | '7D' | '30D'; reason?: string },
    @Request() req: any,
  ) {
    const map: Record<string, { status: UserPlatformBanStatus; until: Date | null }> = {
      PERMANENT: { status: 'BANNED_PERMANENT' as any, until: null },
      '7D': { status: 'BANNED_7D' as any, until: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
      '30D': { status: 'BANNED_30D' as any, until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
    };
    const cfg = map[body.duration];
    if (!cfg) throw new BadRequestException('封禁时长无效');
    const updated = await this.prisma.user.update({
      where: { id },
      data: { ban_status: cfg.status, ban_until: cfg.until },
    });
    await this.logService.log({
      adminId: req.user.adminId,
      actionType: 'BAN_USER',
      targetType: 'User',
      targetId: id,
      detail: { duration: body.duration, reason: body.reason || '' },
      ipAddress: getClientIp(req),
    });
    return { message: '已封禁', ban_status: updated.ban_status, ban_until: updated.ban_until };
  }

  @Post(':id/unban')
  @ApiOperation({ summary: '解封用户' })
  async unban(@Param('id') id: string, @Request() req: any) {
    const updated = await this.prisma.user.update({
      where: { id },
      data: { ban_status: 'NORMAL' as any, ban_until: null },
    });
    await this.logService.log({
      adminId: req.user.adminId,
      actionType: 'UNBAN_USER',
      targetType: 'User',
      targetId: id,
      ipAddress: getClientIp(req),
    });
    return { message: '已解封', ban_status: updated.ban_status };
  }

  @Post(':id/reset-password')
  @ApiOperation({ summary: '重置用户密码' })
  async resetPassword(@Param('id') id: string, @Request() req: any) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('用户不存在');
    const tempPassword = genTempPassword();
    const hash = await bcrypt.hash(tempPassword, 10);
    await this.prisma.user.update({
      where: { id },
      data: { password_hash: hash },
    });
    await this.logService.log({
      adminId: req.user.adminId,
      actionType: 'RESET_USER_PASSWORD',
      targetType: 'User',
      targetId: id,
      ipAddress: getClientIp(req),
    });
    return { message: '密码已重置（请向用户传达）', temp_password: tempPassword };
  }

  @Delete(':id')
  @ApiOperation({ summary: '注销用户（标记封禁）' })
  async remove(@Param('id') id: string, @Request() req: any) {
    const updated = await this.prisma.user.update({
      where: { id },
      data: { ban_status: 'BANNED_PERMANENT' as any, ban_until: null },
    });
    await this.logService.log({
      adminId: req.user.adminId,
      actionType: 'DELETE_USER',
      targetType: 'User',
      targetId: id,
      ipAddress: getClientIp(req),
    });
    return { message: '账号已注销', ban_status: updated.ban_status };
  }
}
