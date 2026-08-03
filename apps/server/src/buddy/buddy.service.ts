import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@geneasphere/db';
import { CreateChildhoodPlaceDto } from './dto/create-childhood-place.dto';
import { FindBuddiesDto } from './dto/find-buddies.dto';
import { RespondMatchDto } from './dto/respond-match.dto';
import { ClaimPhotoDto } from './dto/claim-photo.dto';
import { BuddyMatchStatus, PhotoClaimStatus, NotificationType } from '@prisma/client';

@Injectable()
export class BuddyService {
  constructor(private readonly prisma: PrismaService) {}

  // ==================== 童年地点管理 ====================

  /**
   * 获取我的童年地点
   */
  async getMyChildhoodPlaces(userId: string) {
    return this.prisma.childhoodPlace.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
    });
  }

  /**
   * 创建童年地点
   */
  async createChildhoodPlace(userId: string, dto: CreateChildhoodPlaceDto) {
    return this.prisma.childhoodPlace.create({
      data: {
        user_id: userId,
        location_name: dto.location_name,
        lat: dto.lat,
        lng: dto.lng,
        start_age: dto.start_age,
        end_age: dto.end_age,
        period_description: dto.period_description,
      },
    });
  }

  /**
   * 更新童年地点
   */
  async updateChildhoodPlace(
    userId: string,
    placeId: number,
    dto: CreateChildhoodPlaceDto,
  ) {
    const place = await this.prisma.childhoodPlace.findFirst({
      where: { id: BigInt(placeId), user_id: userId },
    });

    if (!place) {
      throw new NotFoundException('童年地点不存在');
    }

    return this.prisma.childhoodPlace.update({
      where: { id: BigInt(placeId) },
      data: {
        location_name: dto.location_name,
        lat: dto.lat,
        lng: dto.lng,
        start_age: dto.start_age,
        end_age: dto.end_age,
        period_description: dto.period_description,
      },
    });
  }

  /**
   * 删除童年地点
   */
  async deleteChildhoodPlace(userId: string, placeId: number) {
    const place = await this.prisma.childhoodPlace.findFirst({
      where: { id: BigInt(placeId), user_id: userId },
    });

    if (!place) {
      throw new NotFoundException('童年地点不存在');
    }

    await this.prisma.childhoodPlace.delete({
      where: { id: BigInt(placeId) },
    });

    return { success: true };
  }

  // ==================== 匹配算法 ====================

  /**
   * 寻找小伙伴（核心匹配算法）
   */
  async findBuddies(userId: string, dto: FindBuddiesDto) {
    // 1. 获取用户的隐私设置
    const userSetting = await this.prisma.userSetting.findUnique({
      where: { user_id: userId },
    });

    const allowCrossClan =
      dto.allow_cross_clan !== false &&
      userSetting?.allow_cross_clan_friend_finding !== false;

    // 2. 获取用户的童年地点（如果未提供参数）
    let childhoodPlaces: any[] = [];
    if (!dto.location_name) {
      childhoodPlaces = await this.prisma.childhoodPlace.findMany({
        where: { user_id: userId },
      });
    } else {
      childhoodPlaces = [
        {
          location_name: dto.location_name,
          lat: dto.lat,
          lng: dto.lng,
          start_age: 5,
          end_age: 15,
        },
      ];
    }

    if (childhoodPlaces.length === 0) {
      throw new BadRequestException('请先添加童年地点信息');
    }

    // 3. 获取用户出生年份
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { birth_date: true },
    });

    const userBirthYear = user?.birth_date
      ? new Date(user.birth_date).getFullYear()
      : null;

    // 4. 查找匹配的用户
    const matches: any[] = [];

    for (const place of childhoodPlaces) {
      // 计算童年年份范围
      const childhoodStartYear = userBirthYear
        ? userBirthYear + (place.start_age || 5)
        : dto.start_year || 1985;
      const childhoodEndYear = userBirthYear
        ? userBirthYear + (place.end_age || 15)
        : dto.end_year || 1995;

      // 查找在同一地点生活过的其他用户
      const otherPlaces = await this.prisma.childhoodPlace.findMany({
        where: {
          location_name: {
            contains: place.location_name,
            mode: 'insensitive',
          },
          user_id: { not: userId },
        },
        include: {
          user: {
            select: {
              id: true,
              nickname: true,
              avatar_url: true,
              birth_date: true,
              setting: {
                select: {
                  allow_cross_clan_friend_finding: true,
                  show_childhood_location: true,
                },
              },
            },
          },
        },
      });

      // 计算匹配分数
      for (const otherPlace of otherPlaces) {
        const otherUser = otherPlace.user;

        // 检查隐私设置
        if (!otherUser.setting?.allow_cross_clan_friend_finding && !allowCrossClan) {
          continue;
        }

        const otherBirthYear = otherUser.birth_date
          ? new Date(otherUser.birth_date).getFullYear()
          : null;

        if (!otherBirthYear) continue;

        const otherChildhoodStart = otherBirthYear + (otherPlace.start_age || 5);
        const otherChildhoodEnd = otherBirthYear + (otherPlace.end_age || 15);

        // 检查年代是否有交集
        const hasTimeOverlap =
          childhoodStartYear <= otherChildhoodEnd &&
          childhoodEndYear >= otherChildhoodStart;

        if (!hasTimeOverlap) continue;

        // 计算年龄差
        const ageDiff = Math.abs(userBirthYear - otherBirthYear);

        // 计算匹配分数
        let score = 0;
        const reasons: string[] = [];

        // 地点重合: 50%
        score += 50;
        reasons.push(`你们都在${place.location_name}生活过`);

        // 年代重合: 30%
        if (ageDiff <= 5) {
          score += 30;
          reasons.push('你们是同龄人');
        } else if (ageDiff <= 8) {
          score += 20;
        } else {
          score += 10;
        }

        // 照片交集: 20% (简化版，暂不实现)
        // TODO: 查询 media_person_links 检查是否有共同照片

        // 检查是否已经打过招呼
        const existingRecord = await this.prisma.buddyMatchRecord.findFirst({
          where: {
            OR: [
              {
                requester_id: userId,
                matched_user_id: otherUser.id,
              },
              {
                requester_id: otherUser.id,
                matched_user_id: userId,
              },
            ],
            status: {
              in: [
                BuddyMatchStatus.PENDING,
                BuddyMatchStatus.ACCEPTED,
              ],
            },
          },
        });

        if (existingRecord) continue; // 已存在匹配记录，跳过

        matches.push({
          matched_user: {
            id: otherUser.id,
            nickname: otherUser.nickname || '匿名用户',
            avatar_url: otherUser.avatar_url,
          },
          match_score: score,
          match_reasons: reasons,
          shared_media_id: null,
          location: place.location_name,
          period: `${childhoodStartYear}-${childhoodEndYear}`,
        });
      }
    }

    // 按分数降序排序
    matches.sort((a, b) => b.match_score - a.match_score);

    return matches.slice(0, 50); // 最多返回 50 个结果
  }

  // ==================== 打招呼与回应 ====================

  /**
   * 发送打招呼
   */
  async sendGreeting(
    userId: string,
    matchedUserId: string,
    message?: string,
    sharedMediaId?: number,
  ) {
    // 检查是否已经打过招呼
    const existing = await this.prisma.buddyMatchRecord.findFirst({
      where: {
        requester_id: userId,
        matched_user_id: matchedUserId,
      },
    });

    if (existing) {
      throw new BadRequestException('已经向该用户发送过打招呼消息');
    }

    // 创建匹配记录
    const record = await this.prisma.buddyMatchRecord.create({
      data: {
        requester_id: userId,
        matched_user_id: matchedUserId,
        match_score: 0,
        match_reasons: { location: '未知' },
        shared_media_id: sharedMediaId ? BigInt(sharedMediaId) : null,
        status: BuddyMatchStatus.PENDING,
        greeting_message: message || '你好，我们可能是儿时伙伴，还记得我吗？',
        contacted_at: new Date(),
      },
    });

    // 发送站内信通知
    await this.prisma.notification.create({
      data: {
        user_id: matchedUserId,
        type: NotificationType.BUDDY_MATCH_GREETING,
        title: '收到来自儿时伙伴的打招呼',
        content: `有人认出了你，快来看看吧！`,
        target_type: 'buddy_match',
        target_id: record.id.toString(),
      },
    });

    return record;
  }

  /**
   * 回应匹配
   */
  async respondMatch(userId: string, recordId: number, dto: RespondMatchDto) {
    const record = await this.prisma.buddyMatchRecord.findFirst({
      where: {
        id: BigInt(recordId),
        matched_user_id: userId,
        status: BuddyMatchStatus.PENDING,
      },
    });

    if (!record) {
      throw new NotFoundException('匹配记录不存在');
    }

    let newStatus: BuddyMatchStatus;
    let notificationType: NotificationType;

    switch (dto.action) {
      case 'accept':
        newStatus = BuddyMatchStatus.ACCEPTED;
        notificationType = NotificationType.BUDDY_MATCH_ACCEPTED;
        break;
      case 'decline':
        newStatus = BuddyMatchStatus.DECLINED;
        notificationType = NotificationType.BUDDY_MATCH_DECLINED;
        break;
      case 'ignore':
        newStatus = BuddyMatchStatus.IGNORED;
        return { success: true };
      default:
        throw new BadRequestException('无效的操作');
    }

    const updated = await this.prisma.buddyMatchRecord.update({
      where: { id: BigInt(recordId) },
      data: {
        status: newStatus,
        responded_at: new Date(),
      },
    });

    // 发送通知给发起人
    await this.prisma.notification.create({
      data: {
        user_id: record.requester_id,
        type: notificationType,
        title:
          dto.action === 'accept'
            ? '小伙伴接受了你的打招呼'
            : '小伙伴婉拒了你的打招呼',
        content:
          dto.action === 'accept'
            ? '你们已经成为儿时伙伴，可以互相查看联系方式了！'
            : '对方暂时不想联系，尊重对方的选择吧。',
        target_type: 'buddy_match',
        target_id: recordId.toString(),
      },
    });

    return updated;
  }

  /**
   * 获取我作为被匹配方的记录（谁在找我）
   * - 明确只返回 matched_user_id = currentUser 的 PENDING/ACCEPTED 记录
   * - 复用现有 BuddyMatch 状态机，UI 上可执行 accept/decline/ignore
   */
  async getInboundMatches(userId: string, status?: string) {
    const whereClause: any = {
      matched_user_id: userId,
    };
    if (status) {
      whereClause.status = status;
    }
    return this.prisma.buddyMatchRecord.findMany({
      where: whereClause,
      include: {
        requester: {
          select: {
            id: true,
            nickname: true,
            avatar_url: true,
            birth_date: true,
          },
        },
        matched_user: {
          select: {
            id: true,
            nickname: true,
            avatar_url: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  /**
   * 按照片找：上传照片后，在尊重 allow_photo_find_me 隐私设置的前提下，
   * 查找曾被标记/上传到同一张或同时期同地点照片的家族成员与跨家族伙伴
   * - 仅返回开启了 allow_photo_find_me 隐私的用户
   * - 跨家族匹配需双方都允许 allow_cross_clan_friend_finding
   */
  async findByPhoto(
    userId: string,
    dto: { media_id?: number; taken_year?: number; taken_location?: string },
  ) {
    // 读取当前用户的隐私设置
    const userSetting = await this.prisma.userSetting.findUnique({
      where: { user_id: userId },
    });
    const allowCrossClan =
      userSetting?.allow_cross_clan_friend_finding !== false;

    // 收集候选照片 ID：指定的媒体 + 同年同地的家族照片
    const targetMediaIds: bigint[] = [];
    if (dto.media_id) {
      targetMediaIds.push(BigInt(dto.media_id));
    }

    if (dto.taken_year || dto.taken_location) {
      const where: any = { deleted_at: null };
      if (dto.taken_year) where.taken_year = dto.taken_year;
      if (dto.taken_location) {
        where.taken_location = { contains: dto.taken_location };
      }
      const candidates = await this.prisma.mediaArchive.findMany({
        where,
        select: { id: true, taken_year: true, taken_location: true, file_url: true, thumb_url: true },
        take: 200,
      });
      for (const c of candidates) targetMediaIds.push(c.id);
    }

    if (targetMediaIds.length === 0) {
      throw new BadRequestException('请提供 media_id 或同时提供 taken_year/taken_location');
    }

    // 查找这些照片关联到的人物（不区分人物族属，先收集，再做隐私过滤）
    // Person -> PersonUserLink -> User 间接关联
    const personLinks = await this.prisma.mediaPersonLink.findMany({
      where: { media_id: { in: targetMediaIds } },
      include: {
        person: {
          select: {
            id: true,
            full_name: true,
            clan_id: true,
            user_links: {
              select: {
                user: {
                  select: {
                    id: true,
                    nickname: true,
                    avatar_url: true,
                    birth_date: true,
                    setting: {
                      select: {
                        allow_photo_find_me: true,
                        allow_cross_clan_friend_finding: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        media: {
          select: {
            id: true,
            file_url: true,
            thumb_url: true,
            taken_year: true,
            taken_location: true,
          },
        },
      },
      take: 200,
    });

    const candidatesMap = new Map<string, any>();
    for (const link of personLinks) {
      for (const userLink of link.person.user_links ?? []) {
        const linkedUser = userLink.user;
        if (!linkedUser) continue;
        if (linkedUser.id === userId) continue;
        if (linkedUser.setting?.allow_photo_find_me === false) continue;
        if (!allowCrossClan) {
          if (linkedUser.setting?.allow_cross_clan_friend_finding === false) continue;
        }
        const userIdStr = String(linkedUser.id);
        const existing = candidatesMap.get(userIdStr);
        if (!existing) {
          candidatesMap.set(userIdStr, {
            matched_user: {
              id: linkedUser.id,
              nickname: linkedUser.nickname || link.person.full_name || '匿名用户',
              avatar_url: linkedUser.avatar_url,
              birth_date: linkedUser.birth_date,
            },
            shared_photos: [
              {
                media_id: link.media.id,
                file_url: link.media.thumb_url || link.media.file_url,
                taken_year: link.media.taken_year,
                taken_location: link.media.taken_location,
              },
            ],
            match_reasons: [`共同出现在照片 #${link.media.id} 中`],
          });
        } else {
          if (!existing.shared_photos.find((p: any) => p.media_id === link.media.id)) {
            existing.shared_photos.push({
              media_id: link.media.id,
              file_url: link.media.thumb_url || link.media.file_url,
              taken_year: link.media.taken_year,
              taken_location: link.media.taken_location,
            });
            existing.match_reasons.push(`共同出现在照片 #${link.media.id} 中`);
          }
        }
      }
    }

    return Array.from(candidatesMap.values()).slice(0, 50);
  }

  /**
   * 获取我的匹配列表
   */
  async getMyMatches(userId: string, status?: string) {
    const whereClause: any = {
      OR: [
        { requester_id: userId },
        { matched_user_id: userId },
      ],
    };

    if (status) {
      whereClause.status = status;
    }

    return this.prisma.buddyMatchRecord.findMany({
      where: whereClause,
      include: {
        requester: {
          select: {
            id: true,
            nickname: true,
            avatar_url: true,
          },
        },
        matched_user: {
          select: {
            id: true,
            nickname: true,
            avatar_url: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  /**
   * 获取匹配详情
   */
  async getMatchDetail(userId: string, recordId: number) {
    const record = await this.prisma.buddyMatchRecord.findFirst({
      where: {
        id: BigInt(recordId),
        OR: [
          { requester_id: userId },
          { matched_user_id: userId },
        ],
      },
      include: {
        requester: {
          select: {
            id: true,
            nickname: true,
            avatar_url: true,
            birth_date: true,
          },
        },
        matched_user: {
          select: {
            id: true,
            nickname: true,
            avatar_url: true,
            birth_date: true,
          },
        },
      },
    });

    if (!record) {
      throw new NotFoundException('匹配记录不存在');
    }

    return record;
  }

  // ==================== 照片认领 ====================

  /**
   * 认领照片
   */
  async claimPhoto(userId: string, dto: ClaimPhotoDto) {
    // 检查照片是否存在
    const media = await this.prisma.mediaArchive.findUnique({
      where: { id: BigInt(dto.media_id) },
    });

    if (!media) {
      throw new NotFoundException('照片不存在');
    }

    // 检查是否已经认领过
    const existing = await this.prisma.photoClaimRecord.findFirst({
      where: {
        media_id: BigInt(dto.media_id),
        claimer_user_id: userId,
        status: PhotoClaimStatus.PENDING,
      },
    });

    if (existing) {
      throw new BadRequestException('你已经认领过这张照片，请等待审核');
    }

    return this.prisma.photoClaimRecord.create({
      data: {
        media_id: BigInt(dto.media_id),
        claimer_user_id: userId,
        position_description: dto.position_description,
        status: PhotoClaimStatus.PENDING,
      },
    });
  }

  /**
   * 获取我的照片认领
   */
  async getMyPhotoClaims(userId: string) {
    return this.prisma.photoClaimRecord.findMany({
      where: { claimer_user_id: userId },
      include: {
        claimer: {
          select: {
            id: true,
            nickname: true,
            avatar_url: true,
          },
        },
        // 关联媒体表，方便前端展示缩略图
        media: {
          select: {
            id: true,
            file_url: true,
            thumb_url: true,
            taken_year: true,
            taken_location: true,
            description: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  /**
   * 获取某照片的认领列表
   */
  async getPhotoClaims(mediaId: number) {
    return this.prisma.photoClaimRecord.findMany({
      where: { media_id: BigInt(mediaId) },
      include: {
        claimer: {
          select: {
            id: true,
            nickname: true,
            avatar_url: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  /**
   * 审核照片认领（管理员）
   */
  async approvePhotoClaim(
    adminId: string,
    claimId: number,
    action: 'approve' | 'reject',
  ) {
    const claim = await this.prisma.photoClaimRecord.findUnique({
      where: { id: BigInt(claimId) },
    });

    if (!claim) {
      throw new NotFoundException('认领记录不存在');
    }

    const newStatus =
      action === 'approve'
        ? PhotoClaimStatus.APPROVED
        : PhotoClaimStatus.REJECTED;

    const updated = await this.prisma.photoClaimRecord.update({
      where: { id: BigInt(claimId) },
      data: {
        status: newStatus,
        verified_by: adminId,
      },
    });

    // 发送通知
    await this.prisma.notification.create({
      data: {
        user_id: claim.claimer_user_id,
        type:
          action === 'approve'
            ? NotificationType.PHOTO_CLAIM_APPROVED
            : NotificationType.PHOTO_CLAIM_REJECTED,
        title:
          action === 'approve'
            ? '照片认领审核通过'
            : '照片认领审核未通过',
        content:
          action === 'approve'
            ? '你的照片认领已通过审核！'
            : '你的照片认领未通过审核，请核实后重新提交。',
        target_type: 'photo_claim',
        target_id: claimId.toString(),
      },
    });

    return updated;
  }

  // ==================== 回忆地图 ====================

  /**
   * 获取童年足迹地图数据
   */
  async getMemoryMap(userId: string) {
    // 获取用户的童年地点
    const places = await this.prisma.childhoodPlace.findMany({
      where: { user_id: userId },
    });

    // 获取匹配到的伙伴的位置（简化版）
    const matches = await this.prisma.buddyMatchRecord.findMany({
      where: {
        OR: [
          { requester_id: userId, status: BuddyMatchStatus.ACCEPTED },
          { matched_user_id: userId, status: BuddyMatchStatus.ACCEPTED },
        ],
      },
      include: {
        requester: {
          select: {
            id: true,
            nickname: true,
          },
        },
        matched_user: {
          select: {
            id: true,
            nickname: true,
          },
        },
      },
    });

    return {
      my_places: places,
      matched_buddies: matches,
    };
  }
}
