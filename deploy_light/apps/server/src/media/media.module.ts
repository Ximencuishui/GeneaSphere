import { Module } from '@nestjs/common';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { AvatarService } from './avatar.service';

@Module({
  controllers: [MediaController],
  providers: [MediaService, AvatarService],
  exports: [MediaService, AvatarService],
})
export class MediaModule {}