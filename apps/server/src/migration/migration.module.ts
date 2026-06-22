import { Module } from '@nestjs/common';
import { MigrationController } from './migration.controller';
import { MigrationService } from './migration.service';
import { AdminModule } from '../admin/admin.module';
import { PrismaService } from '@geneasphere/db';

@Module({
  imports: [AdminModule],
  controllers: [MigrationController],
  providers: [MigrationService, PrismaService],
  exports: [MigrationService],
})
export class MigrationModule {}
