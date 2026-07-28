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

@Module({
  imports: [TreeModule],
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
