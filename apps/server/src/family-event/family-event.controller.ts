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
  UseInterceptors,
  UploadedFile,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FamilyEventService } from './family-event.service';
import { CreateFamilyEventDto } from './dto/create-family-event.dto';
import { UpdateFamilyEventDto } from './dto/update-family-event.dto';
import { FamilyEventType } from '@prisma/client';
import { AdminService } from '../admin/admin.service';
import { ClanResolverService } from '../common/clan-resolver.service';
import { parseFamilyEventCsv } from './family-event-csv';

function readCsvText(file?: Express.Multer.File, body?: { csv?: string } | string): string {
  if (file?.buffer && Buffer.isBuffer(file.buffer) && file.buffer.length > 0) {
    return file.buffer.toString('utf8');
  }
  if (typeof body === 'string' && body.trim()) return body;
  if (body && typeof body === 'object' && typeof body.csv === 'string' && body.csv.trim()) {
    return body.csv;
  }
  throw new BadRequestException('请上传 CSV 文件');
}

@ApiTags('family-event')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/family-events')
export class FamilyEventController {
  constructor(
    private readonly service: FamilyEventService,
    private readonly clanResolver: ClanResolverService,
    private readonly admin: AdminService,
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
    const clanId = await this.admin.requireAdminBySlug(clanSlug, req.user.userId);
    return this.service.create(clanId, req.user.userId, dto);
  }

  @Put(':clanSlug/:id')
  @ApiOperation({ summary: '更新家族事件' })
  async update(
    @Request() req,
    @Param('clanSlug') clanSlug: string,
    @Param('id') idStr: string,
    @Body() dto: UpdateFamilyEventDto,
  ) {
    const clanId = await this.admin.requireAdminBySlug(clanSlug, req.user.userId);
    return this.service.update(clanId, this.toBigInt(idStr), dto);
  }

  @Delete(':clanSlug/:id')
  @ApiOperation({ summary: '删除家族事件' })
  async delete(@Request() req, @Param('clanSlug') clanSlug: string, @Param('id') idStr: string) {
    const clanId = await this.admin.requireAdminBySlug(clanSlug, req.user.userId);
    return this.service.delete(clanId, this.toBigInt(idStr));
  }

  @Post(':clanSlug/bulk')
  @ApiOperation({ summary: '批量导入家族事件（JSON 数组）' })
  async bulkCreate(
    @Request() req,
    @Param('clanSlug') clanSlug: string,
    @Body() body: { events: CreateFamilyEventDto[] },
  ) {
    const clanId = await this.admin.requireAdminBySlug(clanSlug, req.user.userId);
    if (!Array.isArray(body?.events)) {
      throw new BadRequestException('events 必须是数组');
    }
    return this.service.bulkCreate(clanId, req.user.userId, body.events);
  }

  @Post(':clanSlug/import-csv')
  @ApiOperation({ summary: '从 CSV 导入家族事件' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (file.originalname && !/\.csv$/i.test(file.originalname)) {
          cb(new BadRequestException('只允许上传 .csv 文件'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  async importCsv(
    @Request() req,
    @Param('clanSlug') clanSlug: string,
    @UploadedFile() file?: Express.Multer.File,
    @Body() body?: { csv?: string } | string,
  ) {
    const clanId = await this.admin.requireAdminBySlug(clanSlug, req.user.userId);
    const parsed = parseFamilyEventCsv(readCsvText(file, body));
    const bulk = parsed.events.length
      ? await this.service.bulkCreate(clanId, req.user.userId, parsed.events)
      : { success: 0, skipped: 0, failed: 0, errors: [] as Array<{ index: number; error: string }> };
    const errors = [
      ...parsed.errors,
      ...bulk.errors.map((item) => ({
        line: parsed.lineNumbers[item.index] ?? item.index + 1,
        reason: item.error || '导入失败',
      })),
    ];
    return {
      success: bulk.success,
      skipped: bulk.skipped,
      failed: errors.length,
      errors,
    };
  }

  @Post(':clanSlug/generate-life-events')
  @ApiOperation({ summary: '基于人物生卒数据自动生成候选事件' })
  async generateLifeEvents(@Request() req, @Param('clanSlug') clanSlug: string) {
    const clanId = await this.admin.requireAdminBySlug(clanSlug, req.user.userId);
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
