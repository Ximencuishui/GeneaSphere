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
import { VideoService } from './video.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { PurchaseVipDto } from './dto/purchase-vip.dto';

@ApiTags('video')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/video')
export class VideoController {
  constructor(private readonly videoService: VideoService) {}

  /**
   * 创建视频生成项目
   */
  @Post('projects')
  @ApiOperation({ summary: '创建视频生成项目' })
  async createProject(@Request() req, @Body() dto: CreateProjectDto) {
    const userId = req.user.userId;
    const clanId = req.user.clanId;

    try {
      const result = await this.videoService.createProject(
        userId,
        clanId,
        BigInt(dto.target_person_id),
        dto.style,
        dto.use_priority,
      );
      return result;
    } catch (error: any) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || '创建项目失败',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 获取我的视频项目列表
   */
  @Get('projects')
  @ApiOperation({ summary: '获取我的视频项目列表' })
  async listProjects(
    @Request() req,
    @Query('page') pageStr?: string,
    @Query('pageSize') pageSizeStr?: string,
  ) {
    const page = parseInt(pageStr) || 1;
    const pageSize = parseInt(pageSizeStr) || 10;
    return this.videoService.listUserProjects(req.user.userId, page, pageSize);
  }

  /**
   * 获取项目详情
   */
  @Get('projects/:id')
  @ApiOperation({ summary: '获取项目详情' })
  async getProjectDetail(@Request() req, @Param('id') id: string) {
    return this.videoService.getProjectDetail(id, req.user.userId);
  }

  /**
   * 取消项目
   */
  @Delete('projects/:id')
  @ApiOperation({ summary: '取消排队中的项目' })
  async cancelProject(@Request() req, @Param('id') id: string) {
    await this.videoService.cancelProject(id, req.user.userId);
    return { message: '项目已取消' };
  }

  /**
   * 删除项目
   */
  @Delete('projects/:id/delete')
  @ApiOperation({ summary: '删除项目' })
  async deleteProject(@Request() req, @Param('id') id: string) {
    await this.videoService.deleteProject(id, req.user.userId);
    return { message: '项目已删除' };
  }

  /**
   * 获取目标人物直系血脉信息
   */
  @Get('person/:id/lineage')
  @ApiOperation({ summary: '获取目标人物直系血脉信息' })
  async getPersonLineage(@Request() req, @Param('id') id: string) {
    const personId = BigInt(id);
    const clanId = req.user.clanId;
    return this.videoService.getPersonLineage(personId, clanId);
  }

  /**
   * 预览可用素材
   */
  @Get('person/:id/preview')
  @ApiOperation({ summary: '预览可用素材' })
  async previewMaterials(@Request() req, @Param('id') id: string) {
    const personId = BigInt(id);
    const clanId = req.user.clanId;
    return this.videoService.previewMaterials(personId, clanId);
  }

  /**
   * 获取VIP状态
   */
  @Get('vip/status')
  @ApiOperation({ summary: '获取VIP状态' })
  async getVipStatus(@Request() req) {
    return this.videoService.getVipStatus(req.user.userId);
  }

  /**
   * 购买VIP
   */
  @Post('vip/purchase')
  @ApiOperation({ summary: '购买VIP服务' })
  async purchaseVip(@Request() req, @Body() dto: PurchaseVipDto) {
    return this.videoService.purchaseVip(
      req.user.userId,
      dto.order_type,
      dto.amount,
    );
  }

  /**
   * 获取排队状态
   */
  @Get('queue/status')
  @ApiOperation({ summary: '获取排队状态' })
  async getQueueStatus(@Request() req) {
    return this.videoService.getQueueStatus(req.user.userId);
  }
}
