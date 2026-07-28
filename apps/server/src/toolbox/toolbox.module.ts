import { Module } from '@nestjs/common';
import { ToolboxController } from './toolbox.controller';
import { CreditService } from './services/credit.service';
import { PackageService } from './services/package.service';
import { AIProcessorService } from './services/ai-processor.service';

@Module({
  controllers: [ToolboxController],
  providers: [CreditService, PackageService, AIProcessorService],
  exports: [CreditService, PackageService],
})
export class ToolboxModule {}
