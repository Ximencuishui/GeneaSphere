import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Query,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Request,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiBearerAuth, ApiTags, ApiConsumes, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PersonalSpaceService } from './personal-space.service';
import { CreateAlbumDto } from './dto/create-album.dto';
import { UpdateAlbumDto } from './dto/update-album.dto';
import { UpdatePhotoDto } from './dto/update-photo.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { SpacePrivacyLevel } from '@prisma/client';

@ApiTags('personal-space')
@Controller('api/personal-space')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PersonalSpaceController {
  constructor(private readonly service: PersonalSpaceService) {}

  // ==================== 存储 ====================

  @Get('storage')
  @ApiOperation({ summary: '获取存储用量' })
  async getStorage(@Request() req) {
    return this.service.getStorage(req.user.userId);
  }

  // ==================== 相册 ====================

  @Get('albums')
  @ApiOperation({ summary: '相册列表' })
  async listAlbums(@Request() req, @Query('sort') sort?: string) {
    return this.service.listAlbums(req.user.userId, sort || 'updated_at');
  }

  @Post('albums')
  @ApiOperation({ summary: '创建相册' })
  async createAlbum(@Request() req, @Body() dto: CreateAlbumDto) {
    return this.service.createAlbum(req.user.userId, {
      name: dto.name,
      description: dto.description,
      default_privacy: dto.default_privacy as SpacePrivacyLevel,
    });
  }

  @Put('albums/:id')
  @ApiOperation({ summary: '编辑相册' })
  async updateAlbum(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: UpdateAlbumDto,
  ) {
    return this.service.updateAlbum(req.user.userId, BigInt(id), {
      name: dto.name,
      description: dto.description,
      default_privacy: dto.default_privacy as SpacePrivacyLevel,
      cover_photo_id: dto.cover_photo_id ? BigInt(dto.cover_photo_id) : undefined,
    });
  }

  @Delete('albums/:id')
  @ApiOperation({ summary: '删除相册（照片移至未分类）' })
  async deleteAlbum(@Request() req, @Param('id') id: string) {
    return this.service.deleteAlbum(req.user.userId, BigInt(id));
  }

  // ==================== 照片 ====================

  @Get('photos')
  @ApiOperation({ summary: '照片列表' })
  async listPhotos(
    @Request() req,
    @Query('album_id') albumId?: string,
    @Query('page') pageStr = '1',
    @Query('pageSize') pageSizeStr = '20',
  ) {
    return this.service.listPhotos(req.user.userId, {
      album_id: albumId ? BigInt(albumId) : undefined,
      page: parseInt(pageStr) || 1,
      pageSize: parseInt(pageSizeStr) || 20,
    });
  }

  @Post('photos/upload')
  @ApiOperation({ summary: '上传照片' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async uploadPhoto(
    @Request() req,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: {
      album_id: string;
      location_name: string;
      taken_year: string;
      taken_date?: string;
      description?: string;
      privacy?: string;
    },
  ) {
    if (!file) throw new BadRequestException('请上传照片文件');
    if (!body.album_id) throw new BadRequestException('请选择相册');
    if (!body.location_name) throw new BadRequestException('请填写地点');
    if (!body.taken_year) throw new BadRequestException('请填写年份');

    const takenYear = parseInt(body.taken_year);
    if (isNaN(takenYear) || takenYear < 1900 || takenYear > new Date().getFullYear()) {
      throw new BadRequestException(
        '请填写有效的年份（1900-' + new Date().getFullYear() + '）',
      );
    }

    if (!/^image\/(jpe?g|png|webp|gif)$/i.test(file.mimetype)) {
      throw new BadRequestException('照片仅支持 jpg/png/webp/gif');
    }

    return this.service.uploadPhoto(req.user.userId, file, {
      album_id: BigInt(body.album_id),
      location_name: body.location_name,
      taken_year: takenYear,
      taken_date: body.taken_date,
      description: body.description,
      privacy: (body.privacy as SpacePrivacyLevel) || undefined,
    });
  }

  @Put('photos/:id')
  @ApiOperation({ summary: '编辑照片元数据' })
  async updatePhoto(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: UpdatePhotoDto,
  ) {
    return this.service.updatePhoto(req.user.userId, BigInt(id), {
      location_name: dto.location_name,
      taken_year: dto.taken_year,
      taken_date: dto.taken_date,
      description: dto.description,
      privacy: dto.privacy as SpacePrivacyLevel,
    });
  }

  @Delete('photos/:id')
  @ApiOperation({ summary: '删除照片' })
  async deletePhoto(@Request() req, @Param('id') id: string) {
    return this.service.deletePhoto(req.user.userId, BigInt(id));
  }

  @Post('photos/:id/move')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '移动照片到其他相册' })
  async movePhoto(
    @Request() req,
    @Param('id') id: string,
    @Body() body: { target_album_id: string },
  ) {
    if (!body.target_album_id) throw new BadRequestException('请指定目标相册');
    return this.service.movePhoto(
      req.user.userId,
      BigInt(id),
      BigInt(body.target_album_id),
    );
  }

  // ==================== 留言板 ====================

  @Get('messages')
  @ApiOperation({ summary: '留言列表' })
  async listMessages(
    @Request() req,
    @Query('year') yearStr?: string,
    @Query('page') pageStr = '1',
    @Query('pageSize') pageSizeStr = '20',
  ) {
    return this.service.listMessages(req.user.userId, {
      year: yearStr ? parseInt(yearStr) : undefined,
      page: parseInt(pageStr) || 1,
      pageSize: parseInt(pageSizeStr) || 20,
    });
  }

  @Post('messages')
  @ApiOperation({ summary: '发布留言' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async createMessage(
    @Request() req,
    @UploadedFile() imageFile: Express.Multer.File,
    @Body() body: { content: string; privacy?: string },
  ) {
    if (!body?.content) throw new BadRequestException('请填写留言内容');
    if (body.content.length > 200) throw new BadRequestException('留言内容不能超过200字');

    if (imageFile && !/^image\/(jpe?g|png|webp|gif)$/i.test(imageFile.mimetype)) {
      throw new BadRequestException('配图仅支持 jpg/png/webp/gif');
    }

    return this.service.createMessage(
      req.user.userId,
      {
        content: body.content,
        privacy: (body.privacy as SpacePrivacyLevel) || undefined,
      },
      imageFile || undefined,
    );
  }

  @Put('messages/:id')
  @ApiOperation({ summary: '编辑留言（30分钟内）' })
  async updateMessage(
    @Request() req,
    @Param('id') id: string,
    @Body() body: { content: string },
  ) {
    if (!body?.content) throw new BadRequestException('请填写留言内容');
    return this.service.updateMessage(req.user.userId, BigInt(id), {
      content: body.content,
    });
  }

  @Delete('messages/:id')
  @ApiOperation({ summary: '删除留言' })
  async deleteMessage(@Request() req, @Param('id') id: string) {
    return this.service.deleteMessage(req.user.userId, BigInt(id));
  }
}
