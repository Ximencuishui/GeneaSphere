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

@ApiTags('clan-event-video')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/clan-event-videos')
export class ClanEventVideoController {
  constructor(private readonly service: ClanEventVideoService) {}

  @Get(':clanId/preview')
  @ApiOperation({ summary: '预览大事件视频：返回匹配事件数量与时长' })
  async preview(
    @Param('clanId') clanIdStr: string,
    @Query('start_year') start_year?: string,
    @Query('end_year') end_year?: string,
    @Query('event_type') event_type?: string,
  ) {
    const types: FamilyEventType[] = event_type
      ? event_type.split(',').filter((s) =>
          (Object.values(FamilyEventType) as string[]).includes(s),
        ) as FamilyEventType[]
      : [];
    return this.service.preview(this.toBigInt(clanIdStr), {
      start_year: start_year ? Number(start_year) : undefined,
      end_year: end_year ? Number(end_year) : undefined,
      event_type_filter: types.length ? types : undefined,
    });
  }

  @Get(':clanId')
  @ApiOperation({ summary: '查询大事件视频项目列表' })
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
  @ApiOperation({ summary: '查询单个大事件视频项目' })
  async findOne(@Param('clanId') clanIdStr: string, @Param('id') idStr: string) {
    return this.service.findOne(this.toBigInt(clanIdStr), this.toBigInt(idStr));
  }

  @Post(':clanId')
  @ApiOperation({ summary: '创建大事件视频项目（异步生成）' })
  async create(
    @Request() req,
    @Param('clanId') clanIdStr: string,
    @Body() dto: CreateClanEventVideoDto,
  ) {
    return this.service.create(this.toBigInt(clanIdStr), req.user.userId, dto);
  }

  @Delete(':clanId/:id')
  @ApiOperation({ summary: '删除大事件视频项目' })
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
