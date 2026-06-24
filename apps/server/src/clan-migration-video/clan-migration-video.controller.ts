import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ClanMigrationVideoService } from './clan-migration-video.service';
import { CreateClanMigrationVideoDto } from './dto/create-clan-migration-video.dto';
import { VideoProjectStatus } from '@prisma/client';

@ApiTags('clan-migration-video')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/clan-migration-videos')
export class ClanMigrationVideoController {
  constructor(private readonly service: ClanMigrationVideoService) {}

  @Get(':clanId/preview')
  @ApiOperation({ summary: '预览迁徙视频：返回匹配事件数量与时长' })
  async preview(
    @Param('clanId') clanIdStr: string,
    @Query('start_year') start_year?: string,
    @Query('end_year') end_year?: string,
    @Query('branch_filter') branch_filter?: string,
  ) {
    return this.service.preview(this.toBigInt(clanIdStr), {
      start_year: start_year ? Number(start_year) : undefined,
      end_year: end_year ? Number(end_year) : undefined,
      branch_filter,
    });
  }

  @Get(':clanId')
  @ApiOperation({ summary: '查询迁徙视频项目列表' })
  async list(
    @Param('clanId') clanIdStr: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const statusEnum =
      status && (Object.values(VideoProjectStatus) as string[]).includes(status)
        ? (status as VideoProjectStatus)
        : undefined;
    return this.service.list(this.toBigInt(clanIdStr), {
      status: statusEnum,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 20,
    });
  }

  @Get(':clanId/:id')
  @ApiOperation({ summary: '查询单个迁徙视频项目' })
  async findOne(@Param('clanId') clanIdStr: string, @Param('id') idStr: string) {
    return this.service.findOne(this.toBigInt(clanIdStr), this.toBigInt(idStr));
  }

  @Post(':clanId')
  @ApiOperation({ summary: '创建迁徙视频项目（异步生成）' })
  async create(
    @Request() req,
    @Param('clanId') clanIdStr: string,
    @Body() dto: CreateClanMigrationVideoDto,
  ) {
    return this.service.create(this.toBigInt(clanIdStr), req.user.userId, dto);
  }

  @Delete(':clanId/:id')
  @ApiOperation({ summary: '删除迁徙视频项目' })
  async delete(@Param('clanId') clanIdStr: string, @Param('id') idStr: string) {
    return this.service.delete(this.toBigInt(clanIdStr), this.toBigInt(idStr));
  }

  private toBigInt(value: string): bigint {
    try {
      return BigInt(value);
    } catch {
      throw new BadRequestException(`Invalid ID: ${value}`);
    }
  }
}
