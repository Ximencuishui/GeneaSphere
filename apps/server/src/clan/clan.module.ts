import { Module } from '@nestjs/common';
import { ClanController } from './clan.controller';
import { ClanService } from './clan.service';
import { PrismaModule } from '@geneasphere/db';

@Module({
  imports: [PrismaModule],
  controllers: [ClanController],
  providers: [ClanService],
  exports: [ClanService],
})
export class ClanModule {}
