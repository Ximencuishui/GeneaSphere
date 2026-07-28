import { Module } from '@nestjs/common';
import { ClanEventVideoController } from './clan-event-video.controller';
import { ClanEventVideoService } from './clan-event-video.service';

@Module({
  controllers: [ClanEventVideoController],
  providers: [ClanEventVideoService],
  exports: [ClanEventVideoService],
})
export class ClanEventVideoModule {}
