import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { InviteModule } from '../invite/invite.module';
import { GenealogyCrowdsourceController } from './genealogy-crowdsource.controller';
import { GenealogyCrowdsourceService } from './genealogy-crowdsource.service';

@Module({
  imports: [AdminModule, InviteModule],
  controllers: [GenealogyCrowdsourceController],
  providers: [GenealogyCrowdsourceService],
  exports: [GenealogyCrowdsourceService],
})
export class GenealogyCrowdsourceModule {}
