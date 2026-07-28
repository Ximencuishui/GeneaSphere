import { Module } from '@nestjs/common';
import { ClanMigrationVideoController } from './clan-migration-video.controller';
import { ClanMigrationVideoService } from './clan-migration-video.service';

@Module({
  controllers: [ClanMigrationVideoController],
  providers: [ClanMigrationVideoService],
  exports: [ClanMigrationVideoService],
})
export class ClanMigrationVideoModule {}
