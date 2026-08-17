import { Module } from '@nestjs/common';
import { GenealogyWorkflowController } from './genealogy-workflow.controller';
import { GenealogyWorkflowService } from './genealogy-workflow.service';
import { AdminModule } from '../admin/admin.module';

@Module({
  imports: [AdminModule],
  controllers: [GenealogyWorkflowController],
  providers: [GenealogyWorkflowService],
  exports: [GenealogyWorkflowService],
})
export class GenealogyWorkflowModule {}
