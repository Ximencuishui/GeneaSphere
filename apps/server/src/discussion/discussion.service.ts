import { Injectable } from '@nestjs/common';
import { PrismaService } from '@geneasphere/db';
import { GroupMemberRole, Prisma } from '@prisma/client';

@Injectable()
export class DiscussionService {
  constructor(private readonly prisma: PrismaService) {}

  // ==================== 小组管理 ====================

  async listUserGroups(userId: string) {
    const memberships = await this.prisma.groupMember.findMany({
      where: { user_id: userId },
      include: {
        group: {
          include: {
            _count: {
              select: { members: true, topics: true },
            },
          },
        },
      },
      orderBy: { joined_at: 'desc' },
    });

    const groups = memberships.map((m) => {
      const group = m.group;
      return {
        id: group.id.toString(),
        name: group.name,
        description: group.description,
        cover_url: group.cover_url,
        member_count: group._count.members,
        topic_count: group._count.topics,
        unread_topic_count: 0, // TODO: 实现未读数统计
        last_active_at: group.updated_at.toISOString(),
        my_role: m.role,
      };
    });

    return { data: groups, notice: '功能开发中，部分数据可能不完整' };
  }

  async createGroup(userId: string, data: { name: string; description?: string; is_public?: boolean }) {
    const group = await this.prisma.discussionGroup.create({
      data: {
        name: data.name,
        description: data.description,
        is_public: data.is_public ?? false,
        creator_id: userId,
      },
    });

    // 自动将创建者添加为成员，角色为 CREATOR
    await this.prisma.groupMember.create({
      data: {
        group_id: group.id,
        user_id: userId,
        role: GroupMemberRole.CREATOR,
      },
    });

    return {
      id: group.id.toString(),
      name: group.name,
      description: group.description,
      cover_url: group.cover_url,
      member_count: 1,
      topic_count: 0,
      unread_topic_count: 0,
      last_active_at: group.created_at.toISOString(),
      my_role: 'CREATOR',
    };
  }

  async getGroupById(groupId: bigint, userId: string) {
    const group = await this.prisma.discussionGroup.findFirst({
      where: { id: groupId, deleted_at: null },
      include: {
        _count: { select: { members: true, topics: true } },
        members: {
          include: { group: false },
          where: { user_id: userId },
        },
      },
    });

    if (!group) return null;

    const myMembership = group.members[0];
    return {
      id: group.id.toString(),
      name: group.name,
      description: group.description,
      cover_url: group.cover_url,
      is_public: group.is_public,
      creator_id: group.creator_id,
      member_count: group._count.members,
      topic_count: group._count.topics,
      my_role: myMembership?.role || null,
      created_at: group.created_at.toISOString(),
      updated_at: group.updated_at.toISOString(),
    };
  }

  async updateGroup(groupId: bigint, data: { name?: string; description?: string; cover_url?: string }) {
    const group = await this.prisma.discussionGroup.update({
      where: { id: groupId },
      data: {
        name: data.name,
        description: data.description,
        cover_url: data.cover_url,
      },
    });

    return {
      id: group.id.toString(),
      name: group.name,
      description: group.description,
      cover_url: group.cover_url,
    };
  }

  async deleteGroup(groupId: bigint) {
    // 软删除
    await this.prisma.discussionGroup.update({
      where: { id: groupId },
      data: { deleted_at: new Date() },
    });
  }

  // ==================== 成员管理 ====================

  async listMembers(groupId: bigint) {
    const members = await this.prisma.groupMember.findMany({
      where: { group_id: groupId },
      include: {
        group: false,
      },
      orderBy: [{ role: 'asc' }, { joined_at: 'asc' }],
    });

    // 批量获取用户信息
    const userIds = members.map((m) => m.user_id);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, nickname: true, avatar_url: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    return members.map((m) => {
      const user = userMap.get(m.user_id);
      return {
        user_id: m.user_id,
        nickname: user?.nickname || '未知用户',
        avatar_url: user?.avatar_url,
        role: m.role,
        joined_at: m.joined_at.toISOString(),
      };
    });
  }

  async inviteMembers(groupId: bigint, userIds: string[]) {
    const results = [];
    for (const userId of userIds) {
      try {
        const member = await this.prisma.groupMember.upsert({
          where: { group_id_user_id: { group_id: groupId, user_id: userId } },
          update: {},
          create: {
            group_id: groupId,
            user_id: userId,
            role: GroupMemberRole.MEMBER,
          },
        });
        results.push({ user_id: userId, status: 'success', role: member.role });
      } catch {
        results.push({ user_id: userId, status: 'error', message: '邀请失败' });
      }
    }
    return results;
  }

  async removeMember(groupId: bigint, userId: string) {
    await this.prisma.groupMember.delete({
      where: { group_id_user_id: { group_id: groupId, user_id: userId } },
    });
    return { message: '已移除该成员' };
  }

  async updateMemberRole(groupId: bigint, userId: string, role: string) {
    const member = await this.prisma.groupMember.update({
      where: { group_id_user_id: { group_id: groupId, user_id: userId } },
      data: { role: role as GroupMemberRole },
    });
    return { user_id: userId, role: member.role };
  }

  // ==================== 权限检查 ====================

  async checkMembership(groupId: bigint, userId: string) {
    const member = await this.prisma.groupMember.findUnique({
      where: { group_id_user_id: { group_id: groupId, user_id: userId } },
    });
    if (!member) {
      throw new Error('NOT_MEMBER');
    }
    return member;
  }

  async checkPermission(groupId: bigint, userId: string, allowedRoles: string[]) {
    const member = await this.prisma.groupMember.findUnique({
      where: { group_id_user_id: { group_id: groupId, user_id: userId } },
    });
    if (!member) {
      throw new Error('NOT_MEMBER');
    }
    if (!allowedRoles.includes(member.role)) {
      throw new Error('FORBIDDEN');
    }
    return member;
  }

  async getMemberRole(groupId: bigint, userId: string): Promise<string | null> {
    const member = await this.prisma.groupMember.findUnique({
      where: { group_id_user_id: { group_id: groupId, user_id: userId } },
    });
    return member?.role || null;
  }

  // ==================== 话题管理 ====================

  async listTopics(groupId: bigint, page: number, pageSize: number, keyword?: string) {
    const where: Prisma.GroupTopicWhereInput = {
      group_id: groupId,
      deleted_at: null,
    };

    if (keyword) {
      where.OR = [
        { title: { contains: keyword, mode: 'insensitive' } },
        { content: { contains: keyword, mode: 'insensitive' } },
      ];
    }

    const [topics, total] = await Promise.all([
      this.prisma.groupTopic.findMany({
        where,
        include: {
          author: { select: { id: true, nickname: true, avatar_url: true } },
          _count: { select: { replies: { where: { deleted_at: null } } } },
        },
        orderBy: [{ is_pinned: 'desc' }, { created_at: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.groupTopic.count({ where }),
    ]);

    return {
      data: topics.map((t) => ({
        id: t.id.toString(),
        group_id: t.group_id.toString(),
        author: {
          id: t.author.id,
          nickname: t.author.nickname,
          avatar_url: t.author.avatar_url,
        },
        title: t.title,
        content: t.content,
        reply_count: t._count.replies,
        is_pinned: t.is_pinned,
        created_at: t.created_at.toISOString(),
        updated_at: t.updated_at.toISOString(),
      })),
      pagination: { total, page, pageSize },
    };
  }

  async createTopic(groupId: bigint, authorId: string, data: { title: string; content: string }) {
    const topic = await this.prisma.groupTopic.create({
      data: {
        group_id: groupId,
        author_id: authorId,
        title: data.title,
        content: data.content,
      },
      include: {
        author: { select: { id: true, nickname: true, avatar_url: true } },
      },
    });

    // 更新小组活跃时间
    await this.prisma.discussionGroup.update({
      where: { id: groupId },
      data: { updated_at: new Date() },
    });

    return {
      id: topic.id.toString(),
      group_id: topic.group_id.toString(),
      author: {
        id: topic.author.id,
        nickname: topic.author.nickname,
        avatar_url: topic.author.avatar_url,
      },
      title: topic.title,
      content: topic.content,
      reply_count: 0,
      is_pinned: topic.is_pinned,
      created_at: topic.created_at.toISOString(),
      updated_at: topic.updated_at.toISOString(),
    };
  }

  async getTopicById(topicId: bigint) {
    return this.prisma.groupTopic.findFirst({
      where: { id: topicId, deleted_at: null },
      include: { group: true },
    });
  }

  async getTopicDetail(topicId: bigint, page: number, pageSize: number) {
    const topic = await this.prisma.groupTopic.findUnique({
      where: { id: topicId },
      include: {
        author: { select: { id: true, nickname: true, avatar_url: true } },
        group: { select: { id: true, name: true } },
      },
    });

    if (!topic) return null;

    const [replies, total] = await Promise.all([
      this.prisma.topicReply.findMany({
        where: { topic_id: topicId, deleted_at: null },
        include: {
          author: { select: { id: true, nickname: true, avatar_url: true } },
        },
        orderBy: { created_at: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.topicReply.count({ where: { topic_id: topicId, deleted_at: null } }),
    ]);

    return {
      id: topic.id.toString(),
      group_id: topic.group_id.toString(),
      group_name: topic.group.name,
      author: {
        id: topic.author.id,
        nickname: topic.author.nickname,
        avatar_url: topic.author.avatar_url,
      },
      title: topic.title,
      content: topic.content,
      is_pinned: topic.is_pinned,
      created_at: topic.created_at.toISOString(),
      updated_at: topic.updated_at.toISOString(),
      replies: {
        data: replies.map((r) => ({
          id: r.id.toString(),
          author: {
            id: r.author.id,
            nickname: r.author.nickname,
            avatar_url: r.author.avatar_url,
          },
          content: r.content,
          media_urls: r.media_urls,
          created_at: r.created_at.toISOString(),
        })),
        pagination: { total, page, pageSize },
      },
    };
  }

  async deleteTopic(topicId: bigint) {
    await this.prisma.groupTopic.update({
      where: { id: topicId },
      data: { deleted_at: new Date() },
    });
  }

  async togglePinTopic(topicId: bigint, isPinned: boolean) {
    const topic = await this.prisma.groupTopic.update({
      where: { id: topicId },
      data: { is_pinned: isPinned },
    });
    return { id: topic.id.toString(), is_pinned: topic.is_pinned };
  }

  // ==================== 回复管理 ====================

  async createReply(topicId: bigint, authorId: string, data: { content: string; media_urls?: string[] }) {
    const reply = await this.prisma.topicReply.create({
      data: {
        topic_id: topicId,
        author_id: authorId,
        content: data.content,
        media_urls: data.media_urls || [],
      },
      include: {
        author: { select: { id: true, nickname: true, avatar_url: true } },
      },
    });

    // 更新话题和小组的活跃时间
    await Promise.all([
      this.prisma.groupTopic.update({
        where: { id: topicId },
        data: { updated_at: new Date() },
      }),
      this.prisma.discussionGroup.updateMany({
        where: { topics: { some: { id: topicId } } },
        data: { updated_at: new Date() },
      }),
    ]);

    return {
      id: reply.id.toString(),
      author: {
        id: reply.author.id,
        nickname: reply.author.nickname,
        avatar_url: reply.author.avatar_url,
      },
      content: reply.content,
      media_urls: reply.media_urls,
      created_at: reply.created_at.toISOString(),
    };
  }

  async getReplyById(replyId: bigint) {
    return this.prisma.topicReply.findUnique({
      where: { id: replyId },
      include: { topic: { include: { group: true } } },
    });
  }

  async deleteReply(replyId: bigint) {
    await this.prisma.topicReply.update({
      where: { id: replyId },
      data: { deleted_at: new Date() },
    });
  }

  // ==================== 未读数统计 ====================

  async getUnreadCount(groupId: bigint, userId: string) {
    // TODO: 实现完整的未读数统计逻辑
    // 目前返回 0，后续需要记录用户的最后阅读时间
    return { unread_count: 0 };
  }

  async markGroupAsRead(groupId: bigint, userId: string) {
    // TODO: 实现标记已读逻辑
    // 需要存储用户的最后阅读时间
  }
}