import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { TreeController } from './tree.controller';
import { TreeService } from './tree.service';

@Module({
  controllers: [TreeController],
  providers: [TreeService, { provide: PrismaClient, useValue: new PrismaClient() }],
  exports: [TreeService],
})
export class TreeModule {}
