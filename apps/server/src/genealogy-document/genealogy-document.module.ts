import { Module } from '@nestjs/common';
import { GenealogyDocumentController } from './genealogy-document.controller';
import { GenealogyDocumentService } from './genealogy-document.service';
import { PrintModule } from '../print/print.module';
import { CosModule } from '../cos/cos.module';

@Module({
  imports: [PrintModule, CosModule],
  controllers: [GenealogyDocumentController],
  providers: [GenealogyDocumentService],
  exports: [GenealogyDocumentService],
})
export class GenealogyDocumentModule {}
