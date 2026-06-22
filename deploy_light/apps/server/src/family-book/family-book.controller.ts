import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FamilyBookService } from './family-book.service';
import {
  CreateFamilyBookDto,
  UpdateFamilyBookDto,
  UpdateFamilyBookPageDto,
  PlaceFamilyBookOrderDto,
} from './dto/family-book.dto';

@ApiTags('family-book')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/family-book')
export class FamilyBookController {
  constructor(private readonly service: FamilyBookService) {}

  /**
   * 在家族内搜索人物（用于选择起始人物）
   */
  @Get('persons/search')
  @ApiOperation({ summary: '在家族内搜索人物' })
  async searchPersons(
    @Request() req,
    @Query('keyword') keyword?: string,
    @Query('limit') limitStr?: string,
  ) {
    const limit = Math.min(parseInt(limitStr || '20') || 20, 50);
    return this.service.searchPersons(req.user.clanId, keyword || '', limit);
  }

  /**
   * 创建家庭图册项目（草稿）
   */
  @Post('projects')
  @ApiOperation({ summary: '创建家庭图册项目' })
  async createProject(@Request() req, @Body() dto: CreateFamilyBookDto) {
    return this.service.createProject(
      req.user.userId,
      BigInt(req.user.clanId),
      dto,
    );
  }

  /**
   * 获取我的家庭图册项目列表
   */
  @Get('projects')
  @ApiOperation({ summary: '获取我的家庭图册项目列表' })
  async listProjects(
    @Request() req,
    @Query('page') pageStr?: string,
    @Query('pageSize') pageSizeStr?: string,
  ) {
    const page = parseInt(pageStr || '1') || 1;
    const pageSize = parseInt(pageSizeStr || '10') || 10;
    return this.service.listMyProjects(req.user.userId, page, pageSize);
  }

  /**
   * 获取项目详情（含分页内容）
   */
  @Get('projects/:id')
  @ApiOperation({ summary: '获取家庭图册项目详情' })
  async getProjectDetail(@Request() req, @Param('id') id: string) {
    return this.service.getProjectDetail(id, req.user.userId);
  }

  /**
   * 预览估算（不写入 pages）
   */
  @Post('projects/:id/preview-estimate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '预览估算人数和页数' })
  async previewEstimate(@Request() req, @Param('id') id: string) {
    return this.service.previewProject(id, req.user.userId);
  }

  /**
   * 生成预览（写入 pages）
   */
  @Post('projects/:id/generate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '生成图册预览内容' })
  async generatePreview(@Request() req, @Param('id') id: string) {
    return this.service.generatePreview(id, req.user.userId);
  }

  /**
   * 更新项目设置
   */
  @Put('projects/:id')
  @ApiOperation({ summary: '更新家庭图册项目设置' })
  async updateProject(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: UpdateFamilyBookDto,
  ) {
    return this.service.updateProject(id, req.user.userId, dto);
  }

  /**
   * 删除项目
   */
  @Delete('projects/:id')
  @ApiOperation({ summary: '删除家庭图册项目' })
  async deleteProject(@Request() req, @Param('id') id: string) {
    return this.service.deleteProject(id, req.user.userId);
  }

  /**
   * 编辑某个页面的文本
   */
  @Put('projects/:id/pages/:pageId')
  @ApiOperation({ summary: '编辑图册页面内容' })
  async updatePage(
    @Request() req,
    @Param('id') id: string,
    @Param('pageId') pageId: string,
    @Body() dto: UpdateFamilyBookPageDto,
  ) {
    return this.service.updatePage(id, req.user.userId, pageId, dto);
  }

  /**
   * 一键下单印刷
   */
  @Post('projects/:id/order')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '一键下单印刷（基于图册内容创建 print_order）' })
  async placeOrder(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: PlaceFamilyBookOrderDto,
  ) {
    return this.service.placePrintOrder(
      id,
      req.user.userId,
      BigInt(req.user.clanId),
      dto,
    );
  }
}
