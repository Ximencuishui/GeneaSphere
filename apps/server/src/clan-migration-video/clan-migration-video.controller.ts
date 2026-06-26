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
import { ClanResolverService } from '../common/clan-resolver.service';

@ApiTags('clan-migration-video')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/clan-migration-videos')
export class ClanMigrationVideoController {
  constructor(
    private readonly service: ClanMigrationVideoService,
    private readonly clanResolver: ClanResolverService,
  ) {}

  @Get(':clanSlug/preview')
  @ApiOperation({ summary: '预览迁徙视频：返回匹配事件数量与时长' })
  async preview(
    @Param('clanSlug') clanSlug: string,
    @Query('start_year') start_year?: string,
    @Query('end_year') end_year?: string,
    @Query('branch_filter') branch_filter?: string,
  ) {
    const { id: clanId } = await this.clanResolver.resolveOrThrow(clanSlug);
    return this.service.preview(clanId, {
      start_year: start_year ? Number(start_year) : undefined,
      end_year: end_year ? Number(end_year) : undefined,
      branch_filter,
    });
  }

  @Get(':clanSlug')
  @ApiOperation({ summary: '查询迁徙视频项目列表' })
  async list(
    @Param('clanSlug') clanSlug: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const { id: clanId } = await this.clanResolver.resolveOrThrow(clanSlug);
    const statusEnum =
      status && (Object.values(VideoProjectStatus) as string[]).includes(status)
        ? (status as VideoProjectStatus)
        : undefined;
    return this.service.list(clanId, {
      status: statusEnum,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 20,
    });
  }

  @Get(':clanSlug/:id')
  @ApiOperation({ summary: '查询单个迁徙视频项目' })
  async findOne(@Param('clanSlug') clanSlug: string, @Param('id') idStr: string) {
    const { id: clanId } = await this.clanResolver.resolveOrThrow(clanSlug);
    return this.service.findOne(clanId, this.toBigInt(idStr));
  }

  @Post(':clanSlug')
  @ApiOperation({ summary: '创建迁徙视频项目（异步生成）' })
  async create(
    @Request() req,
    @Param('clanSlug') clanSlug: string,
    @Body() dto: CreateClanMigrationVideoDto,
  ) {
    const { id: clanId } = await this.clanResolver.resolveOrThrow(clanSlug);
    return this.service.create(clanId, req.user.userId, dto);
  }

  @Delete(':clanSlug/:id')
  @ApiOperation({ summary: '删除迁徙视频项目' })
  async delete(@Param('clanSlug') clanSlug: string, @Param('id') idStr: string) {
    const { id: clanId } = await this.clanResolver.resolveOrThrow(clanSlug);
    return this.service.delete(clanId, this.toBigInt(idStr));
  }

  private toBigInt(value: string): bigint {
    try {
      return BigInt(value);
    } catch {
      throw new BadRequestException(`Invalid ID: ${value}`);
    }
  }
}
