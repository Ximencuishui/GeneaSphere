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
import { ClanEventVideoService } from './clan-event-video.service';
import { CreateClanEventVideoDto } from './dto/create-clan-event-video.dto';
import { VideoProjectStatus, FamilyEventType } from '@prisma/client';
import { ClanResolverService } from '../common/clan-resolver.service';

@ApiTags('clan-event-video')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/clan-event-videos')
export class ClanEventVideoController {
  constructor(
    private readonly service: ClanEventVideoService,
    private readonly clanResolver: ClanResolverService,
  ) {}

  @Get(':clanSlug/preview')
  @ApiOperation({ summary: '预览大事件视频：返回匹配事件数量与时长' })
  async preview(
    @Param('clanSlug') clanSlug: string,
    @Query('start_year') start_year?: string,
    @Query('end_year') end_year?: string,
    @Query('event_type') event_type?: string,
  ) {
    const { id: clanId } = await this.clanResolver.resolveOrThrow(clanSlug);
    const types: FamilyEventType[] = event_type
      ? event_type.split(',').filter((s) =>
          (Object.values(FamilyEventType) as string[]).includes(s),
        ) as FamilyEventType[]
      : [];
    return this.service.preview(clanId, {
      start_year: start_year ? Number(start_year) : undefined,
      end_year: end_year ? Number(end_year) : undefined,
      event_type_filter: types.length ? types : undefined,
    });
  }

  @Get(':clanSlug')
  @ApiOperation({ summary: '查询大事件视频项目列表' })
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
  @ApiOperation({ summary: '查询单个大事件视频项目' })
  async findOne(@Param('clanSlug') clanSlug: string, @Param('id') idStr: string) {
    const { id: clanId } = await this.clanResolver.resolveOrThrow(clanSlug);
    return this.service.findOne(clanId, this.toBigInt(idStr));
  }

  @Post(':clanSlug')
  @ApiOperation({ summary: '创建大事件视频项目（异步生成）' })
  async create(
    @Request() req,
    @Param('clanSlug') clanSlug: string,
    @Body() dto: CreateClanEventVideoDto,
  ) {
    const { id: clanId } = await this.clanResolver.resolveOrThrow(clanSlug);
    return this.service.create(clanId, req.user.userId, dto);
  }

  @Delete(':clanSlug/:id')
  @ApiOperation({ summary: '删除大事件视频项目' })
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
