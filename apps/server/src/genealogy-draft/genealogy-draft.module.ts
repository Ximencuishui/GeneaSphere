import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { GenealogyDraftController } from './genealogy-draft.controller';
import { GenealogyDraftService } from './genealogy-draft.service';

@Module({
  imports: [AdminModule],
  controllers: [GenealogyDraftController],
  providers: [GenealogyDraftService],
})
export class GenealogyDraftModule {}
