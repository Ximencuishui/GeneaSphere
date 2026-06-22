import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '@geneasphere/db';
import { PlatformAdminStatus, PlatformRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PlatformLoginDto } from './dto/login.dto';
import { getClientIp } from '../common/ip.util';
import { PlatformOperationLogService } from '../common/platform-operation-log.service';

@Injectable()
export class PlatformAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly logService: PlatformOperationLogService,
  ) {}

  async login(dto: PlatformLoginDto, req?: any) {
    const ipAddress = req ? getClientIp(req) : null;

    const admin = await this.prisma.platformAdmin.findUnique({
      where: { username: dto.username },
    });

    if (!admin || admin.status !== PlatformAdminStatus.active) {
      // 记录失败日志（需要先找到 adminId，如果 admin 不存在则使用 0 或跳过）
      if (admin) {
        await this.logService.log({
          adminId: admin.id.toString(),
          actionType: 'LOGIN_FAILED',
          targetType: 'PlatformAdmin',
          targetId: admin.id.toString(),
          detail: { reason: 'inactive_or_not_found', username: dto.username },
          ipAddress,
          status: 'failed',
        });
      }
      throw new UnauthorizedException('用户名或密码错误');
    }

    const isValid = await bcrypt.compare(dto.password, admin.password_hash);
    if (!isValid) {
      await this.logService.log({
        adminId: admin.id.toString(),
        actionType: 'LOGIN_FAILED',
        targetType: 'PlatformAdmin',
        targetId: admin.id.toString(),
        detail: { reason: 'wrong_password', username: dto.username },
        ipAddress,
        status: 'failed',
      });
      throw new UnauthorizedException('用户名或密码错误');
    }

    // 更新最后登录信息
    await this.prisma.platformAdmin.update({
      where: { id: admin.id },
      data: { last_login_at: new Date(), last_login_ip: ipAddress || undefined },
    });

    // 签发 JWT
    const payload = {
      sub: admin.id.toString(),
      username: admin.username,
      role: admin.role,
    };
    const token = this.jwtService.sign(payload);

    await this.logService.log({
      adminId: admin.id.toString(),
      actionType: 'LOGIN',
      targetType: 'PlatformAdmin',
      targetId: admin.id.toString(),
      ipAddress,
      status: 'success',
    });

    return {
      access_token: token,
      admin: {
        id: admin.id.toString(),
        username: admin.username,
        real_name: admin.real_name,
        role: admin.role,
        phone: admin.phone,
        status: admin.status,
        last_login_at: admin.last_login_at,
      },
    };
  }

  async getProfile(adminId: string) {
    const admin = await this.prisma.platformAdmin.findUnique({
      where: { id: BigInt(adminId) },
    });
    if (!admin) {
      throw new UnauthorizedException('平台管理员不存在');
    }
    return {
      id: admin.id.toString(),
      username: admin.username,
      real_name: admin.real_name,
      role: admin.role,
      phone: admin.phone,
      status: admin.status,
      last_login_at: admin.last_login_at,
      last_login_ip: admin.last_login_ip,
      created_at: admin.created_at,
    };
  }

  async logout(adminId: string, req?: any) {
    await this.logService.log({
      adminId,
      actionType: 'LOGOUT',
      targetType: 'PlatformAdmin',
      targetId: adminId,
      ipAddress: req ? getClientIp(req) : null,
    });
    return { message: '退出成功' };
  }

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }
}
