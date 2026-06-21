import { Module } from '@nestjs/common';
import { ImportController } from './import.controller';
import { ImportService } from './import.service';
import { TreeModule } from '../tree/tree.module';

@Module({
  imports: [TreeModule],
  controllers: [ImportController],
  providers: [ImportService],
})
export class ImportModule {}
