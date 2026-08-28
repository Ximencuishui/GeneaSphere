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
import { PrismaService } from '@geneasphere/db';

@ApiTags('user')
@Controller('api/user')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly prisma: PrismaService,
  ) {}

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
    // 1. MIME 白名单
    if (!/^image\/(jpe?g|png|webp)$/i.test(file.mimetype)) {
      throw new BadRequestException('头像仅支持 jpg/png/webp');
    }
    // 2. 扩展名白名单（防 shell.php.jpg / shell.php\0.jpg 双扩展名绕过）
    const ext = (file.originalname || '').split('.').pop()?.toLowerCase() || '';
    if (!['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
      throw new BadRequestException('头像扩展名仅支持 jpg/png/webp');
    }
    // 3. 魔术字节校验（防 MIME 伪造）
    const magic = file.buffer.slice(0, 12);
    const ok =
      (magic[0] === 0xff && magic[1] === 0xd8 && magic[2] === 0xff) || // JPEG
      (magic[0] === 0x89 && magic[1] === 0x50 && magic[2] === 0x4e && magic[3] === 0x47) || // PNG
      (magic.toString('ascii', 0, 4) === 'RIFF' && magic.toString('ascii', 8, 12) === 'WEBP'); // WEBP
    if (!ok) {
      throw new BadRequestException('头像文件内容与图片格式不符');
    }
    // 4. 文件名清洗（防路径穿越）
    const safeName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException('头像大小不能超过 5MB');
    }
    // 转 base64 data-url 后复用 Service 的统一处理
    const base64 = file.buffer.toString('base64');
    const mime = file.mimetype;
    const dataUrl = `data:${mime};base64,${base64}`;
    const avatarUrl = await this.userService.uploadAvatar(req.user.userId, dataUrl);
    return { avatar_url: avatarUrl, safe_filename: safeName };
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

  // ==================== 工具箱 / 小组 / 音像墙（真实数据）====================

  @Get('tool-history')
  @ApiOperation({ summary: 'AI 工具箱历史（按时间倒序）' })
  async listToolHistory(
    @Request() req,
    @Query('page') pageStr = '1',
    @Query('pageSize') pageSizeStr = '20',
  ) {
    return this.userService.listToolHistory(
      req.user.userId,
      parseInt(pageStr) || 1,
      parseInt(pageSizeStr) || 20,
    );
  }

  @Get('groups')
  @ApiOperation({ summary: '我加入的小组' })
  async listGroups(@Request() req) {
    return this.userService.listUserGroups(req.user.userId);
  }

  @Get('videos')
  @ApiOperation({ summary: '我的音像墙视频' })
  async listVideos(
    @Request() req,
    @Query('page') pageStr = '1',
    @Query('pageSize') pageSizeStr = '20',
  ) {
    return this.userService.listUserVideos(
      req.user.userId,
      parseInt(pageStr) || 1,
      parseInt(pageSizeStr) || 20,
    );
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

  // ==================== P0：徽章计数聚合 ====================

  @Get('badge-counts')
  @ApiOperation({ summary: '用户中心侧边栏徽章聚合计数（notifications/verify/applications/announcements/groups/orders）' })
  async getBadgeCounts(@Request() req) {
    return this.userService.getBadgeCounts(req.user.userId);
  }

  // ==================== P0：我的申请聚合 ====================

  @Get('applications')
  @ApiOperation({ summary: '我的申请聚合（族谱修改 / 验证会话 / 家庭关系变更）' })
  async listMyApplications(
    @Request() req,
    @Query('category') category?: 'modification' | 'verification' | 'relation_change',
    @Query('status') status?: string,
    @Query('page') pageStr = '1',
    @Query('pageSize') pageSizeStr = '20',
  ) {
    return this.userService.listMyApplications(req.user.userId, {
      category,
      status,
      page: parseInt(pageStr) || 1,
      pageSize: parseInt(pageSizeStr) || 20,
    });
  }

  // ==================== P2：家族公告（族员只读） ====================

  @Get('clan-announcements')
  @ApiOperation({ summary: '我所属家族的公告列表（族员只读）' })
  async listClanAnnouncements(
    @Request() req,
    @Query('page') pageStr = '1',
    @Query('pageSize') pageSizeStr = '20',
  ) {
    return this.userService.listClanAnnouncements(req.user.userId, {
      page: parseInt(pageStr) || 1,
      pageSize: parseInt(pageSizeStr) || 20,
    });
  }

  @Post('clan-announcements/:id/read')
  @ApiOperation({ summary: '标记家族公告已读' })
  async markClanAnnouncementRead(@Request() req, @Param('id') id: string) {
    return this.userService.markClanAnnouncementRead(req.user.userId, id);
  }

  // ==================== 家族概况（只读） ====================

  @Get('clan-overview')
  @ApiOperation({ summary: '获取当前用户所属家族的概况（只读）' })
  async getClanOverview(@Request() req) {
    const userId = req.user.userId;
    const profile = await this.userService.getProfile(userId);
    const primaryClan = profile?.primary_clan;
    if (!primaryClan?.slug) {
      return null;
    }

    // 通过 clan slug 查询家族详细信息
    const clan = await this.prisma.clan.findFirst({
      where: { slug: primaryClan.slug },
      include: {
        admin_user: { select: { id: true, phone: true, nickname: true } },
      },
    });

    if (!clan) {
      return null;
    }

    const [councilMembers, revisionTeamMembers] = await Promise.all([
      this.prisma.clanCouncilMember.findMany({
        where: { clan_id: clan.id },
        orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.clanRevisionTeamMember.findMany({
        where: { clan_id: clan.id },
        orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
      }),
    ]);

    const settings = (clan.settings_json as Record<string, any>) || {};

    return {
      clan: {
        id: clan.id.toString(),
        name: clan.name,
        description: clan.description,
        slogan: clan.slogan,
        origin_place: clan.origin_place,
        logo_url: clan.logo_url,
        cover_url: clan.cover_url,
        spirit: clan.spirit,
        rules: clan.rules,
        created_at: clan.created_at,
        updated_at: clan.updated_at,
        admin_user: clan.admin_user
          ? {
              id: clan.admin_user.id,
              name: clan.admin_user.nickname || clan.admin_user.phone,
            }
          : null,
      },
      extra: {
        contact_email: settings.contact_email || '',
        contact_phone: settings.contact_phone || '',
        website: settings.website || '',
        established_year: settings.established_year || '',
        cultural_heritage: settings.cultural_heritage || '',
        notable_figures: settings.notable_figures || '',
      },
      council: councilMembers.map((m) => ({
        id: m.id.toString(),
        name: m.name,
        contact: m.contact,
        position: m.position,
        remark: m.remark,
      })),
      revision_team: revisionTeamMembers.map((m) => ({
        id: m.id.toString(),
        name: m.name,
        contact: m.contact,
        duty: m.duty,
        remark: m.remark,
      })),
    };
  }
}