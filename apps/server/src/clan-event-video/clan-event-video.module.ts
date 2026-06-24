import { Module } from '@nestjs/common';
import { ClanEventVideoController } from './clan-event-video.controller';
import { ClanEventVideoService } from './clan-event-video.service';
import { PrismaService } from '@geneasphere/db';

@Module({
  controllers: [ClanEventVideoController],
  providers: [ClanEventVideoService, PrismaService],
  exports: [ClanEventVideoService],
})
export class ClanEventVideoModule {}
