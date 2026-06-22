import { Module } from '@nestjs/common';
import { FamilyBookController } from './family-book.controller';
import { FamilyBookService } from './family-book.service';
import { PrismaService } from '@geneasphere/db';

@Module({
  controllers: [FamilyBookController],
  providers: [FamilyBookService, PrismaService],
  exports: [FamilyBookService],
})
export class FamilyBookModule {}
