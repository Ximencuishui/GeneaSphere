import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  Body,
  ParseIntPipe,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { ImportService } from './import.service';

@Controller('import')
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  @Post('excel')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads',
        filename: (req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `import-${uniqueSuffix}.xlsx`);
        },
      }),
      fileFilter: (req, file, cb) => {
        if (!file.originalname.match(/\.(xlsx)$/)) {
          return cb(new BadRequestException('只允许上传 .xlsx 文件'), false);
        }
        cb(null, true);
      },
    })
  )
  async importExcel(
    @UploadedFile() file: Express.Multer.File,
    @Body('clan_id', ParseIntPipe) clanId: number
  ) {
    if (!file) {
      throw new BadRequestException('请上传文件');
    }

    const result = await this.importService.importFromExcel(
      file.buffer,
      BigInt(clanId)
    );

    return {
      success: result.successCount > 0,
      message: `导入完成: 成功 ${result.successCount} 条, 失败 ${result.failureCount} 条`,
      ...result,
    };
  }
}
