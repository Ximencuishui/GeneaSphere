import { Module } from '@nestjs/common';
import { TreeController } from './tree.controller';
import { TreeService } from './tree.service';
import { AdminModule } from '../admin/admin.module';

@Module({
  imports: [AdminModule], // 复用 AdminService.requireAdmin 做 clan 隔离
  controllers: [TreeController],
  // PrismaService 来自 @geneasphere/db 的 PrismaModule（已 @Global），可直接注入
  providers: [TreeService],
  exports: [TreeService],
})
export class TreeModule {}
