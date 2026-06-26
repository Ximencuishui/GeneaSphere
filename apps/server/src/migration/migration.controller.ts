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
import { MigrationService } from './migration.service';
import { CreateMigrationEventDto } from './dto/create-migration-event.dto';
import { UpdateMigrationEventDto } from './dto/update-migration-event.dto';
import { LinkLocationMediaDto } from './dto/link-location-media.dto';
import { ClanResolverService } from '../common/clan-resolver.service';

@ApiTags('migration')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/migration')
export class MigrationController {
  constructor(
    private readonly migrationService: MigrationService,
    private readonly clanResolver: ClanResolverService,
  ) {}

  // ==================== POI / 事件 / 支系查询 ====================

  /**
   * 获取家族 POI 列表
   */
  @Get(':clanSlug/pois')
  @ApiOperation({ summary: '获取家族 POI 列表（含人物出生地/死亡地/迁徙事件起点终点）' })
  async getPois(
    @Request() req,
    @Param('clanSlug') clanSlug: string,
    @Query('branch') branch?: string,
  ) {
    const { id: clanId } = await this.clanResolver.resolveOrThrow(clanSlug);
    return this.migrationService.getPois(clanId, branch);
  }

  /**
   * 获取迁徙事件列表
   */
  @Get(':clanSlug/events')
  @ApiOperation({ summary: '获取迁徙事件列表（按时间排序）' })
  async getEvents(
    @Request() req,
    @Param('clanSlug') clanSlug: string,
    @Query('branch') branch?: string,
  ) {
    const { id: clanId } = await this.clanResolver.resolveOrThrow(clanSlug);
    return this.migrationService.getEvents(clanId, branch);
  }

  /**
   * 获取所有支系
   */
  @Get(':clanSlug/branches')
  @ApiOperation({ summary: '获取家族所有支系列表' })
  async getBranches(@Param('clanSlug') clanSlug: string) {
    const { id: clanId } = await this.clanResolver.resolveOrThrow(clanSlug);
    return this.migrationService.getBranches(clanId);
  }

  // ==================== 迁徙事件 CRUD（需管理员） ====================

  /**
   * 创建迁徙事件
   */
  @Post(':clanSlug/events')
  @ApiOperation({ summary: '创建迁徙事件（管理员）' })
  async createEvent(
    @Request() req,
    @Param('clanSlug') clanSlug: string,
    @Body() dto: CreateMigrationEventDto,
  ) {
    const { id: clanId } = await this.clanResolver.resolveOrThrow(clanSlug);
    return this.migrationService.createEvent(clanId, req.user.userId, dto);
  }

  /**
   * 更新迁徙事件
   */
  @Put(':clanSlug/events/:id')
  @ApiOperation({ summary: '更新迁徙事件（管理员）' })
  async updateEvent(
    @Request() req,
    @Param('clanSlug') clanSlug: string,
    @Param('id') id: string,
    @Body() dto: UpdateMigrationEventDto,
  ) {
    const { id: clanId } = await this.clanResolver.resolveOrThrow(clanSlug);
    return this.migrationService.updateEvent(clanId, req.user.userId, id, dto);
  }

  /**
   * 删除迁徙事件
   */
  @Delete(':clanSlug/events/:id')
  @ApiOperation({ summary: '删除迁徙事件（管理员）' })
  async deleteEvent(
    @Request() req,
    @Param('clanSlug') clanSlug: string,
    @Param('id') id: string,
  ) {
    const { id: clanId } = await this.clanResolver.resolveOrThrow(clanSlug);
    return this.migrationService.deleteEvent(clanId, req.user.userId, id);
  }

  // ==================== 朝代数据 ====================

  /**
   * 获取所有预置朝代数据（公开，无需家族上下文）
   */
  @Get('dynasties')
  @ApiOperation({ summary: '获取所有预置朝代数据' })
  async getDynasties() {
    return this.migrationService.getDynasties();
  }

  // ==================== 地点-图片关联 ====================

  /**
   * 获取某地点关联的图片
   */
  @Get(':clanSlug/location-media')
  @ApiOperation({ summary: '获取某地点关联的图片列表' })
  async getLocationMedia(
    @Param('clanSlug') clanSlug: string,
    @Query('location') location: string,
  ) {
    if (!location?.trim()) {
      throw new BadRequestException('location 参数必填');
    }
    const { id: clanId } = await this.clanResolver.resolveOrThrow(clanSlug);
    return this.migrationService.getLocationMedia(clanId, location);
  }

  /**
   * 手动关联图片到地点（管理员）
   */
  @Post(':clanSlug/location-media')
  @ApiOperation({ summary: '将图片关联到指定地点（管理员）' })
  async linkLocationMedia(
    @Request() req,
    @Param('clanSlug') clanSlug: string,
    @Body() dto: LinkLocationMediaDto,
  ) {
    const { id: clanId } = await this.clanResolver.resolveOrThrow(clanSlug);
    return this.migrationService.linkLocationMedia(clanId, req.user.userId, dto);
  }

  /**
   * 解除图片与地点的关联（管理员）
   */
  @Delete(':clanSlug/location-media/:linkId')
  @ApiOperation({ summary: '解除图片与地点的关联（管理员）' })
  async unlinkLocationMedia(
    @Request() req,
    @Param('clanSlug') clanSlug: string,
    @Param('linkId') linkId: string,
  ) {
    const { id: clanId } = await this.clanResolver.resolveOrThrow(clanSlug);
    return this.migrationService.unlinkLocationMedia(clanId, req.user.userId, linkId);
  }

  // ==================== 经纬度补全（管理员） ====================

  /**
   * 获取所有缺少经纬度的地点（管理员）
   */
  @Get(':clanSlug/locations/missing-coords')
  @ApiOperation({ summary: '获取所有缺少经纬度的地点（管理员）' })
  async getMissingCoords(@Param('clanSlug') clanSlug: string) {
    const { id: clanId } = await this.clanResolver.resolveOrThrow(clanSlug);
    return this.migrationService.getLocationsMissingCoords(clanId);
  }

  /**
   * 补全地点经纬度（管理员）
   */
  @Post(':clanSlug/locations/fill-coords')
  @ApiOperation({ summary: '补全地点经纬度（管理员）' })
  async fillCoords(
    @Request() req,
    @Param('clanSlug') clanSlug: string,
    @Body() body: { location_name: string; lat: number; lng: number },
  ) {
    const { id: clanId } = await this.clanResolver.resolveOrThrow(clanSlug);
    return this.migrationService.fillLocationCoords(
      clanId,
      req.user.userId,
      body.location_name,
      Number(body.lat),
      Number(body.lng),
    );
  }

  private toBigInt(value: string): bigint {
    try {
      return BigInt(value);
    } catch {
      throw new BadRequestException(`Invalid ID: ${value}`);
    }
  }
}
