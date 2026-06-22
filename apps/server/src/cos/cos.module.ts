import { Global, Module } from '@nestjs/common';
import { CosService, LocalCosDriver, TencentCosDriver } from './cos.service';
import { CosController } from './cos.controller';
import { ImageProcessorService } from './image-processor.service';
import { DatabaseBackupService } from './database-backup.service';

@Global()
@Module({
  controllers: [CosController],
  providers: [
    CosService,
    LocalCosDriver,
    TencentCosDriver,
    ImageProcessorService,
    DatabaseBackupService,
  ],
  exports: [CosService, ImageProcessorService],
})
export class CosModule {}
