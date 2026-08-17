import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '@geneasphere/db';

/**
 * 分享/登录双通道访问守卫（二期：分享只读链接）
 *
 * 挂在 @Public() 的册谱读端点上（@Public 跳过全局 JwtAuthGuard，本守卫接管）：
 * - 携带有效 ?share=<token> → 放行，注入 req.shareClanId / req.shareScope（只读，无 req.user）；
 * - 携带合法 Bearer JWT → 放行（登录用户正常访问，注入 req.user）；
 * - 两者皆无/无效 → 拒绝。
 *
 * 注意：JwtModule 非全局，故直接用 JwtService 实例（secret 与 auth 模块一致）。
 */
@Injectable()
export class ShareAccessGuard implements CanActivate {
  private readonly jwtService = new JwtService({
    secret: process.env.JWT_SECRET || 'geneasphere-jwt-secret-key-2026',
  });

  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();

    // 1) 分享 token（匿名只读）
    const share = req.query?.share;
    if (share) {
      const link = await this.prisma.shareLink.findUnique({
        where: { token: String(share) },
      });
      if (link && (!link.expires_at || link.expires_at > new Date())) {
        req.shareClanId = link.clan_id;
        req.shareScope = link.scope;
        return true;
      }
      return false;
    }

    // 2) 登录用户（Bearer JWT）
    const auth = req.headers?.authorization;
    if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
      try {
        const payload = this.jwtService.verify(auth.slice(7)) as any;
        req.user = {
          userId: payload.sub,
          phone: payload.phone,
          role: payload.role,
        };
        return true;
      } catch {
        // 带 token 但无效/过期 → 401（与全局 JwtAuthGuard 语义一致，前端据此跳登录）
        throw new UnauthorizedException('登录已过期，请重新登录');
      }
    }
    // 无任何凭证 → 403
    return false;
  }
}
