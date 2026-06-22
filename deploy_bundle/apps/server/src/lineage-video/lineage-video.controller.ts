import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LineageVideoService } from './lineage-video.service';
import { CreateLineageProjectDto } from './dto/create-lineage-project.dto';

@ApiTags('lineage-video')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/lineage-video')
export class LineageVideoController {
  constructor(private readonly lineageVideoService: LineageVideoService) {}

  /**
   * 创建直系血缘视频项目
   */
  @Post('projects')
  @ApiOperation({ summary: '创建直系血缘视频项目' })
  async createProject(@Request() req, @Body() dto: CreateLineageProjectDto) {
    const userId = req.user.userId;
    const clanId = req.user.clanId;

    try {
      return await this.lineageVideoService.createProject(
        userId,
        clanId,
        BigInt(dto.center_person_id),
        dto.direction || 'paternal',
        dto.up_generations ?? 5,
        dto.down_generations ?? 3,
        dto.include_spouse ?? true,
        dto.style || 'nostalgic',
        dto.use_priority ?? false,
      );
    } catch (error: any) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(error.message || '创建项目失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * 获取我的直系血缘视频项目列表
   */
  @Get('projects')
  @ApiOperation({ summary: '获取我的直系血缘视频项目列表' })
  async listProjects(
    @Request() req,
    @Query('page') pageStr?: string,
    @Query('pageSize') pageSizeStr?: string,
  ) {
    const page = parseInt(pageStr) || 1;
    const pageSize = parseInt(pageSizeStr) || 10;
    return this.lineageVideoService.listUserProjects(req.user.userId, page, pageSize);
  }

  /**
   * 获取项目详情
   */
  @Get('projects/:id')
  @ApiOperation({ summary: '获取直系血缘视频项目详情' })
  async getProjectDetail(@Request() req, @Param('id') id: string) {
    return this.lineageVideoService.getProjectDetail(id, req.user.userId);
  }

  /**
   * 取消项目
   */
  @Delete('projects/:id')
  @ApiOperation({ summary: '取消排队中的直系血缘视频项目' })
  async cancelProject(@Request() req, @Param('id') id: string) {
    await this.lineageVideoService.cancelProject(id, req.user.userId);
    return { message: '项目已取消' };
  }

  /**
   * 删除项目
   */
  @Delete('projects/:id/delete')
  @ApiOperation({ summary: '删除直系血缘视频项目' })
  async deleteProject(@Request() req, @Param('id') id: string) {
    await this.lineageVideoService.deleteProject(id, req.user.userId);
    return { message: '项目已删除' };
  }

  /**
   * 素材预览
   */
  @Get('preview')
  @ApiOperation({ summary: '预览直系血缘视频素材' })
  async previewMaterials(
    @Request() req,
    @Query('centerPersonId') centerPersonIdStr: string,
    @Query('direction') direction?: string,
    @Query('upGenerations') upGenStr?: string,
    @Query('downGenerations') downGenStr?: string,
    @Query('includeSpouse') includeSpouseStr?: string,
  ) {
    const centerPersonId = BigInt(centerPersonIdStr);
    const upGenerations = parseInt(upGenStr) || 5;
    const downGenerations = parseInt(downGenStr) || 3;
    const includeSpouse = includeSpouseStr !== 'false';
    return this.lineageVideoService.previewMaterials(
      centerPersonId,
      direction || 'paternal',
      upGenerations,
      downGenerations,
      includeSpouse,
    );
  }

  /**
   * 获取月度用量
   */
  @Get('monthly-usage')
  @ApiOperation({ summary: '获取本月已生成数量' })
  async getMonthlyUsage(@Request() req) {
    const count = await this.lineageVideoService.getMonthlyUsage(req.user.userId);
    return { used: count, limit: 2, remaining: Math.max(0, 2 - count) };
  }

  /**
   * 在家族内搜索人物（按姓名）
   */
  @Get('persons/search')
  @ApiOperation({ summary: '在家族内搜索人物' })
  async searchPersons(
    @Request() req,
    @Query('keyword') keyword?: string,
    @Query('limit') limitStr?: string,
  ) {
    const limit = Math.min(parseInt(limitStr) || 20, 50);
    const clanId = req.user.clanId;
    return this.lineageVideoService.searchPersons(clanId, keyword || '', limit);
  }
}
