import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '@geneasphere/db';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { RegisterDto, LoginDto } from './dto/auth.dto';
import { SmsService } from './sms.service';
import { LoginLockService } from '../common/login-lock.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private jwtService: JwtService,
    private smsService: SmsService,
    private loginLockService: LoginLockService,
  ) {}

  async register(registerDto: RegisterDto) {
    const { phone, password, smsCode } = registerDto;

    // 验证码校验
    if (!smsCode) {
      throw new BadRequestException('请输入短信验证码');
    }
    const isValid = await this.smsService.verifyCode(phone, smsCode, 'REGISTER');
    if (!isValid) {
      throw new BadRequestException('验证码错误或已过期');
    }

    const existingUser = await this.prisma.user.findUnique({ where: { phone } });
    if (existingUser) {
      throw new BadRequestException('该手机号已注册');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await this.prisma.user.create({
      data: {
        phone,
        password_hash: passwordHash,
      },
    });

    const payload = { sub: user.id, phone: user.phone };
    const token = this.jwtService.sign(payload);

    return {
      access_token: token,
      user: { id: user.id, phone: user.phone },
    };
  }

  async login(loginDto: LoginDto) {
    const { phone, password, smsCode } = loginDto;

    // 短信验证码登录
    if (smsCode && !password) {
      return this.loginBySmsCode(phone, smsCode);
    }

    // 密码登录
    if (password) {
      return this.loginByPassword(phone, password);
    }

    throw new BadRequestException('请使用密码或短信验证码登录');
  }

  /**
   * 演示账号登录（绕过锁定）
   *
   * 演示账号（13800000000 / 13800000001）的密码是固定的 demo123，理论上不会失败。
   * 但为了避免有人误用此接口触发锁定，这里 demo 登录路径不调用 LoginLockService。
   * 同时，每次 demo 登录成功后清空对应主体的失败计数，防止历史脏数据影响演示。
   */
  async demoLogin() {
    const phone = '13800000000';
    const password = 'demo123';

    const user = await this.prisma.user.findUnique({ where: { phone } });
    if (!user) {
      throw new UnauthorizedException('演示账号尚未初始化，请稍后再试');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('演示账号尚未初始化，请稍后再试');
    }

    // 演示账号不参与锁定计数：清空失败记录以避免历史错误数据影响
    await this.loginLockService.clearFailures('USER', phone);

    // 查找演示家族
    const demoClan = await this.prisma.clan.findFirst({
      where: { name: '朱熹族谱（演示）' },
      select: { id: true },
    });

    // 获取用户在家族中的角色
    const memberRole = await this.prisma.clanMember.findFirst({
      where: { user_id: user.id, clan_id: demoClan?.id },
      select: { role: true },
    });

    const payload = { sub: user.id, phone: user.phone, role: memberRole?.role || 'VIEWER' };
    const token = this.jwtService.sign(payload);

    return {
      access_token: token,
      user: { id: user.id, phone: user.phone, role: memberRole?.role || 'VIEWER' },
      demoClanId: demoClan ? String(demoClan.id) : null,
    };
  }

  /**
   * 族员演示登录（普通成员角色）
   */
  async demoMemberLogin() {
    const phone = '13800000001';
    const password = 'demo123';

    const user = await this.prisma.user.findUnique({ where: { phone } });
    if (!user) {
      throw new UnauthorizedException('演示账号尚未初始化，请稍后再试');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('演示账号尚未初始化，请稍后再试');
    }

    await this.loginLockService.clearFailures('USER', phone);

    // 查找演示家族
    const demoClan = await this.prisma.clan.findFirst({
      where: { name: '朱熹族谱（演示）' },
      select: { id: true },
    });

    // 获取用户在家族中的角色
    const memberRole = await this.prisma.clanMember.findFirst({
      where: { user_id: user.id, clan_id: demoClan?.id },
      select: { role: true },
    });

    const payload = { sub: user.id, phone: user.phone, role: memberRole?.role || 'EDITOR' };
    const token = this.jwtService.sign(payload);

    return {
      access_token: token,
      user: { id: user.id, phone: user.phone, role: memberRole?.role || 'EDITOR' },
      demoClanId: demoClan ? String(demoClan.id) : null,
    };
  }

  private async loginByPassword(phone: string, password: string) {
    // 锁定检查
    await this.loginLockService.checkLock('USER', phone);

    const user = await this.prisma.user.findUnique({ where: { phone } });
    if (!user) {
      await this.loginLockService.recordFailure('USER', phone);
      throw new UnauthorizedException('手机号未注册');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      const { locked } = await this.loginLockService.recordFailure('USER', phone);
      throw new UnauthorizedException(
        locked ? '密码错误次数过多，账号已锁定30分钟' : '密码错误',
      );
    }

    await this.loginLockService.clearFailures('USER', phone);

    const payload = { sub: user.id, phone: user.phone };
    const token = this.jwtService.sign(payload);

    return {
      access_token: token,
      user: { id: user.id, phone: user.phone },
    };
  }

  /**
   * 查询当前用户作为 OWNER/ADMIN 的所有家族列表（多家族 SaaS 登录跳转依据）。
   * 用于前端登录后根据家族数量决定跳到选择器还是直接进入某个家族后台。
   */
  async getAdminClans(userId: string) {
    const memberships = await this.prisma.clanMember.findMany({
      where: {
        user_id: userId,
        role: { in: [Role.OWNER, Role.ADMIN] },
        clan: { status: 'NORMAL' },
      },
      select: {
        role: true,
        clan: {
          select: {
            id: true,
            slug: true,
            name: true,
            admin_user_id: true,
          },
        },
      },
      orderBy: { clan: { created_at: 'asc' } },
    });

    return memberships.map((m) => ({
      id: m.clan.id.toString(),
      slug: m.clan.slug,
      name: m.clan.name,
      role: m.role,
      is_owner: m.clan.admin_user_id === userId,
    }));
  }

  private async loginBySmsCode(phone: string, smsCode: string) {
    const isValid = await this.smsService.verifyCode(phone, smsCode, 'LOGIN');
    if (!isValid) {
      throw new BadRequestException('验证码错误或已过期');
    }

    let user = await this.prisma.user.findUnique({ where: { phone } });
    if (!user) {
      // 自动注册
      const passwordHash = await bcrypt.hash(Math.random().toString(36).slice(-10), 10);
      user = await this.prisma.user.create({
        data: { phone, password_hash: passwordHash },
      });
    }

    const payload = { sub: user.id, phone: user.phone };
    const token = this.jwtService.sign(payload);

    return {
      access_token: token,
      user: { id: user.id, phone: user.phone },
    };
  }
}