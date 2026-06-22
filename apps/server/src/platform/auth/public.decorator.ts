import { SetMetadata, applyDecorators } from '@nestjs/common';
import { IS_PUBLIC_KEY } from '../../auth/public.decorator';

export const IS_PUBLIC_PLATFORM_KEY = 'isPublicPlatform';
// @PublicPlatform 同时设置 IS_PUBLIC_KEY，使全局 JwtAuthGuard 与 PlatformAuthGuard 均跳过
export const PublicPlatform = () =>
  applyDecorators(
    SetMetadata(IS_PUBLIC_KEY, true),
    SetMetadata(IS_PUBLIC_PLATFORM_KEY, true),
  );
