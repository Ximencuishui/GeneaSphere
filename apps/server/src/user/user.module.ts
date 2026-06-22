import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { UserOcrController } from './user-ocr.controller';
import { ImportModule } from '../import/import.module';
import { PrismaService } from '@geneasphere/db';

@Module({
  imports: [
    MulterModule.register({
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
    ImportModule,
  ],
  controllers: [UserController, UserOcrController],
  providers: [UserService, PrismaService],
  exports: [UserService],
})
export class UserModule {}