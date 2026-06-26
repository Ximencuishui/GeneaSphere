import {
  Controller,
  Get,
  Post,
  Put,
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
import { FamilyEventService } from './family-event.service';
import { CreateFamilyEventDto } from './dto/create-family-event.dto';
import { UpdateFamilyEventDto } from './dto/update-family-event.dto';
import { FamilyEventType } from '@prisma/client';
import { ClanResolverService } from '../common/clan-resolver.service';

@ApiTags('family-event')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/family-events')
export class FamilyEventController {
  constructor(
    private readonly service: FamilyEventService,
    private readonly clanResolver: ClanResolverService,
  ) {}

  @Get(':clanSlug')
  @ApiOperation({ summary: '查询家族大事件列表' })
  async list(
    @Param('clanSlug') clanSlug: string,
    @Query('event_type') event_type?: string,
    @Query('start_year') start_year?: string,
    @Query('end_year') end_year?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const { id: clanId } = await this.clanResolver.resolveOrThrow(clanSlug);
    const eventTypeEnum =
      event_type && (Object.values(FamilyEventType) as string[]).includes(event_type)
        ? (event_type as FamilyEventType)
        : undefined;
    return this.service.list(clanId, {
      event_type: eventTypeEnum,
      start_year: start_year ? Number(start_year) : undefined,
      end_year: end_year ? Number(end_year) : undefined,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 20,
    });
  }

  @Get(':clanSlug/:id')
  @ApiOperation({ summary: '查询单个家族事件' })
  async findOne(@Param('clanSlug') clanSlug: string, @Param('id') idStr: string) {
    const { id: clanId } = await this.clanResolver.resolveOrThrow(clanSlug);
    return this.service.findOne(clanId, this.toBigInt(idStr));
  }

  @Post(':clanSlug')
  @ApiOperation({ summary: '新增家族事件' })
  async create(
    @Request() req,
    @Param('clanSlug') clanSlug: string,
    @Body() dto: CreateFamilyEventDto,
  ) {
    const { id: clanId } = await this.clanResolver.resolveOrThrow(clanSlug);
    return this.service.create(clanId, req.user.userId, dto);
  }

  @Put(':clanSlug/:id')
  @ApiOperation({ summary: '更新家族事件' })
  async update(
    @Param('clanSlug') clanSlug: string,
    @Param('id') idStr: string,
    @Body() dto: UpdateFamilyEventDto,
  ) {
    const { id: clanId } = await this.clanResolver.resolveOrThrow(clanSlug);
    return this.service.update(clanId, this.toBigInt(idStr), dto);
  }

  @Delete(':clanSlug/:id')
  @ApiOperation({ summary: '删除家族事件' })
  async delete(@Param('clanSlug') clanSlug: string, @Param('id') idStr: string) {
    const { id: clanId } = await this.clanResolver.resolveOrThrow(clanSlug);
    return this.service.delete(clanId, this.toBigInt(idStr));
  }

  @Post(':clanSlug/bulk')
  @ApiOperation({ summary: '批量导入家族事件（JSON 数组）' })
  async bulkCreate(
    @Request() req,
    @Param('clanSlug') clanSlug: string,
    @Body() body: { events: CreateFamilyEventDto[] },
  ) {
    if (!Array.isArray(body?.events)) {
      throw new BadRequestException('events 必须是数组');
    }
    const { id: clanId } = await this.clanResolver.resolveOrThrow(clanSlug);
    return this.service.bulkCreate(clanId, req.user.userId, body.events);
  }

  @Post(':clanSlug/generate-life-events')
  @ApiOperation({ summary: '基于人物生卒数据自动生成候选事件' })
  async generateLifeEvents(@Param('clanSlug') clanSlug: string) {
    const { id: clanId } = await this.clanResolver.resolveOrThrow(clanSlug);
    return this.service.generateLifeEvents(clanId);
  }

  private toBigInt(value: string): bigint {
    try {
      return BigInt(value);
    } catch {
      throw new BadRequestException(`Invalid ID: ${value}`);
    }
  }
}
