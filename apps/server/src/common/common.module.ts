import { Module, Global } from '@nestjs/common';
import { PrismaModule } from '@geneasphere/db';
import { ClanResolverService } from './clan-resolver.service';
import { NotificationService } from './notification.service';

/**
 * 通用服务 Module（@Global），使得任何业务 module 都能直接注入
 * ClanResolverService / NotificationService，无需在每个 module 重复 imports。
 */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [ClanResolverService, NotificationService],
  exports: [ClanResolverService, NotificationService],
})
export class CommonModule {}
