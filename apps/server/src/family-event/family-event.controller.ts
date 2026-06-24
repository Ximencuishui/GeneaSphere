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

@ApiTags('family-event')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/family-events')
export class FamilyEventController {
  constructor(private readonly service: FamilyEventService) {}

  @Get(':clanId')
  @ApiOperation({ summary: '查询家族大事件列表' })
  async list(
    @Param('clanId') clanIdStr: string,
    @Query('event_type') event_type?: string,
    @Query('start_year') start_year?: string,
    @Query('end_year') end_year?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const eventTypeEnum =
      event_type && (Object.values(FamilyEventType) as string[]).includes(event_type)
        ? (event_type as FamilyEventType)
        : undefined;
    return this.service.list(this.toBigInt(clanIdStr), {
      event_type: eventTypeEnum,
      start_year: start_year ? Number(start_year) : undefined,
      end_year: end_year ? Number(end_year) : undefined,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 20,
    });
  }

  @Get(':clanId/:id')
  @ApiOperation({ summary: '查询单个家族事件' })
  async findOne(@Param('clanId') clanIdStr: string, @Param('id') idStr: string) {
    return this.service.findOne(this.toBigInt(clanIdStr), this.toBigInt(idStr));
  }

  @Post(':clanId')
  @ApiOperation({ summary: '新增家族事件' })
  async create(
    @Request() req,
    @Param('clanId') clanIdStr: string,
    @Body() dto: CreateFamilyEventDto,
  ) {
    return this.service.create(this.toBigInt(clanIdStr), req.user.userId, dto);
  }

  @Put(':clanId/:id')
  @ApiOperation({ summary: '更新家族事件' })
  async update(
    @Param('clanId') clanIdStr: string,
    @Param('id') idStr: string,
    @Body() dto: UpdateFamilyEventDto,
  ) {
    return this.service.update(this.toBigInt(clanIdStr), this.toBigInt(idStr), dto);
  }

  @Delete(':clanId/:id')
  @ApiOperation({ summary: '删除家族事件' })
  async delete(@Param('clanId') clanIdStr: string, @Param('id') idStr: string) {
    return this.service.delete(this.toBigInt(clanIdStr), this.toBigInt(idStr));
  }

  @Post(':clanId/bulk')
  @ApiOperation({ summary: '批量导入家族事件（JSON 数组）' })
  async bulkCreate(
    @Request() req,
    @Param('clanId') clanIdStr: string,
    @Body() body: { events: CreateFamilyEventDto[] },
  ) {
    if (!Array.isArray(body?.events)) {
      throw new BadRequestException('events 必须是数组');
    }
    return this.service.bulkCreate(this.toBigInt(clanIdStr), req.user.userId, body.events);
  }

  @Post(':clanId/generate-life-events')
  @ApiOperation({ summary: '基于人物生卒数据自动生成候选事件' })
  async generateLifeEvents(@Param('clanId') clanIdStr: string) {
    return this.service.generateLifeEvents(this.toBigInt(clanIdStr));
  }

  private toBigInt(value: string): bigint {
    try {
      return BigInt(value);
    } catch {
      throw new BadRequestException(`Invalid ID: ${value}`);
    }
  }
}
