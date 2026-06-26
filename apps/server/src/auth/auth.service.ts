import { Injectable, UnauthorizedException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '@geneasphere/db';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { RegisterDto, LoginDto } from './dto/auth.dto';
import { SmsService } from './sms.service';
import { LoginLockService } from '../common/login-lock.service';
import { ClanResolverService } from '../common/clan-resolver.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private jwtService: JwtService,
    private smsService: SmsService,
    private loginLockService: LoginLockService,
    private clanResolver: ClanResolverService,
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
   * 查找演示家族（朱熹族谱（演示）），附带 slug 用于前端直接跳家族后台。
   * 老版本 seed 未生成 slug 时自动补齐，避免 SelectFamilyPage 误跳到 login。
   */
  private async getDemoClanWithSlug() {
    let demoClan = await this.prisma.clan.findFirst({
      where: { name: '朱熹族谱（演示）' },
      select: { id: true, slug: true },
    });
    if (demoClan && !demoClan.slug) {
      const newSlug = await this.clanResolver.generateUniqueSlug(
        'zhuxi-demo',
        'zhuxi-demo',
      );
      demoClan = await this.prisma.clan.update({
        where: { id: demoClan.id },
        data: { slug: newSlug },
        select: { id: true, slug: true },
      });
    }
    return demoClan;
  }

  /**
   * 演示账号登录内部逻辑（封装重复代码）。
   *
   * @param phone 演示账号手机号（13800000000 管理员 / 13800000001 族员）
   * @param defaultRole 查不到 clan 成员记录时使用的默认角色
   */
  private async demoLoginInternal(phone: string, defaultRole: 'OWNER' | 'EDITOR') {
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

    const demoClan = await this.getDemoClanWithSlug();

    const memberRole = await this.prisma.clanMember.findFirst({
      where: { user_id: user.id, clan_id: demoClan?.id },
      select: { role: true },
    });

    const role = memberRole?.role || defaultRole;
    const payload = { sub: user.id, phone: user.phone, role };
    const token = this.jwtService.sign(payload);

    return {
      access_token: token,
      user: { id: user.id, phone: user.phone, role },
      demoClanId: demoClan ? String(demoClan.id) : null,
      demoClanSlug: demoClan?.slug ?? null,
    };
  }

  /**
   * 演示账号登录（绕过锁定）—— 管理员视角（13800000000）。
   * 演示账号的密码是固定的 demo123，理论上不会失败。
   * demo 登录路径不调用 LoginLockService，每次成功后清空失败计数。
   */
  async demoLogin() {
    return this.demoLoginInternal('13800000000', 'OWNER');
  }

  /**
   * 族员演示登录（13800000001）—— 族员视角。
   */
  async demoMemberLogin() {
    return this.demoLoginInternal('13800000001', 'EDITOR');
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

  /**
   * 获取当前演示账号关联的 Person 记录（朱小小）。
   *
   * 仅供演示账号使用：
   * - 13800000000（管理员）→ 返回 null（管理员视角不绑定具体 Person）
   * - 13800000001（族员）   → 返回"朱小小"Person 数据（族谱真实身份）
   * - 其他用户              → 403 Forbidden
   *
   * 关联关系通过 person_user_links 表维护，由 DemoSeedService 自动建立。
   */
  async getDemoPerson(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { phone: true },
    });
    if (!user) {
      throw new UnauthorizedException('用户不存在');
    }

    // 管理员视角：不关联具体 Person
    if (user.phone === '13800000000') {
      return { person: null, role: 'OWNER' as const };
    }

    // 非演示账号：拒绝访问
    if (user.phone !== '13800000001') {
      throw new ForbiddenException('该接口仅供演示账号使用');
    }

    // 族员视角：查询 PersonUserLink 关联的 Person 记录
    const link = await this.prisma.personUserLink.findFirst({
      where: { user_id: userId, relation_role: 'self' },
      include: {
        person: {
          select: {
            id: true,
            full_name: true,
            gender: true,
            birth_date: true,
            birth_place: true,
            migration_branch: true,
            avatar_url: true,
            clan: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
        },
      },
    });

    if (!link) {
      // 兜底：按姓名 + 演示家族查找（兼容 seed 失败导致 link 未建立的情况）
      // 限定 clan 避免误返回其他家族同名 Person
      const person = await this.prisma.person.findFirst({
        where: {
          full_name: '朱小小',
          clan: { name: '朱熹族谱（演示）' },
        },
        select: {
          id: true,
          full_name: true,
          gender: true,
          birth_date: true,
          birth_place: true,
          migration_branch: true,
          avatar_url: true,
          clan: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      });
      if (!person) {
        throw new UnauthorizedException('演示族员身份尚未初始化，请联系管理员');
      }
      return {
        person: {
          id: person.id.toString(),
          full_name: person.full_name,
          gender: person.gender,
          birth_date: person.birth_date,
          birth_place: person.birth_place,
          migration_branch: person.migration_branch,
          avatar_url: person.avatar_url,
          clan: {
            id: person.clan.id.toString(),
            name: person.clan.name,
            slug: person.clan.slug,
          },
        },
        role: 'EDITOR' as const,
      };
    }

    const p = link.person;
    return {
      person: {
        id: p.id.toString(),
        full_name: p.full_name,
        gender: p.gender,
        birth_date: p.birth_date,
        birth_place: p.birth_place,
        migration_branch: p.migration_branch,
        avatar_url: p.avatar_url,
        clan: {
          id: p.clan.id.toString(),
          name: p.clan.name,
          slug: p.clan.slug,
        },
      },
      role: 'EDITOR' as const,
    };
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