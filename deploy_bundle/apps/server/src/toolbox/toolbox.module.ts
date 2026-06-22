import { Module } from '@nestjs/common';
import { ToolboxController } from './toolbox.controller';
import { CreditService } from './services/credit.service';
import { PackageService } from './services/package.service';
import { AIProcessorService } from './services/ai-processor.service';
import { PrismaService } from '@geneasphere/db';

@Module({
  controllers: [ToolboxController],
  providers: [CreditService, PackageService, AIProcessorService, PrismaService],
  exports: [CreditService, PackageService],
})
export class ToolboxModule {}
