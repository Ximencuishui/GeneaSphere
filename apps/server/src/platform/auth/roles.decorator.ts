import { SetMetadata } from '@nestjs/common';
import { PlatformRole } from '@prisma/client';

export const PLATFORM_ROLES_KEY = 'platformRoles';
export const PlatformRoles = (...roles: PlatformRole[]) =>
  SetMetadata(PLATFORM_ROLES_KEY, roles);
