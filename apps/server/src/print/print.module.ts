import { Module } from '@nestjs/common';
import { CepuModule } from '../cepu/cepu.module';
import { PrintController } from './print.controller';
import { PrintService } from './print.service';

@Module({
  imports: [CepuModule],
  controllers: [PrintController],
  providers: [PrintService],
  exports: [PrintService],
})
export class PrintModule {}
