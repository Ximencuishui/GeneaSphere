import { Global, Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { GenealogyEditionController } from './genealogy-edition.controller';
import { GenealogyEditionService } from './genealogy-edition.service';

@Global()
@Module({
  imports: [AdminModule],
  controllers: [GenealogyEditionController],
  providers: [GenealogyEditionService],
  exports: [GenealogyEditionService],
})
export class GenealogyEditionModule {}
