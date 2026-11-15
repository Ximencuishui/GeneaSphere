import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { ClanEventVideoController } from './clan-event-video.controller';
import { ClanEventVideoService } from './clan-event-video.service';

@Module({
  imports: [AdminModule],
  controllers: [ClanEventVideoController],
  providers: [ClanEventVideoService],
  exports: [ClanEventVideoService],
})
export class ClanEventVideoModule {}
