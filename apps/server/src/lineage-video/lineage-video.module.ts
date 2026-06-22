import { Module } from '@nestjs/common';
import { LineageVideoController } from './lineage-video.controller';
import { LineageVideoService } from './lineage-video.service';
import { LineageQueueService } from './queue/lineage-queue.service';
import { VideoModule } from '../video/video.module';

@Module({
  imports: [VideoModule],
  controllers: [LineageVideoController],
  providers: [LineageVideoService, LineageQueueService],
  exports: [LineageVideoService],
})
export class LineageVideoModule {}
