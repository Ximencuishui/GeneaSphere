import { Module } from '@nestjs/common';
import { CepuController } from './cepu.controller';
import { CepuService } from './cepu.service';
import { ShareAccessGuard } from './share-access.guard';
import { AdminModule } from '../admin/admin.module';

/**
 * 册谱模块（一期：卷宗管理 + 苏式世录生成 + PersonBio + 检索 + PDF）
 * PrismaService / ClanResolverService 来自 @Global 模块，无需 imports。
 * AdminModule 提供 requireAdmin 权限校验。
 */
@Module({
  imports: [AdminModule],
  controllers: [CepuController],
  providers: [CepuService, ShareAccessGuard],
  exports: [CepuService],
})
export class CepuModule {}
