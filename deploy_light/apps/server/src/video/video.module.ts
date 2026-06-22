import { Module } from '@nestjs/common';
import { VideoController } from './video.controller';
import { VideoService } from './video.service';
import { VideoQueueService } from './queue/video-queue.service';
import { VideoProcessorService } from './queue/video-processor.service';
import { VideoGeneratorService } from './services/video-generator.service';

@Module({
  controllers: [VideoController],
  providers: [
    VideoService,
    VideoQueueService,
    VideoProcessorService,
    VideoGeneratorService,
  ],
  exports: [VideoService, VideoQueueService, VideoGeneratorService],
})
export class VideoModule {}
