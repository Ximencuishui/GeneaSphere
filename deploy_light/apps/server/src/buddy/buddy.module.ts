import { Module } from '@nestjs/common';
import { BuddyController } from './buddy.controller';
import { BuddyService } from './buddy.service';

@Module({
  controllers: [BuddyController],
  providers: [BuddyService],
  exports: [BuddyService],
})
export class BuddyModule {}
