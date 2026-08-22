import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { GenealogyFinalizeController } from './genealogy-finalize.controller';
import { GenealogyFinalizeService } from './genealogy-finalize.service';

@Module({
  imports: [AdminModule],
  controllers: [GenealogyFinalizeController],
  providers: [GenealogyFinalizeService],
})
export class GenealogyFinalizeModule {}
