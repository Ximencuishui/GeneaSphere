import { Injectable, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { PlatformRole } from '@prisma/client';
import { IS_PUBLIC_PLATFORM_KEY } from './public.decorator';
import { PLATFORM_ROLES_KEY } from './roles.decorator';

@Injectable()
export class PlatformAuthGuard extends AuthGuard('platform-jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_PLATFORM_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic) {
      return true;
    }
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    if (err || !user) {
      throw err || new ForbiddenException('Platform admin authentication required');
    }

    const requiredRoles = this.reflector.getAllAndOverride<PlatformRole[]>(
      PLATFORM_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (requiredRoles && requiredRoles.length > 0) {
      if (!requiredRoles.includes(user.role)) {
        throw new ForbiddenException(
          `Role ${user.role} is not allowed. Required: ${requiredRoles.join(', ')}`,
        );
      }
    }
    return user;
  }
}
