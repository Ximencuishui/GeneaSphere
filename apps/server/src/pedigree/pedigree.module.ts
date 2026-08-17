import { Module } from '@nestjs/common';
import { PedigreeService } from './pedigree.service';

/**
 * 亲子关系统一写入模块（决策清单 §H1）
 * 被 TreeModule 与 FamilyRelationModule 共同引用，避免两处各自维护 PersonAncestry/FamilyChild。
 * PrismaService 来自 @geneasphere/db 的 PrismaModule（@Global），无需在此 imports。
 */
@Module({
  providers: [PedigreeService],
  exports: [PedigreeService],
})
export class PedigreeModule {}
