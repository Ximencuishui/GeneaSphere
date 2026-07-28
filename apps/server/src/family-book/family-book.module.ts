import { Module } from '@nestjs/common';
import { FamilyBookController } from './family-book.controller';
import { FamilyBookService } from './family-book.service';

@Module({
  controllers: [FamilyBookController],
  providers: [FamilyBookService],
  exports: [FamilyBookService],
})
export class FamilyBookModule {}
