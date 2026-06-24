import { Module } from '@nestjs/common';
import { FamilyEventController } from './family-event.controller';
import { FamilyEventService } from './family-event.service';
import { PrismaService } from '@geneasphere/db';

@Module({
  controllers: [FamilyEventController],
  providers: [FamilyEventService, PrismaService],
  exports: [FamilyEventService],
})
export class FamilyEventModule {}
