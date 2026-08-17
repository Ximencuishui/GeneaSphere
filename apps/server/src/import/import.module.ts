import { Module } from '@nestjs/common';
import { ImportController } from './import.controller';
import { ImportService } from './import.service';
import { PdfImportController } from './pdf-import.controller';
import { PdfImportService } from './pdf-import.service';
import { PdfTextParserService } from './pdf-text-parser.service';
import { OcrService } from './ocr.service';
import { TencentOcrService } from './tencent-ocr.service';
import { OcrBillingService } from './ocr-billing.service';
import { TreeModule } from '../tree/tree.module';
import { PedigreeModule } from '../pedigree/pedigree.module';
import { AdminModule } from '../admin/admin.module';

@Module({
  imports: [TreeModule, PedigreeModule, AdminModule], // PedigreeModule 双写；AdminModule 提供 requireAdmin 权限校验
  controllers: [ImportController, PdfImportController],
  providers: [
    ImportService,
    PdfImportService,
    PdfTextParserService,
    OcrService,
    TencentOcrService,
    OcrBillingService,
  ],
  exports: [OcrBillingService, OcrService],
})
export class ImportModule {}
