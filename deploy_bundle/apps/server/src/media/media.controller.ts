import { Controller, Post, Get, Delete, Body, Param, Query, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MediaService } from './media.service';
import { UploadMediaDto } from './dto/upload-media.dto';
import { QueryMediaDto } from './dto/query-media.dto';
import { LinkMediaDto } from './dto/link-media.dto';
import { RecommendMediaDto } from './dto/recommend-media.dto';
import { MediaArchive } from '@prisma/client';

@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadMediaDto
  ): Promise<MediaArchive> {
    return await this.mediaService.uploadFile(
      file,
      dto.clan_id,
      dto.uploader_id,
      dto.taken_year,
      dto.taken_location,
      dto.description
    );
  }

  @Post('upload/oss')
  @UseInterceptors(FileInterceptor('file'))
  async uploadToOSS(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadMediaDto
  ): Promise<MediaArchive> {
    return await this.mediaService.uploadToOSS(
      file,
      dto.clan_id,
      dto.uploader_id,
      dto.taken_year,
      dto.taken_location,
      dto.description
    );
  }

  @Get('clan/:clanId')
  async listMedia(
    @Param('clanId') clanId: string,
    @Query() filters: QueryMediaDto
  ): Promise<MediaArchive[]> {
    return await this.mediaService.listMedia(BigInt(clanId), filters);
  }

  @Get(':id')
  async getMediaById(@Param('id') id: string): Promise<MediaArchive | null> {
    return await this.mediaService.getMediaById(BigInt(id));
  }

  @Delete(':id')
  async deleteMedia(@Param('id') id: string): Promise<void> {
    return await this.mediaService.deleteMedia(BigInt(id));
  }

  /**
   * Get media by person ID (via MediaPersonLink)
   */
  @Get('person/:personId')
  async getMediaByPersonId(@Param('personId') personId: string): Promise<MediaArchive[]> {
    return await this.mediaService.getMediaByPersonId(BigInt(personId));
  }

  /**
   * Get avatar info for a person
   */
  @Get('person/:personId/avatar')
  async getPersonAvatar(@Param('personId') personId: string) {
    return await this.mediaService.getPersonAvatar(BigInt(personId));
  }

  @Post('link')
  async linkMediaToPerson(@Body() dto: LinkMediaDto): Promise<void> {
    return await this.mediaService.linkMediaToPerson(dto.media_id, dto.person_id);
  }

  @Delete('link')
  async unlinkMediaFromPerson(@Body() dto: LinkMediaDto): Promise<void> {
    return await this.mediaService.unlinkMediaFromPerson(dto.media_id, dto.person_id);
  }

  @Post('recommend')
  async recommendMedia(@Body() dto: RecommendMediaDto): Promise<MediaArchive[]> {
    return await this.mediaService.recommendMediaFromOtherClans(
      dto.currentClanId,
      dto.location,
      dto.takenYear
    );
  }
}