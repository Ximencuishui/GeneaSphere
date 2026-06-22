import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { PrismaService } from '@geneasphere/db';
import { PersonalSpaceController } from './personal-space.controller';
import { PersonalSpaceService } from './personal-space.service';

@Module({
  imports: [
    MulterModule.register({
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  ],
  controllers: [PersonalSpaceController],
  providers: [PersonalSpaceService, PrismaService],
})
export class PersonalSpaceModule {}
