import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  Body,
  ParseIntPipe,
  BadRequestException,
  UseGuards,
  Request,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as fs from 'fs';
import { ImportService } from './import.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminService } from '../admin/admin.service';

/**
 * 族谱数据导入（Excel / JSON 备份）
 * [安全修复 2026-08-17] 原 /import/excel 无鉴权，任何匿名请求都可写库；
 * 现整体加 JwtAuthGuard，且两个端点都做 clan 管理员（OWNER/ADMIN）校验。
 * 前端 request 拦截器会自动携带 Bearer token，现有调用方不受影响。
 * [修复 2026-08-17] multer diskStorage 下 file.buffer 为空，改为读 file.path。
 */
@Controller('import')
@UseGuards(JwtAuthGuard)
export class ImportController {
  constructor(
    private readonly importService: ImportService,
    private readonly adminService: AdminService,
  ) {}

  /** diskStorage 下 buffer 为空 → 从磁盘路径读取 */
  private readUploaded(file: Express.Multer.File): Buffer {
    if (file.buffer && file.buffer.length > 0) return file.buffer;
    if (file.path) return fs.readFileSync(file.path);
    throw new BadRequestException('上传文件读取失败');
  }

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
    @Request() req,
    @UploadedFile() file: Express.Multer.File,
    @Body('clan_id', ParseIntPipe) clanId: number
  ) {
    if (!file) {
      throw new BadRequestException('请上传文件');
    }
    const userId = req?.user?.userId as string;
    await this.adminService.requireAdmin(BigInt(clanId), userId);

    const result = await this.importService.importFromExcel(
      this.readUploaded(file),
      BigInt(clanId)
    );

    return {
      success: result.successCount > 0,
      message: `导入完成: 成功 ${result.successCount} 条, 失败 ${result.failureCount} 条`,
      ...result,
    };
  }

  /**
   * 导入族谱 JSON 备份（格式与 admin 数据导出一致；OWNER/ADMIN）
   */
  @Post('json')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads',
        filename: (req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `import-${uniqueSuffix}.json`);
        },
      }),
      fileFilter: (req, file, cb) => {
        if (!file.originalname.match(/\.(json)$/i)) {
          return cb(new BadRequestException('只允许上传 .json 文件'), false);
        }
        cb(null, true);
      },
    })
  )
  async importJson(
    @Request() req,
    @UploadedFile() file: Express.Multer.File,
    @Body('clan_id', ParseIntPipe) clanId: number
  ) {
    if (!file) {
      throw new BadRequestException('请上传文件');
    }
    const userId = req?.user?.userId as string;
    await this.adminService.requireAdmin(BigInt(clanId), userId);

    let data: any;
    try {
      data = JSON.parse(this.readUploaded(file).toString('utf-8'));
    } catch {
      throw new BadRequestException('JSON 文件解析失败，请检查文件内容');
    }

    const result = await this.importService.importFromJson(data, BigInt(clanId));

    return {
      success: result.successCount > 0,
      message: `导入完成: 成功 ${result.successCount} 条, 失败 ${result.failureCount} 条`,
      ...result,
    };
  }
}
