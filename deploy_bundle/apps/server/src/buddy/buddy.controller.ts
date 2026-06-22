import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Query,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BuddyService } from './buddy.service';
import { CreateChildhoodPlaceDto } from './dto/create-childhood-place.dto';
import { FindBuddiesDto } from './dto/find-buddies.dto';
import { RespondMatchDto } from './dto/respond-match.dto';
import { ClaimPhotoDto } from './dto/claim-photo.dto';

@ApiTags('buddy')
@Controller('api/buddy')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class BuddyController {
  constructor(private readonly buddyService: BuddyService) {}

  // ==================== 童年地点管理 ====================

  @Get('childhood-places')
  @ApiOperation({ summary: '获取我的童年地点' })
  async getMyChildhoodPlaces(@Request() req) {
    return this.buddyService.getMyChildhoodPlaces(req.user.userId);
  }

  @Post('childhood-places')
  @ApiOperation({ summary: '创建童年地点' })
  async createChildhoodPlace(
    @Request() req,
    @Body() dto: CreateChildhoodPlaceDto,
  ) {
    return this.buddyService.createChildhoodPlace(req.user.userId, dto);
  }

  @Put('childhood-places/:id')
  @ApiOperation({ summary: '更新童年地点' })
  async updateChildhoodPlace(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: CreateChildhoodPlaceDto,
  ) {
    return this.buddyService.updateChildhoodPlace(
      req.user.userId,
      parseInt(id),
      dto,
    );
  }

  @Delete('childhood-places/:id')
  @ApiOperation({ summary: '删除童年地点' })
  async deleteChildhoodPlace(@Request() req, @Param('id') id: string) {
    return this.buddyService.deleteChildhoodPlace(req.user.userId, parseInt(id));
  }

  // ==================== 寻找小伙伴 ====================

  @Post('find')
  @ApiOperation({ summary: '发起寻找小伙伴' })
  async findBuddies(@Request() req, @Body() dto: FindBuddiesDto) {
    return this.buddyService.findBuddies(req.user.userId, dto);
  }

  @Get('matches')
  @ApiOperation({ summary: '获取我的匹配列表' })
  async getMyMatches(
    @Request() req,
    @Query('status') status?: string,
  ) {
    return this.buddyService.getMyMatches(req.user.userId, status);
  }

  @Get('matches/:id')
  @ApiOperation({ summary: '获取匹配详情' })
  async getMatchDetail(@Request() req, @Param('id') id: string) {
    return this.buddyService.getMatchDetail(req.user.userId, parseInt(id));
  }

  @Post('matches/:matchedUserId/greeting')
  @ApiOperation({ summary: '发送打招呼' })
  async sendGreeting(
    @Request() req,
    @Param('matchedUserId') matchedUserId: string,
    @Body() body: { message?: string; shared_media_id?: number },
  ) {
    return this.buddyService.sendGreeting(
      req.user.userId,
      matchedUserId,
      body.message,
      body.shared_media_id,
    );
  }

  @Post('matches/:id/respond')
  @ApiOperation({ summary: '回应匹配' })
  async respondMatch(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: RespondMatchDto,
  ) {
    return this.buddyService.respondMatch(req.user.userId, parseInt(id), dto);
  }

  // ==================== 照片认领 ====================

  @Post('photo-claim')
  @ApiOperation({ summary: '认领照片' })
  async claimPhoto(@Request() req, @Body() dto: ClaimPhotoDto) {
    return this.buddyService.claimPhoto(req.user.userId, dto);
  }

  @Get('photo-claims')
  @ApiOperation({ summary: '获取我的照片认领' })
  async getMyPhotoClaims(@Request() req) {
    return this.buddyService.getMyPhotoClaims(req.user.userId);
  }

  @Get('media/:mediaId/claims')
  @ApiOperation({ summary: '获取某照片的认领列表' })
  async getPhotoClaims(@Param('mediaId') mediaId: string) {
    return this.buddyService.getPhotoClaims(parseInt(mediaId));
  }

  @Post('photo-claims/:id/approve')
  @ApiOperation({ summary: '审核照片认领（管理员）' })
  async approvePhotoClaim(
    @Param('id') id: string,
    @Body() body: { action: 'approve' | 'reject' },
  ) {
    // TODO: 添加管理员权限检查
    return this.buddyService.approvePhotoClaim(
      'admin', // 暂时使用固定值
      parseInt(id),
      body.action,
    );
  }

  // ==================== 回忆地图 ====================

  @Get('memory-map')
  @ApiOperation({ summary: '获取童年足迹地图数据' })
  async getMemoryMap(@Request() req) {
    return this.buddyService.getMemoryMap(req.user.userId);
  }
}
