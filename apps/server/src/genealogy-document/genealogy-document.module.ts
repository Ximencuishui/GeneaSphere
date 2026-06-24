import { Module } from '@nestjs/common';
import { GenealogyDocumentController } from './genealogy-document.controller';
import { GenealogyDocumentService } from './genealogy-document.service';
import { PrismaService } from '@geneasphere/db';
import { PrintModule } from '../print/print.module';
import { CosModule } from '../cos/cos.module';

@Module({
  imports: [PrintModule, CosModule],
  controllers: [GenealogyDocumentController],
  providers: [GenealogyDocumentService, PrismaService],
  exports: [GenealogyDocumentService],
})
export class GenealogyDocumentModule {}
