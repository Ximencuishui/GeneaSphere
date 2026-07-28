import { Module } from '@nestjs/common';
import { FamilyEventController } from './family-event.controller';
import { FamilyEventService } from './family-event.service';

@Module({
  controllers: [FamilyEventController],
  providers: [FamilyEventService],
  exports: [FamilyEventService],
})
export class FamilyEventModule {}
