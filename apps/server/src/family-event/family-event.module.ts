import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { FamilyEventController } from './family-event.controller';
import { FamilyEventService } from './family-event.service';

@Module({
  imports: [AdminModule],
  controllers: [FamilyEventController],
  providers: [FamilyEventService],
  exports: [FamilyEventService],
})
export class FamilyEventModule {}
