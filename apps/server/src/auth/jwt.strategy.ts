import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@geneasphere/db';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('JWT_SECRET'),
    });
  }

  /**
   * 解析 JWT payload 后填充 req.user。
   *
   * 重要：`clanId` 不放在 JWT payload 中（用户可同时加入多个家族），
   * 而是每次请求时按"主家族"规则重新计算并注入，避免 token 过期后
   * 用户加入/离开家族的状态不一致。
   *
   * 主家族规则：OWNER > ADMIN > EDITOR > VIEWER；同角色时取最早加入的家族。
   */
  async validate(payload: any) {
    const userId = payload.sub;
    if (!userId) {
      return { userId, phone: payload.phone };
    }

    const memberships = await this.prisma.clanMember.findMany({
      where: { user_id: userId },
      orderBy: [{ joined_at: 'asc' }],
      select: { clan_id: true, role: true },
    });

    if (memberships.length === 0) {
      return { userId, phone: payload.phone };
    }

    const rolePriority: Record<string, number> = {
      OWNER: 0,
      ADMIN: 1,
      EDITOR: 2,
      VIEWER: 3,
    };
    const primary = [...memberships].sort((a, b) => {
      const ap = rolePriority[a.role] ?? 99;
      const bp = rolePriority[b.role] ?? 99;
      if (ap !== bp) return ap - bp;
      return 0; // 同角色保持按 joined_at 升序
    })[0];

    return {
      userId,
      phone: payload.phone,
      role: payload.role,
      clanId: primary.clan_id.toString(),
    };
  }
}