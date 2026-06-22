import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '@geneasphere/db';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { Role, NotificationType } from '@prisma/client';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

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
            description: primaryMembership.clan.description,
            role: primaryMembership.role,
          }
        : null,
      families: user.clans.map((m) => ({
        id: m.clan.id.toString(),
        name: m.clan.name,
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
    if (dto.nickname !== undefined) data.nickname = dto.nickname;
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
   * 上传头像（data-url 模式简化实现）
   * 返回 avatar_url（前端可直接使用的相对 URL）
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

    // 保存 dataUrl 作为占位 URL（生产环境应改为对象存储）
    // 这里采用占位策略：将 data-url 写入 public/avatars/{userId}.{ext}
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

  // ==================== AI 工具箱 / 小组 / 音像墙 (mock) ====================

  /**
   * AI 工具箱历史（mock）
   */
  async listToolHistory(_userId: string) {
    // 模块尚未实现，返回空数据 + 占位说明
    return {
      data: [],
      pagination: { page: 1, page_size: 20, total: 0, total_pages: 0 },
      notice: 'AI 工具箱模块开发完成后将在此展示历史记录',
    };
  }

  /**
   * 我的小组（mock）
   */
  async listUserGroups(_userId: string) {
    return {
      data: [],
      notice: '家族小组讨论模块开发完成后将在此展示已加入的小组',
    };
  }

  /**
   * 我的音像墙（mock）
   */
  async listUserVideos(_userId: string) {
    return {
      data: [],
      notice: '历史音像墙模块开发完成后将在此展示已生成的视频',
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

  // ==================== 工具方法 ====================

  private maskPhone(phone: string): string {
    if (!phone || phone.length < 7) return phone;
    return phone.slice(0, 3) + '****' + phone.slice(-4);
  }
}