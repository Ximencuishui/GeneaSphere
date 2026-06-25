import { Module } from '@nestjs/common';
import { TreeController } from './tree.controller';
import { TreeService } from './tree.service';

@Module({
  controllers: [TreeController],
  // PrismaService 来自 @geneasphere/db 的 PrismaModule（已 @Global），可直接注入
  providers: [TreeService],
  exports: [TreeService],
})
export class TreeModule {}
