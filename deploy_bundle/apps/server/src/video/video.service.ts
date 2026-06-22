import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@geneasphere/db';
import { VideoProjectStatus, VipOrderType } from '@prisma/client';

export interface LineageInfo {
  ancestors: { id: bigint; full_name: string; birth_year?: number; death_year?: number }[];
  descendants: { id: bigint; full_name: string; birth_year?: number; death_year?: number }[];
  total_ancestors: number;
  total_descendants: number;
}

export interface MaterialPreview {
  media_count: number;
  persons: {
    id: bigint;
    full_name: string;
    media_count: number;
  }[];
}

export interface CreateProjectResult {
  id: string;
  queue_position: number;
  estimated_wait_minutes: number;
}

@Injectable()
export class VideoService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 获取目标人物的直系血脉信息
   */
  async getPersonLineage(personId: bigint, clanId: bigint): Promise<LineageInfo> {
    // 获取祖先（通过 PersonAncestry 表向上查找）
    const ancestorLinks = await this.prisma.personAncestry.findMany({
      where: { descendant_id: personId },
      include: {
        ancestor: {
          select: { id: true, full_name: true, birth_date: true, death_date: true },
        },
      },
      orderBy: { depth: 'desc' }, // 由近及远
    });

    // 获取后代（通过 PersonAncestry 表向下查找）
    const descendantLinks = await this.prisma.personAncestry.findMany({
      where: { ancestor_id: personId },
      include: {
        descendant: {
          select: { id: true, full_name: true, birth_date: true, death_date: true },
        },
      },
    });

    const ancestors = ancestorLinks.map((link) => ({
      id: link.ancestor.id,
      full_name: link.ancestor.full_name,
      birth_year: link.ancestor.birth_date ? new Date(link.ancestor.birth_date).getFullYear() : undefined,
      death_year: link.ancestor.death_date ? new Date(link.ancestor.death_date).getFullYear() : undefined,
    }));

    const descendants = descendantLinks.map((link) => ({
      id: link.descendant.id,
      full_name: link.descendant.full_name,
      birth_year: link.descendant.birth_date ? new Date(link.descendant.birth_date).getFullYear() : undefined,
      death_year: link.descendant.death_date ? new Date(link.descendant.death_date).getFullYear() : undefined,
    }));

    return {
      ancestors,
      descendants,
      total_ancestors: ancestors.length,
      total_descendants: descendants.length,
    };
  }

  /**
   * 预览可用的素材（照片）
   */
  async previewMaterials(personId: bigint, clanId: bigint): Promise<MaterialPreview> {
    // 获取目标人物及其直系血脉的所有人ID
    const personIds = await this.getLineagePersonIds(personId);

    if (personIds.length === 0) {
      return { media_count: 0, persons: [] };
    }

    // 查询关联的照片数量
    const mediaLinks = await this.prisma.mediaPersonLink.findMany({
      where: { person_id: { in: personIds } },
      include: {
        media: {
          select: { id: true, file_url: true, taken_year: true, description: true },
        },
        person: {
          select: { id: true, full_name: true },
        },
      },
      orderBy: { media: { taken_year: 'asc' } },
    });

    // 按人物分组统计
    const personMap = new Map<bigint, { id: bigint; full_name: string; media_count: number }>();

    for (const link of mediaLinks) {
      const pid = link.person_id;
      if (!personMap.has(pid)) {
        personMap.set(pid, { id: pid, full_name: link.person.full_name, media_count: 0 });
      }
      personMap.get(pid)!.media_count++;
    }

    return {
      media_count: mediaLinks.length,
      persons: Array.from(personMap.values()),
    };
  }

  /**
   * 创建视频生成项目
   */
  async createProject(
    userId: string,
    clanId: bigint,
    targetPersonId: bigint,
    style: string,
    usePriority: boolean,
  ): Promise<CreateProjectResult> {
    // 验证目标人物存在且属于该家族
    const person = await this.prisma.person.findFirst({
      where: { id: targetPersonId, clan_id: clanId },
    });

    if (!person) {
      throw new BadRequestException('目标人物不存在或不属于当前家族');
    }

    // 检查是否有可用素材
    const materialPreview = await this.previewMaterials(targetPersonId, clanId);
    if (materialPreview.media_count === 0) {
      throw new BadRequestException('目标人物及其直系血脉暂无照片素材，请先上传照片');
    }

    // 检查用户VIP状态
    let isVip = false;
    if (usePriority) {
      isVip = await this.isVipUser(userId);
      if (!isVip) {
        throw new BadRequestException('您尚未开通VIP服务，请先购买');
      }
    }

    // 获取当前排队位置
    const queuePosition = await this.calculateQueuePosition(usePriority || isVip);

    // 创建项目
    const project = await this.prisma.videoProject.create({
      data: {
        clan_id: clanId,
        requester_id: userId,
        target_person_id: targetPersonId,
        status: VideoProjectStatus.queued,
        priority: usePriority || isVip,
        style: style || 'nostalgic',
        queue_position: queuePosition,
      },
    });

    // 创建素材关联（按时间排序）
    const personIds = await this.getLineagePersonIds(targetPersonId);
    const mediaLinks = await this.prisma.mediaPersonLink.findMany({
      where: { person_id: { in: personIds } },
      orderBy: { media: { taken_year: 'asc' } },
    });

    // 限制最多使用50张照片（视频时长限制）
    const limitedLinks = mediaLinks.slice(0, 50);
    if (limitedLinks.length > 0) {
      await this.prisma.videoMaterialLink.createMany({
        data: limitedLinks.map((link, index) => ({
          video_project_id: project.id,
          media_id: link.media_id,
          sequence_order: index + 1,
        })),
      });
    }

    // 估算等待时间（VIP优先，每5分钟处理一个普通任务）
    const estimatedWaitMinutes = usePriority || isVip ? 0 : queuePosition * 5;

    return {
      id: project.id.toString(),
      queue_position: queuePosition,
      estimated_wait_minutes: estimatedWaitMinutes,
    };
  }

  /**
   * 获取用户的视频项目列表
   */
  async listUserProjects(
    userId: string,
    page: number = 1,
    pageSize: number = 10,
  ): Promise<{ data: any[]; pagination: any }> {
    const where = { requester_id: userId };
    const skip = (page - 1) * pageSize;

    const [projects, total] = await Promise.all([
      this.prisma.videoProject.findMany({
        where,
        include: {
          target_person: {
            select: { id: true, full_name: true, gender: true, birth_date: true, death_date: true },
          },
          materials: {
            include: {
              media: { select: { id: true, file_url: true } },
            },
          },
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.videoProject.count({ where }),
    ]);

    const data = projects.map((p) => ({
      id: p.id.toString(),
      target_person: {
        id: p.target_person.id.toString(),
        full_name: p.target_person.full_name,
        gender: p.target_person.gender,
        birth_date: p.target_person.birth_date?.toISOString(),
        death_date: p.target_person.death_date?.toISOString(),
      },
      status: p.status,
      queue_position: p.queue_position,
      priority: p.priority,
      video_url: p.video_url,
      duration_seconds: p.duration_seconds,
      style: p.style,
      material_count: p.materials.length,
      created_at: p.created_at.toISOString(),
      completed_at: p.completed_at?.toISOString(),
      error_message: p.error_message,
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
   * 获取项目详情
   */
  async getProjectDetail(projectId: string, userId: string): Promise<any> {
    const project = await this.prisma.videoProject.findFirst({
      where: { id: BigInt(projectId), requester_id: userId },
      include: {
        target_person: {
          select: { id: true, full_name: true, gender: true, birth_date: true, death_date: true },
        },
        materials: {
          include: {
            media: {
              select: { id: true, file_url: true, taken_year: true, description: true },
            },
          },
          orderBy: { sequence_order: 'asc' },
        },
      },
    });

    if (!project) {
      throw new NotFoundException('项目不存在');
    }

    // 获取当前排队位置
    const currentPosition = await this.getCurrentQueuePosition(project.id);

    return {
      id: project.id.toString(),
      target_person: {
        id: project.target_person.id.toString(),
        full_name: project.target_person.full_name,
        gender: project.target_person.gender,
        birth_date: project.target_person.birth_date?.toISOString(),
        death_date: project.target_person.death_date?.toISOString(),
      },
      status: project.status,
      queue_position: currentPosition,
      priority: project.priority,
      video_url: project.video_url,
      duration_seconds: project.duration_seconds,
      style: project.style,
      materials: project.materials.map((m) => ({
        media_id: m.media_id.toString(),
        file_url: m.media.file_url,
        taken_year: m.media.taken_year,
        description: m.media.description,
        sequence_order: m.sequence_order,
      })),
      material_count: project.materials.length,
      created_at: project.created_at.toISOString(),
      completed_at: project.completed_at?.toISOString(),
      error_message: project.error_message,
    };
  }

  /**
   * 取消项目
   */
  async cancelProject(projectId: string, userId: string): Promise<void> {
    const project = await this.prisma.videoProject.findFirst({
      where: { id: BigInt(projectId), requester_id: userId },
    });

    if (!project) {
      throw new NotFoundException('项目不存在');
    }

    if (project.status !== VideoProjectStatus.queued) {
      throw new BadRequestException('只能取消排队中的项目');
    }

    await this.prisma.videoProject.delete({
      where: { id: BigInt(projectId) },
    });
  }

  /**
   * 删除项目
   */
  async deleteProject(projectId: string, userId: string): Promise<void> {
    const project = await this.prisma.videoProject.findFirst({
      where: { id: BigInt(projectId), requester_id: userId },
    });

    if (!project) {
      throw new NotFoundException('项目不存在');
    }

    // 删除素材关联
    await this.prisma.videoMaterialLink.deleteMany({
      where: { video_project_id: BigInt(projectId) },
    });

    // 删除项目
    await this.prisma.videoProject.delete({
      where: { id: BigInt(projectId) },
    });
  }

  /**
   * 获取VIP状态
   */
  async getVipStatus(userId: string): Promise<{ is_vip: boolean; expires_at?: string; order_type?: string }> {
    const order = await this.prisma.videoVipOrder.findFirst({
      where: {
        user_id: userId,
        expires_at: { gt: new Date() },
      },
      orderBy: { expires_at: 'desc' },
    });

    if (!order) {
      return { is_vip: false };
    }

    return {
      is_vip: true,
      expires_at: order.expires_at?.toISOString(),
      order_type: order.order_type,
    };
  }

  /**
   * 购买VIP（简化实现）
   */
  async purchaseVip(userId: string, orderType: VipOrderType, amount: number): Promise<{ success: boolean; message: string }> {
    // 简化实现：直接创建VIP订单
    const prices: Record<string, number> = {
      single: 9.9,
      monthly: 29.9,
      yearly: 199,
    };

    const expectedPrice = prices[orderType];
    if (!expectedPrice || Math.abs(amount - expectedPrice) > 0.01) {
      throw new BadRequestException(`支付金额不正确，${orderType}价格为 ¥${expectedPrice}`);
    }

    // 计算过期时间
    let expiresAt: Date | null = null;
    const now = new Date();
    switch (orderType) {
      case VipOrderType.single:
        expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7天
        break;
      case VipOrderType.monthly:
        expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30天
        break;
      case VipOrderType.yearly:
        expiresAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000); // 365天
        break;
    }

    await this.prisma.videoVipOrder.create({
      data: {
        user_id: userId,
        order_type: orderType,
        amount: amount,
        expires_at: expiresAt,
      },
    });

    return {
      success: true,
      message: 'VIP购买成功',
    };
  }

  /**
   * 获取排队状态
   */
  async getQueueStatus(userId: string): Promise<{ position: number; estimated_wait_minutes: number }> {
    // 获取用户最新的排队中项目
    const project = await this.prisma.videoProject.findFirst({
      where: {
        requester_id: userId,
        status: VideoProjectStatus.queued,
      },
      orderBy: { created_at: 'asc' },
    });

    if (!project) {
      return { position: 0, estimated_wait_minutes: 0 };
    }

    const position = await this.getCurrentQueuePosition(project.id);
    return {
      position,
      estimated_wait_minutes: project.priority ? 0 : position * 5,
    };
  }

  // ==================== 私有方法 ====================

  /**
   * 获取目标人物及其直系血脉的所有人ID
   */
  private async getLineagePersonIds(personId: bigint): Promise<bigint[]> {
    const ids = new Set<bigint>();
    ids.add(personId);

    // 获取祖先
    const ancestors = await this.prisma.personAncestry.findMany({
      where: { descendant_id: personId },
      select: { ancestor_id: true },
    });
    ancestors.forEach((a) => ids.add(a.ancestor_id));

    // 获取后代
    const descendants = await this.prisma.personAncestry.findMany({
      where: { ancestor_id: personId },
      select: { descendant_id: true },
    });
    descendants.forEach((d) => ids.add(d.descendant_id));

    return Array.from(ids);
  }

  /**
   * 计算队列位置
   */
  private async calculateQueuePosition(isPriority: boolean): Promise<number> {
    const count = await this.prisma.videoProject.count({
      where: {
        status: VideoProjectStatus.queued,
        priority: isPriority ? undefined : false, // 非VIP只看非优先
      },
    });
    return count + 1;
  }

  /**
   * 获取当前排队位置
   */
  private async getCurrentQueuePosition(projectId: bigint): Promise<number> {
    const project = await this.prisma.videoProject.findUnique({
      where: { id: projectId },
    });

    if (!project || project.status !== VideoProjectStatus.queued) {
      return 0;
    }

    // 计算前面有多少个任务
    const aheadCount = await this.prisma.videoProject.count({
      where: {
        status: VideoProjectStatus.queued,
        created_at: { lt: project.created_at },
        priority: project.priority ? undefined : false, // 非VIP只看非优先
      },
    });

    return aheadCount + 1;
  }

  /**
   * 检查用户是否为VIP
   */
  private async isVipUser(userId: string): Promise<boolean> {
    const order = await this.prisma.videoVipOrder.findFirst({
      where: {
        user_id: userId,
        expires_at: { gt: new Date() },
      },
    });
    return !!order;
  }
}
