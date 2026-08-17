import { Module } from '@nestjs/common';
import { TreeController } from './tree.controller';
import { TreeService } from './tree.service';
import { AdminModule } from '../admin/admin.module';
import { PedigreeModule } from '../pedigree/pedigree.module';

@Module({
  imports: [AdminModule, PedigreeModule], // AdminModule 复用 requireAdmin 做 clan 隔离；PedigreeModule 双写亲子关系
  controllers: [TreeController],
  // PrismaService 来自 @geneasphere/db 的 PrismaModule（已 @Global），可直接注入
  providers: [TreeService],
  exports: [TreeService],
})
export class TreeModule {}
