import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '@geneasphere/db';
import sharp from 'sharp';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { Role, NotificationType } from '@prisma/client';
import { CosService } from '../cos/cos.service';
import { ImageProcessorService } from '../cos/image-processor.service';
import { sanitizeUserText } from '../common/sanitize';

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cosService: CosService,
    private readonly imageProcessor: ImageProcessorService,
  ) {}

  // ==================== 资料相关 ====================

  /**
   * 获取用户完整资料（含家族关联）
   */
  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        clans: {
          include: {
            clan: {
              select: {
                id: true,
                name: true,
                slug: true,
                description: true,
                status: true,
                updated_at: true,
              },
            },
          },
        },
        setting: true,
      },
    });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    // 汇总统计
    const [photoCount, annotationCount, orderCount] = await Promise.all([
      this.prisma.mediaArchive.count({ where: { uploader_id: userId } }),
      this.prisma.mediaPersonLink.count({
        where: { media: { uploader_id: userId } },
      }),
      this.prisma.printOrder.count({ where: { user_id: userId } }),
    ]);

    // 找到用户的主家族（最早加入的家族中角色最高的）
    const primaryMembership =
      user.clans.find(
        (m) => m.role === Role.OWNER || m.role === Role.ADMIN,
      ) || user.clans[0];

    return {
      id: user.id,
      phone: this.maskPhone(user.phone),
      phone_raw: user.phone,
      nickname: user.nickname,
      email: user.email,
      gender: user.gender,
      birth_date: user.birth_date,
      avatar_url: user.avatar_url,
      created_at: user.created_at,
      updated_at: user.updated_at,
      primary_clan: primaryMembership
        ? {
            id: primaryMembership.clan.id.toString(),
            name: primaryMembership.clan.name,
            slug: primaryMembership.clan.slug,
            description: primaryMembership.clan.description,
            role: primaryMembership.role,
          }
        : null,
      families: user.clans.map((m) => ({
        id: m.clan.id.toString(),
        name: m.clan.name,
        slug: m.clan.slug,
        description: m.clan.description,
        role: m.role,
        joined_at: m.joined_at,
        last_active_at: m.clan.updated_at,
      })),
      stats: {
        photo_count: photoCount,
        annotation_count: annotationCount,
        order_count: orderCount,
        // 以下为尚未实现的模块，预留字段
        video_count: 0,
        group_count: 0,
      },
      setting: user.setting
        ? {
            allow_cross_clan_friend_finding:
              user.setting.allow_cross_clan_friend_finding,
            show_childhood_location: user.setting.show_childhood_location,
            allow_photo_find_me: user.setting.allow_photo_find_me,
            allow_annotation_for_match:
              user.setting.allow_annotation_for_match,
            enable_in_app_notification:
              user.setting.enable_in_app_notification,
            enable_sms_notification: user.setting.enable_sms_notification,
            phone_bound: user.setting.phone_bound,
          }
        : null,
    };
  }

  /**
   * 更新资料
   */
  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const data: any = {};
    if (dto.nickname !== undefined) data.nickname = sanitizeUserText(dto.nickname);
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.gender !== undefined) data.gender = dto.gender;
    if (dto.birth_date !== undefined) {
      data.birth_date = dto.birth_date ? new Date(dto.birth_date) : null;
    }
    if (dto.avatar_url !== undefined) data.avatar_url = dto.avatar_url;

    const user = await this.prisma.user.update({
      where: { id: userId },
      data,
    });

    return {
      id: user.id,
      nickname: user.nickname,
      email: user.email,
      gender: user.gender,
      birth_date: user.birth_date,
      avatar_url: user.avatar_url,
      updated_at: user.updated_at,
    };
  }

  /**
   * 上传头像
   * 根据 STORAGE_DRIVER 自动选择本地占位或 COS 存储
   */
  async uploadAvatar(userId: string, dataUrl: string): Promise<string> {
    if (!dataUrl || !dataUrl.startsWith('data:image/')) {
      throw new BadRequestException('头像数据格式不正确');
    }

    // 校验大小（≤5MB base64 约等于 6.7MB 文本）
    const sizeInBytes = (dataUrl.length * 3) / 4;
    if (sizeInBytes > 5 * 1024 * 1024) {
      throw new BadRequestException('头像大小不能超过 5MB');
    }

    const match = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!match) {
      throw new BadRequestException('头像格式必须为 base64 data-url');
    }
    const ext = match[1] === 'jpeg' ? 'jpg' : match[1].toLowerCase();
    if (!['jpg', 'png', 'webp'].includes(ext)) {
      throw new BadRequestException('头像仅支持 jpg/png/webp');
    }

    const imageBuffer = Buffer.from(match[2], 'base64');
    const magic = imageBuffer.slice(0, 12);
    const validMagic =
      (magic[0] === 0xff && magic[1] === 0xd8 && magic[2] === 0xff) ||
      (magic[0] === 0x89 && magic[1] === 0x50 && magic[2] === 0x4e && magic[3] === 0x47) ||
      (magic.toString('ascii', 0, 4) === 'RIFF' && magic.toString('ascii', 8, 12) === 'WEBP');
    if (!validMagic) {
      throw new BadRequestException('头像文件内容与图片格式不符');
    }

    const useCos = this.cosService.getDriverType() === 'cos' || process.env.COS_ENABLED === 'true';

    if (useCos) {
      // COS 模式：上传头像至热 Bucket
      const avatarKey = `media/display/avatar/${userId}.${ext}`;
      const result = await this.cosService.uploadFile(avatarKey, imageBuffer, {
        contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
        bucketType: 'hot',
      });
      const avatarUrl = result.url;

      await this.prisma.user.update({
        where: { id: userId },
        data: { avatar_url: avatarUrl },
      });

      return avatarUrl;
    }

    // 本地模式：占位 URL
    const avatarUrl = `/api/user/avatar/${userId}.${ext}`;

    await this.prisma.user.update({
      where: { id: userId },
      data: { avatar_url: avatarUrl },
    });

    return avatarUrl;
  }

  /**
   * 修改密码
   */
  async changePassword(userId: string, dto: ChangePasswordDto) {
    if (dto.new_password !== dto.confirm_password) {
      throw new BadRequestException('两次输入的密码不一致');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    const isValid = await bcrypt.compare(dto.old_password, user.password_hash);
    if (!isValid) {
      throw new BadRequestException('旧密码不正确');
    }

    const newHash = await bcrypt.hash(dto.new_password, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password_hash: newHash },
    });

    return { message: '密码修改成功' };
  }

  /**
   * 注销账号
   */
  async deleteAccount(
    userId: string,
    confirmation: string,
  ): Promise<{ message: string }> {
    if (confirmation !== '确认注销') {
      throw new BadRequestException('请输入"确认注销"以完成操作');
    }

    // 检查是否是某个家族的唯一 OWNER
    const ownedClans = await this.prisma.clan.findMany({
      where: { admin_user_id: userId },
      select: { id: true, name: true },
    });

    if (ownedClans.length > 0) {
      throw new ForbiddenException(
        `您是 ${ownedClans.length} 个家族的所有者，请先转让管理员权限再注销`,
      );
    }

    // 检查是否是某个家族的唯一 OWNER 通过 ClanMember
    const ownerMemberships = await this.prisma.clanMember.findMany({
      where: { user_id: userId, role: Role.OWNER },
      include: { clan: { select: { id: true, name: true } } },
    });
    for (const m of ownerMemberships) {
      const otherOwners = await this.prisma.clanMember.count({
        where: { clan_id: m.clan_id, role: Role.OWNER, NOT: { user_id: userId } },
      });
      if (otherOwners === 0) {
        throw new ForbiddenException(
          `您是家族"${m.clan.name}"的唯一所有者，请先转让管理员权限再注销`,
        );
      }
    }

    // 通知其所属家族的管理员
    const memberships = await this.prisma.clanMember.findMany({
      where: { user_id: userId },
      select: { clan_id: true },
    });

    for (const m of memberships) {
      const admins = await this.prisma.clanMember.findMany({
        where: {
          clan_id: m.clan_id,
          role: { in: [Role.OWNER, Role.ADMIN] },
          NOT: { user_id: userId },
        },
        select: { user_id: true },
      });
      for (const admin of admins) {
        await this.prisma.notification.create({
          data: {
            user_id: admin.user_id,
            clan_id: m.clan_id,
            type: NotificationType.SYSTEM,
            title: '成员注销通知',
            content: '家族内一名成员已申请注销账号，请关注后续数据交接',
          },
        });
      }
    }

    // 实际删除用户（Cascade 会清理关联数据）
    await this.prisma.user.delete({ where: { id: userId } });

    return { message: '账号已注销' };
  }

  // ==================== 媒体/标注/订单 ====================

  /**
   * 用户上传的照片列表
   */
  async listUserPhotos(
    userId: string,
    page: number,
    pageSize: number,
    filters?: { taken_year?: number; clan_id?: string },
  ) {
    const skip = (page - 1) * pageSize;
    const where: any = { uploader_id: userId };
    if (filters?.taken_year) where.taken_year = filters.taken_year;
    if (filters?.clan_id) where.clan_id = BigInt(filters.clan_id);

    const [items, total] = await Promise.all([
      this.prisma.mediaArchive.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: pageSize,
        include: {
          clan: { select: { id: true, name: true } },
        },
      }),
      this.prisma.mediaArchive.count({ where }),
    ]);

    return {
      data: items.map((m) => ({
        id: m.id.toString(),
        file_url: m.file_url,
        taken_year: m.taken_year,
        taken_location: m.taken_location,
        description: m.description,
        media_type: m.media_type,
        created_at: m.created_at,
        clan: m.clan
          ? { id: m.clan.id.toString(), name: m.clan.name }
          : null,
      })),
      pagination: {
        page,
        page_size: pageSize,
        total,
        total_pages: Math.ceil(total / pageSize),
      },
    };
  }

  /**
   * 用户标注列表
   */
  async listUserAnnotations(userId: string, page: number, pageSize: number) {
    const skip = (page - 1) * pageSize;
    const [items, total] = await Promise.all([
      this.prisma.mediaPersonLink.findMany({
        where: { media: { uploader_id: userId } },
        orderBy: { media: { created_at: 'desc' } },
        skip,
        take: pageSize,
        include: {
          media: {
            select: {
              id: true,
              file_url: true,
              taken_year: true,
              taken_location: true,
              description: true,
              created_at: true,
            },
          },
          person: {
            select: {
              id: true,
              full_name: true,
              gender: true,
              birth_date: true,
              death_date: true,
            },
          },
        },
      }),
      this.prisma.mediaPersonLink.count({
        where: { media: { uploader_id: userId } },
      }),
    ]);

    return {
      data: items.map((link) => ({
        link_id: `${link.media_id}_${link.person_id}`,
        relation_note: '',
        relation_status: '已标注',
        media: {
          id: link.media.id.toString(),
          file_url: link.media.file_url,
          taken_year: link.media.taken_year,
          taken_location: link.media.taken_location,
          description: link.media.description,
          created_at: link.media.created_at,
        },
        person: link.person
          ? {
              id: link.person.id.toString(),
              full_name: link.person.full_name,
              gender: link.person.gender,
              birth_date: link.person.birth_date,
              death_date: link.person.death_date,
            }
          : null,
      })),
      pagination: {
        page,
        page_size: pageSize,
        total,
        total_pages: Math.ceil(total / pageSize),
      },
    };
  }

  /**
   * 用户订单列表
   */
  async listUserOrders(
    userId: string,
    page: number,
    pageSize: number,
    status?: string,
  ) {
    const skip = (page - 1) * pageSize;
    const where: any = { user_id: userId };
    if (status) where.status = status;

    const [items, total] = await Promise.all([
      this.prisma.printOrder.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.printOrder.count({ where }),
    ]);

    return {
      data: items.map((o) => ({
        id: o.id.toString(),
        specification: o.specification,
        quantity: o.quantity,
        amount: o.amount,
        status: o.status,
        tracking_no: o.tracking_no,
        tracking_company: o.tracking_company,
        refund_status: o.refund_status,
        created_at: o.created_at,
        updated_at: o.updated_at,
      })),
      pagination: {
        page,
        page_size: pageSize,
        total,
        total_pages: Math.ceil(total / pageSize),
      },
    };
  }

  /**
   * 订单详情
   */
  async getOrderDetail(userId: string, orderId: string) {
    const order = await this.prisma.printOrder.findUnique({
      where: { id: BigInt(orderId) },
    });
    if (!order) {
      throw new NotFoundException('订单不存在');
    }
    if (order.user_id !== userId) {
      throw new ForbiddenException('无权访问此订单');
    }

    return {
      id: order.id.toString(),
      specification: order.specification,
      quantity: order.quantity,
      amount: order.amount,
      status: order.status,
      tracking_no: order.tracking_no,
      tracking_company: order.tracking_company,
      shipping_address: order.shipping_address,
      refund_status: order.refund_status,
      refund_amount: order.refund_amount,
      refund_reason: order.refund_reason,
      refunded_at: order.refunded_at,
      created_at: order.created_at,
      updated_at: order.updated_at,
    };
  }

  // ==================== AI 工具箱 / 小组 / 音像墙（真实查询）====================

  /**
   * AI 工具箱历史：从 ToolUsageLog 读取当前用户实际产生的记录。
   */
  async listToolHistory(userId: string, page: number, pageSize: number) {
    const skip = (page - 1) * pageSize;
    const [rows, total] = await Promise.all([
      this.prisma.toolUsageLog.findMany({
        where: { user_id: userId },
        orderBy: { created_at: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.toolUsageLog.count({ where: { user_id: userId } }),
    ]);

    return {
      data: rows.map((row) => ({
        id: row.id.toString(),
        tool_type: row.tool_type,
        status: row.status,
        credits_used: row.credits_used,
        input_url: row.input_url,
        output_url: row.output_url,
        created_at: row.created_at.toISOString(),
        completed_at: row.completed_at?.toISOString() || null,
      })),
      pagination: {
        page,
        page_size: pageSize,
        total,
        total_pages: Math.ceil(total / pageSize),
      },
    };
  }

  /**
   * 我加入的小组：仅返回当前用户作为成员、且未删除的小组。
   */
  async listUserGroups(userId: string) {
    const memberships = await this.prisma.groupMember.findMany({
      where: { user_id: userId, group: { deleted_at: null } },
      include: {
        group: {
          select: {
            id: true,
            name: true,
            description: true,
            cover_url: true,
            is_public: true,
            created_at: true,
            topics: {
              where: { deleted_at: null },
              select: { id: true, updated_at: true },
              orderBy: { updated_at: 'desc' },
            },
          },
        },
      },
      orderBy: { joined_at: 'desc' },
    });

    return {
      data: memberships.map((m) => ({
        id: m.group.id.toString(),
        name: m.group.name,
        description: m.group.description,
        cover_url: m.group.cover_url,
        is_public: m.group.is_public,
        role: m.role,
        joined_at: m.joined_at.toISOString(),
        last_active_at: m.group.topics[0]?.updated_at?.toISOString() || m.joined_at.toISOString(),
        topic_count: m.group.topics.length,
      })),
    };
  }

  /**
   * 我的音像墙：按 requester_id 读取 VideoProject 的真实状态。
   */
  async listUserVideos(userId: string, page: number, pageSize: number) {
    const skip = (page - 1) * pageSize;
    const [rows, total] = await Promise.all([
      this.prisma.videoProject.findMany({
        where: { requester_id: userId },
        include: {
          target_person: {
            select: { id: true, full_name: true, gender: true, birth_date: true, death_date: true },
          },
          materials: { select: { media_id: true } },
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.videoProject.count({ where: { requester_id: userId } }),
    ]);

    return {
      data: rows.map((row) => ({
        id: row.id.toString(),
        target_person_name: row.target_person?.full_name,
        target_person: row.target_person
          ? {
              id: row.target_person.id.toString(),
              full_name: row.target_person.full_name,
              gender: row.target_person.gender,
              birth_date: row.target_person.birth_date?.toISOString(),
              death_date: row.target_person.death_date?.toISOString(),
            }
          : null,
        status: row.status,
        queue_position: row.queue_position,
        priority: row.priority,
        video_url: row.video_url,
        generated_at: row.completed_at?.toISOString() || row.created_at.toISOString(),
        duration_seconds: row.duration_seconds,
        material_count: row.materials.length,
        style: row.style,
        error_message: row.error_message,
      })),
      pagination: {
        page,
        page_size: pageSize,
        total,
        total_pages: Math.ceil(total / pageSize),
      },
    };
  }

  // ==================== 设置 ====================

  /**
   * 获取设置（不存在则创建默认）
   */
  async getSettings(userId: string) {
    let setting = await this.prisma.userSetting.findUnique({
      where: { user_id: userId },
    });
    if (!setting) {
      setting = await this.prisma.userSetting.create({
        data: { user_id: userId },
      });
    }

    return {
      allow_cross_clan_friend_finding: setting.allow_cross_clan_friend_finding,
      show_childhood_location: setting.show_childhood_location,
      allow_photo_find_me: setting.allow_photo_find_me,
      allow_annotation_for_match: setting.allow_annotation_for_match,
      enable_in_app_notification: setting.enable_in_app_notification,
      enable_sms_notification: setting.enable_sms_notification,
      phone_bound: setting.phone_bound || null,
    };
  }

  /**
   * 更新设置
   */
  async updateSettings(userId: string, dto: UpdateSettingsDto) {
    const data: any = {};
    if (dto.allow_cross_clan_friend_finding !== undefined) {
      data.allow_cross_clan_friend_finding =
        dto.allow_cross_clan_friend_finding;
    }
    if (dto.show_childhood_location !== undefined) {
      data.show_childhood_location = dto.show_childhood_location;
    }
    if (dto.allow_photo_find_me !== undefined) {
      data.allow_photo_find_me = dto.allow_photo_find_me;
    }
    if (dto.allow_annotation_for_match !== undefined) {
      data.allow_annotation_for_match = dto.allow_annotation_for_match;
    }
    if (dto.enable_in_app_notification !== undefined) {
      data.enable_in_app_notification = dto.enable_in_app_notification;
    }
    if (dto.enable_sms_notification !== undefined) {
      data.enable_sms_notification = dto.enable_sms_notification;
    }

    const setting = await this.prisma.userSetting.upsert({
      where: { user_id: userId },
      update: data,
      create: { user_id: userId, ...data },
    });

    return {
      allow_cross_clan_friend_finding: setting.allow_cross_clan_friend_finding,
      show_childhood_location: setting.show_childhood_location,
      allow_photo_find_me: setting.allow_photo_find_me,
      allow_annotation_for_match: setting.allow_annotation_for_match,
      enable_in_app_notification: setting.enable_in_app_notification,
      enable_sms_notification: setting.enable_sms_notification,
      phone_bound: setting.phone_bound,
    };
  }

  // ==================== 通知 ====================

  /**
   * 未读站内信数量
   */
  async getUnreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: { user_id: userId, is_read: false },
    });
    return { unread_count: count };
  }

  /**
   * 通知列表（最近 20 条）
   */
  async listNotifications(userId: string) {
    const items = await this.prisma.notification.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      take: 20,
    });
    return {
      data: items.map((n) => ({
        id: n.id.toString(),
        type: n.type,
        title: n.title,
        content: n.content,
        target_type: n.target_type,
        target_id: n.target_id,
        is_read: n.is_read,
        created_at: n.created_at,
      })),
    };
  }

  /**
   * 标记已读
   */
  async markNotificationRead(userId: string, notificationId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: BigInt(notificationId) },
    });
    if (!notification) {
      throw new NotFoundException('通知不存在');
    }
    if (notification.user_id !== userId) {
      throw new ForbiddenException('无权操作此通知');
    }
    await this.prisma.notification.update({
      where: { id: BigInt(notificationId) },
      data: { is_read: true, read_at: new Date() },
    });
    return { message: '已标记为已读' };
  }

  // ==================== 徽章计数（P0 阶段） ====================

  async getBadgeCounts(userId: string) {
    const membership = await this.prisma.clanMember.findFirst({
      where: { user_id: userId },
      orderBy: [{ joined_at: 'asc' }],
    });
    const clanId = membership?.clan_id ?? null;

    const [
      notificationCount,
      pendingEndorsementCount,
      pendingSessionAsInviterCount,
      pendingModificationCount,
      pendingRelationChangeCount,
      pendingSessionAsScannerCount,
      announcementTotalCount,
      announcementReadCount,
      activeOrderCount,
    ] = await Promise.all([
      this.prisma.notification.count({ where: { user_id: userId, is_read: false } }),
      this.prisma.endorsement.count({
        where: { endorser_user_id: userId, result: null, expire_at: { gt: new Date() } },
      }),
      this.prisma.verificationSession.count({
        where: { inviter_user_id: userId, status: 'PENDING' },
      }),
      this.prisma.personModificationRequest.count({
        where: { requester_user_id: userId, status: 'PENDING' },
      }),
      this.prisma.familyRelationChange.count({
        where: { target_user_id: userId, status: 'pending' },
      }),
      this.prisma.verificationSession.count({
        where: { scanned_user_id: userId, status: 'PENDING' },
      }),
      clanId
        ? this.prisma.clanAnnouncement.count({ where: { clan_id: clanId, is_active: true } })
        : 0,
      clanId
        ? this.prisma.notification.count({
            where: { user_id: userId, target_type: 'CLAN_ANNOUNCEMENT', is_read: true },
          })
        : 0,
      this.prisma.printOrder.count({
        where: { user_id: userId, status: { in: ['PAID', 'PRINTING', 'SHIPPED'] } },
      }),
    ]);

    const verifyTotal =
      pendingEndorsementCount + pendingSessionAsInviterCount + pendingSessionAsScannerCount;
    const applicationsTotal =
      pendingModificationCount + pendingSessionAsScannerCount + pendingRelationChangeCount;
    const announcementsUnread = Math.max(0, announcementTotalCount - announcementReadCount);

    return {
      notifications: notificationCount,
      verify: verifyTotal,
      applications: applicationsTotal,
      announcements: announcementsUnread,
      groups: 0,
      orders: activeOrderCount,
      details: {
        verify_pending_endorsement: pendingEndorsementCount,
        verify_pending_session_as_inviter: pendingSessionAsInviterCount,
        verify_pending_session_as_scanner: pendingSessionAsScannerCount,
        applications_pending_modification: pendingModificationCount,
        applications_pending_relation: pendingRelationChangeCount,
      },
      primary_clan_id: clanId ? clanId.toString() : null,
    };
  }

  // ==================== 我的申请（P0 阶段） ====================

  async listMyApplications(
    userId: string,
    options: {
      category?: 'modification' | 'verification' | 'relation_change';
      status?: string;
      page?: number;
      pageSize?: number;
    } = {},
  ) {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const include = (options.category ? [options.category] : [
      'modification',
      'verification',
      'relation_change',
    ]) as Array<'modification' | 'verification' | 'relation_change'>;

    const buildResult = <T>(rows: T[], total: number, mapper: (row: any) => any) => ({
      data: rows.map(mapper),
      pagination: {
        page,
        page_size: pageSize,
        total,
        total_pages: Math.ceil(total / pageSize),
      },
    });

    const out: Record<string, any> = {};

    if (include.includes('modification')) {
      const where: any = { requester_user_id: userId };
      if (options.status) where.status = options.status;
      const [rows, total] = await Promise.all([
        this.prisma.personModificationRequest.findMany({ where, orderBy: { created_at: 'desc' }, skip, take: pageSize }),
        this.prisma.personModificationRequest.count({ where }),
      ]);
      out.modification = buildResult(rows, total, (r: any) => ({
        id: r.id.toString(),
        category: 'modification',
        person_id: r.person_id.toString(),
        clan_id: r.clan_id.toString(),
        field_name: r.field_name,
        old_value: r.old_value,
        new_value: r.new_value,
        reason: r.reason,
        status: r.status,
        reject_reason: r.reject_reason,
        reviewer_id: r.reviewer_id,
        reviewed_at: r.reviewed_at,
        created_at: r.created_at,
        updated_at: r.updated_at,
      }));
    }

    if (include.includes('verification')) {
      const where: any = {
        OR: [{ inviter_user_id: userId }, { scanned_user_id: userId }],
      };
      if (options.status) where.status = options.status;
      const [rows, total] = await Promise.all([
        this.prisma.verificationSession.findMany({ where, orderBy: { created_at: 'desc' }, skip, take: pageSize }),
        this.prisma.verificationSession.count({ where }),
      ]);
      out.verification = buildResult(rows, total, (r: any) => ({
        id: r.id.toString(),
        category: 'verification',
        clan_id: r.clan_id.toString(),
        qrcode_id: r.qrcode_id?.toString() || null,
        inviter_user_id: r.inviter_user_id,
        scanner_nickname: r.scanner_nickname,
        scanner_phone: r.scanner_phone,
        verify_method: r.verify_method,
        status: r.status,
        matched_person_id: r.matched_person_id?.toString() || null,
        passed_at: r.passed_at,
        fail_reason: r.fail_reason,
        expire_at: r.expire_at,
        created_at: r.created_at,
      }));
    }

    if (include.includes('relation_change')) {
      const where: any = { target_user_id: userId };
      if (options.status) where.status = options.status;
      const [rows, total] = await Promise.all([
        this.prisma.familyRelationChange.findMany({ where, orderBy: { created_at: 'desc' }, skip, take: pageSize }),
        this.prisma.familyRelationChange.count({ where }),
      ]);
      out.relation_change = buildResult(rows, total, (r: any) => ({
        id: r.id.toString(),
        category: 'relation_change',
        clan_id: r.clan_id.toString(),
        person_id: r.person_id.toString(),
        operator_user_id: r.operator_user_id,
        change_type: r.change_type,
        previous_state: r.previous_state,
        current_state: r.current_state,
        privacy_level: r.privacy_level,
        change_reason: r.change_reason,
        status: r.status,
        created_at: r.created_at,
      }));
    }

    return out;
  }

  // ==================== 家族公告（P2：族员只读） ====================

  /**
   * 列出我主家族的 active 公告
   * - 必须先获取主家族；
   * - 过滤 is_active=true 并按置顶/发布时间排序；
   * - 序列化 BigInt。
   */
  async listClanAnnouncements(
    userId: string,
    options: { page?: number; pageSize?: number } = {},
  ) {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const membership = await this.prisma.clanMember.findFirst({
      where: { user_id: userId },
      orderBy: [{ joined_at: 'asc' }],
    });
    if (!membership) {
      return { data: [], pagination: { page, page_size: pageSize, total: 0, total_pages: 0 } };
    }
    const clanId = membership.clan_id;

    const where = { clan_id: clanId, is_active: true };

    const [rows, total, readCount] = await Promise.all([
      this.prisma.clanAnnouncement.findMany({
        where,
        include: {
          creator: { select: { id: true, phone: true, nickname: true } },
        },
        orderBy: [{ is_pinned: 'desc' }, { published_at: 'desc' }, { created_at: 'desc' }],
        skip,
        take: pageSize,
      }),
      this.prisma.clanAnnouncement.count({ where }),
      // 已读列表：target_type=CLAN_ANNOUNCEMENT 且 is_read=true 的 Notification 条数
      this.prisma.notification.findMany({
        where: {
          user_id: userId,
          target_type: 'CLAN_ANNOUNCEMENT',
          is_read: true,
        },
        select: { target_id: true },
      }),
    ]);
    const readSet = new Set(readCount.map((r) => r.target_id));

    const data = rows.map((a) => ({
      id: a.id.toString(),
      title: a.title,
      content: a.content,
      cover_url: a.cover_url,
      is_pinned: a.is_pinned,
      is_active: a.is_active,
      published_at: a.published_at,
      creator_id: a.created_by,
      creator_name: a.creator.nickname || a.creator.phone,
      created_at: a.created_at,
      updated_at: a.updated_at,
      is_read: readSet.has(a.id.toString()),
    }));

    return {
      data,
      pagination: {
        page,
        page_size: pageSize,
        total,
        total_pages: Math.ceil(total / pageSize),
      },
    };
  }

  /**
   * 标记家族公告已读：以 Notification 兼作回写标记
   * - 若同 target_id+target_type 的通知已存在，仅置 is_read=true；
   * - 否则创建一条新通知（type=SYSTEM, target_type=CLAN_ANNOUNCEMENT）。
   */
  async markClanAnnouncementRead(userId: string, announcementId: string) {
    const announcement = await this.prisma.clanAnnouncement.findUnique({
      where: { id: BigInt(announcementId) },
    });
    if (!announcement) {
      throw new NotFoundException('公告不存在');
    }
    // 限定只能读所属家族的公告
    const membership = await this.prisma.clanMember.findFirst({
      where: { user_id: userId, clan_id: announcement.clan_id },
    });
    if (!membership) {
      throw new ForbiddenException('您不是该家族的成员');
    }

    const existing = await this.prisma.notification.findFirst({
      where: {
        user_id: userId,
        target_type: 'CLAN_ANNOUNCEMENT',
        target_id: announcement.id.toString(),
      },
    });
    if (existing) {
      if (!existing.is_read) {
        await this.prisma.notification.update({
          where: { id: existing.id },
          data: { is_read: true, read_at: new Date() },
        });
      }
    } else {
      await this.prisma.notification.create({
        data: {
          user_id: userId,
          clan_id: announcement.clan_id,
          type: NotificationType.SYSTEM,
          title: '家族公告已读',
          content: announcement.title,
          target_type: 'CLAN_ANNOUNCEMENT',
          target_id: announcement.id.toString(),
          is_read: true,
          read_at: new Date(),
        },
      });
    }
    return { message: '已标记为已读' };
  }

  // ==================== 工具方法 ====================

  private maskPhone(phone: string): string {
    if (!phone || phone.length < 7) return phone;
    return phone.slice(0, 3) + '****' + phone.slice(-4);
  }
}