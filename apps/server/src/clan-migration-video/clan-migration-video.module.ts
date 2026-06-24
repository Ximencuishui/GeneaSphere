import { Module } from '@nestjs/common';
import { ClanMigrationVideoController } from './clan-migration-video.controller';
import { ClanMigrationVideoService } from './clan-migration-video.service';
import { PrismaService } from '@geneasphere/db';

@Module({
  controllers: [ClanMigrationVideoController],
  providers: [ClanMigrationVideoService, PrismaService],
  exports: [ClanMigrationVideoService],
})
export class ClanMigrationVideoModule {}
