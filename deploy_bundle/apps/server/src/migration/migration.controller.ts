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

@ApiTags('migration')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/migration')
export class MigrationController {
  constructor(private readonly migrationService: MigrationService) {}

  // ==================== POI / 事件 / 支系查询 ====================

  /**
   * 获取家族 POI 列表
   */
  @Get(':clanId/pois')
  @ApiOperation({ summary: '获取家族 POI 列表（含人物出生地/死亡地/迁徙事件起点终点）' })
  async getPois(
    @Request() req,
    @Param('clanId') clanIdStr: string,
    @Query('branch') branch?: string,
  ) {
    return this.migrationService.getPois(this.toBigInt(clanIdStr), branch);
  }

  /**
   * 获取迁徙事件列表
   */
  @Get(':clanId/events')
  @ApiOperation({ summary: '获取迁徙事件列表（按时间排序）' })
  async getEvents(
    @Request() req,
    @Param('clanId') clanIdStr: string,
    @Query('branch') branch?: string,
  ) {
    return this.migrationService.getEvents(this.toBigInt(clanIdStr), branch);
  }

  /**
   * 获取所有支系
   */
  @Get(':clanId/branches')
  @ApiOperation({ summary: '获取家族所有支系列表' })
  async getBranches(@Param('clanId') clanIdStr: string) {
    return this.migrationService.getBranches(this.toBigInt(clanIdStr));
  }

  // ==================== 迁徙事件 CRUD（需管理员） ====================

  /**
   * 创建迁徙事件
   */
  @Post(':clanId/events')
  @ApiOperation({ summary: '创建迁徙事件（管理员）' })
  async createEvent(
    @Request() req,
    @Param('clanId') clanIdStr: string,
    @Body() dto: CreateMigrationEventDto,
  ) {
    return this.migrationService.createEvent(
      this.toBigInt(clanIdStr),
      req.user.userId,
      dto,
    );
  }

  /**
   * 更新迁徙事件
   */
  @Put(':clanId/events/:id')
  @ApiOperation({ summary: '更新迁徙事件（管理员）' })
  async updateEvent(
    @Request() req,
    @Param('clanId') clanIdStr: string,
    @Param('id') id: string,
    @Body() dto: UpdateMigrationEventDto,
  ) {
    return this.migrationService.updateEvent(
      this.toBigInt(clanIdStr),
      req.user.userId,
      id,
      dto,
    );
  }

  /**
   * 删除迁徙事件
   */
  @Delete(':clanId/events/:id')
  @ApiOperation({ summary: '删除迁徙事件（管理员）' })
  async deleteEvent(
    @Request() req,
    @Param('clanId') clanIdStr: string,
    @Param('id') id: string,
  ) {
    return this.migrationService.deleteEvent(
      this.toBigInt(clanIdStr),
      req.user.userId,
      id,
    );
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
  @Get(':clanId/location-media')
  @ApiOperation({ summary: '获取某地点关联的图片列表' })
  async getLocationMedia(
    @Param('clanId') clanIdStr: string,
    @Query('location') location: string,
  ) {
    if (!location?.trim()) {
      throw new BadRequestException('location 参数必填');
    }
    return this.migrationService.getLocationMedia(this.toBigInt(clanIdStr), location);
  }

  /**
   * 手动关联图片到地点（管理员）
   */
  @Post(':clanId/location-media')
  @ApiOperation({ summary: '将图片关联到指定地点（管理员）' })
  async linkLocationMedia(
    @Request() req,
    @Param('clanId') clanIdStr: string,
    @Body() dto: LinkLocationMediaDto,
  ) {
    return this.migrationService.linkLocationMedia(
      this.toBigInt(clanIdStr),
      req.user.userId,
      dto,
    );
  }

  /**
   * 解除图片与地点的关联（管理员）
   */
  @Delete(':clanId/location-media/:linkId')
  @ApiOperation({ summary: '解除图片与地点的关联（管理员）' })
  async unlinkLocationMedia(
    @Request() req,
    @Param('clanId') clanIdStr: string,
    @Param('linkId') linkId: string,
  ) {
    return this.migrationService.unlinkLocationMedia(
      this.toBigInt(clanIdStr),
      req.user.userId,
      linkId,
    );
  }

  // ==================== 经纬度补全（管理员） ====================

  /**
   * 获取所有缺少经纬度的地点（管理员）
   */
  @Get(':clanId/locations/missing-coords')
  @ApiOperation({ summary: '获取所有缺少经纬度的地点（管理员）' })
  async getMissingCoords(@Param('clanId') clanIdStr: string) {
    return this.migrationService.getLocationsMissingCoords(this.toBigInt(clanIdStr));
  }

  /**
   * 补全地点经纬度（管理员）
   */
  @Post(':clanId/locations/fill-coords')
  @ApiOperation({ summary: '补全地点经纬度（管理员）' })
  async fillCoords(
    @Request() req,
    @Param('clanId') clanIdStr: string,
    @Body() body: { location_name: string; lat: number; lng: number },
  ) {
    return this.migrationService.fillLocationCoords(
      this.toBigInt(clanIdStr),
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
