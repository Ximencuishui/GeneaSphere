import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { GenealogyDigitizeController } from './genealogy-digitize.controller';
import { GenealogyDigitizeService } from './genealogy-digitize.service';

@Module({
  imports: [AdminModule],
  controllers: [GenealogyDigitizeController],
  providers: [GenealogyDigitizeService],
})
export class GenealogyDigitizeModule {}
