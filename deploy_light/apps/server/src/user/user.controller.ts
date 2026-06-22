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
  UseInterceptors,
  UploadedFile,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiOperation, ApiTags, ApiConsumes } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UserService } from './user.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@ApiTags('user')
@Controller('api/user')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UserController {
  constructor(private readonly userService: UserService) {}

  // ==================== 资料 ====================

  @Get('profile')
  @ApiOperation({ summary: '获取当前用户资料' })
  async getProfile(@Request() req) {
    return this.userService.getProfile(req.user.userId);
  }

  @Put('profile')
  @ApiOperation({ summary: '更新个人资料' })
  async updateProfile(@Request() req, @Body() dto: UpdateProfileDto) {
    return this.userService.updateProfile(req.user.userId, dto);
  }

  @Post('avatar')
  @ApiOperation({ summary: '上传头像（multipart 模式）' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  async uploadAvatarFile(
    @Request() req,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('请上传头像文件');
    }
    if (!/^image\/(jpe?g|png|webp)$/i.test(file.mimetype)) {
      throw new BadRequestException('头像仅支持 jpg/png/webp');
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException('头像大小不能超过 5MB');
    }
    // 转 base64 data-url 后复用 Service 的统一处理
    const base64 = file.buffer.toString('base64');
    const mime = file.mimetype;
    const dataUrl = `data:${mime};base64,${base64}`;
    const avatarUrl = await this.userService.uploadAvatar(req.user.userId, dataUrl);
    return { avatar_url: avatarUrl };
  }

  @Post('avatar/data-url')
  @ApiOperation({ summary: '上传头像（base64 data-url 模式）' })
  async uploadAvatarDataUrl(
    @Request() req,
    @Body() body: { data_url: string },
  ) {
    if (!body?.data_url) {
      throw new BadRequestException('缺少 data_url');
    }
    const avatarUrl = await this.userService.uploadAvatar(req.user.userId, body.data_url);
    return { avatar_url: avatarUrl };
  }

  // ==================== 密码与注销 ====================

  @Post('password')
  @ApiOperation({ summary: '修改密码' })
  async changePassword(@Request() req, @Body() dto: ChangePasswordDto) {
    return this.userService.changePassword(req.user.userId, dto);
  }

  @Delete('account')
  @ApiOperation({ summary: '注销账号' })
  async deleteAccount(
    @Request() req,
    @Body() body: { confirmation: string },
  ) {
    return this.userService.deleteAccount(
      req.user.userId,
      body?.confirmation || '',
    );
  }

  // ==================== 我的时光 / 标注 / 订单 ====================

  @Get('photos')
  @ApiOperation({ summary: '用户上传的照片列表' })
  async listPhotos(
    @Request() req,
    @Query('page') pageStr = '1',
    @Query('pageSize') pageSizeStr = '20',
    @Query('taken_year') takenYearStr?: string,
    @Query('clan_id') clanId?: string,
  ) {
    const page = parseInt(pageStr) || 1;
    const pageSize = parseInt(pageSizeStr) || 20;
    const taken_year = takenYearStr ? parseInt(takenYearStr) : undefined;
    return this.userService.listUserPhotos(req.user.userId, page, pageSize, {
      taken_year,
      clan_id: clanId,
    });
  }

  @Get('annotations')
  @ApiOperation({ summary: '用户照片标注列表' })
  async listAnnotations(
    @Request() req,
    @Query('page') pageStr = '1',
    @Query('pageSize') pageSizeStr = '20',
  ) {
    const page = parseInt(pageStr) || 1;
    const pageSize = parseInt(pageSizeStr) || 20;
    return this.userService.listUserAnnotations(req.user.userId, page, pageSize);
  }

  @Get('orders')
  @ApiOperation({ summary: '用户订单列表' })
  async listOrders(
    @Request() req,
    @Query('page') pageStr = '1',
    @Query('pageSize') pageSizeStr = '20',
    @Query('status') status?: string,
  ) {
    const page = parseInt(pageStr) || 1;
    const pageSize = parseInt(pageSizeStr) || 20;
    return this.userService.listUserOrders(req.user.userId, page, pageSize, status);
  }

  @Get('orders/:id')
  @ApiOperation({ summary: '订单详情' })
  async getOrderDetail(@Request() req, @Param('id') orderId: string) {
    return this.userService.getOrderDetail(req.user.userId, orderId);
  }

  // ==================== 工具箱 / 小组 / 音像墙 (mock) ====================

  @Get('tool-history')
  @ApiOperation({ summary: 'AI 工具箱历史' })
  async listToolHistory(@Request() req) {
    return this.userService.listToolHistory(req.user.userId);
  }

  @Get('groups')
  @ApiOperation({ summary: '我加入的小组' })
  async listGroups(@Request() req) {
    return this.userService.listUserGroups(req.user.userId);
  }

  @Get('videos')
  @ApiOperation({ summary: '我的音像墙视频' })
  async listVideos(@Request() req) {
    return this.userService.listUserVideos(req.user.userId);
  }

  // ==================== 设置 ====================

  @Get('settings')
  @ApiOperation({ summary: '获取隐私与通知设置' })
  async getSettings(@Request() req) {
    return this.userService.getSettings(req.user.userId);
  }

  @Put('settings')
  @ApiOperation({ summary: '更新设置' })
  async updateSettings(@Request() req, @Body() dto: UpdateSettingsDto) {
    return this.userService.updateSettings(req.user.userId, dto);
  }

  // ==================== 通知 ====================

  @Get('notifications/unread-count')
  @ApiOperation({ summary: '未读站内信数量' })
  async getUnreadCount(@Request() req) {
    return this.userService.getUnreadCount(req.user.userId);
  }

  @Get('notifications')
  @ApiOperation({ summary: '通知列表（最近 20 条）' })
  async listNotifications(@Request() req) {
    return this.userService.listNotifications(req.user.userId);
  }

  @Post('notifications/:id/read')
  @ApiOperation({ summary: '标记通知已读' })
  async markRead(@Request() req, @Param('id') notificationId: string) {
    return this.userService.markNotificationRead(req.user.userId, notificationId);
  }
}