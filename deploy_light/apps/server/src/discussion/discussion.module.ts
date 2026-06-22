import { Module } from '@nestjs/common';
import { DiscussionController } from './discussion.controller';
import { DiscussionService } from './discussion.service';
import { SummaryController } from './summary.controller';
import { AiSummaryService } from './ai-summary.service';

@Module({
  controllers: [DiscussionController, SummaryController],
  providers: [DiscussionService, AiSummaryService],
  exports: [DiscussionService],
})
export class DiscussionModule {}