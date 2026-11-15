import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { ClanMigrationVideoController } from './clan-migration-video.controller';
import { ClanMigrationVideoService } from './clan-migration-video.service';

@Module({
  imports: [AdminModule],
  controllers: [ClanMigrationVideoController],
  providers: [ClanMigrationVideoService],
  exports: [ClanMigrationVideoService],
})
export class ClanMigrationVideoModule {}
