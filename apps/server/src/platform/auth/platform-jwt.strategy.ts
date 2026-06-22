import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlatformRole } from '@prisma/client';

export interface PlatformJwtPayload {
  sub: string;
  username: string;
  role: PlatformRole;
}

@Injectable()
export class PlatformJwtStrategy extends PassportStrategy(
  Strategy,
  'platform-jwt',
) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        configService.get<string>('JWT_PLATFORM_SECRET') ||
        'geneasphere-platform-secret-2026',
    });
  }

  async validate(payload: PlatformJwtPayload) {
    return {
      adminId: payload.sub,
      username: payload.username,
      role: payload.role,
    };
  }
}
