import request from '@/utils/request';
import type {
  DiscussionGroup,
  GroupMember,
  GroupTopic,
  TopicDetail,
  TopicReply,
  DiscussionSummary,
  SummaryVersion,
  Pagination,
} from '@/types';

const trimId = (s: string | number) => String(s);

/** 小组讨论 API 封装 */
export const discussionApi = {
  // ========== 小组管理 ==========
  groups: {
    /** 获取我加入的小组列表 */
    list: () =>
      request.get<{ data: DiscussionGroup[]; notice?: string }>(
        '/api/discussion/groups',
      ),

    /** 创建小组 */
    create: (data: { name: string; description?: string; is_public?: boolean }) =>
      request.post<DiscussionGroup>('/api/discussion/groups', data),

    /** 获取小组详情 */
    getById: (id: string | number) =>
      request.get<DiscussionGroup>(`/api/discussion/groups/${trimId(id)}`),

    /** 更新小组信息 */
    update: (
      id: string | number,
      data: { name?: string; description?: string; cover_url?: string },
    ) => request.patch(`/api/discussion/groups/${trimId(id)}`, data),

    /** 删除小组 */
    delete: (id: string | number) =>
      request.delete(`/api/discussion/groups/${trimId(id)}`),

    /** 获取未读话题数 */
    unreadCount: (id: string | number) =>
      request.get<{ unread_count: number }>(
        `/api/discussion/groups/${trimId(id)}/unread-count`,
      ),

    /** 标记小组已读 */
    markRead: (id: string | number) =>
      request.post(`/api/discussion/groups/${trimId(id)}/mark-read`),
  },

  // ========== 成员管理 ==========
  members: {
    /** 获取小组成员列表 */
    list: (groupId: string | number) =>
      request.get<GroupMember[]>(
        `/api/discussion/groups/${trimId(groupId)}/members`,
      ),

    /** 邀请成员 */
    invite: (groupId: string | number, userIds: string[]) =>
      request.post(`/api/discussion/groups/${trimId(groupId)}/members`, {
        user_ids: userIds,
      }),

    /** 移除成员 */
    remove: (groupId: string | number, userId: string) =>
      request.delete(
        `/api/discussion/groups/${trimId(groupId)}/members/${userId}`,
      ),

    /** 修改成员角色 */
    updateRole: (
      groupId: string | number,
      userId: string,
      role: 'ADMIN' | 'MEMBER',
    ) =>
      request.patch(
        `/api/discussion/groups/${trimId(groupId)}/members/${userId}/role`,
        { role },
      ),
  },

  // ========== 话题管理 ==========
  topics: {
    /** 获取话题列表 */
    list: (
      groupId: string | number,
      params?: { page?: number; pageSize?: number; keyword?: string },
    ) =>
      request.get<Pagination<GroupTopic>>(
        `/api/discussion/groups/${trimId(groupId)}/topics`,
        { params },
      ),

    /** 创建话题 */
    create: (
      groupId: string | number,
      data: { title: string; content: string },
    ) =>
      request.post<GroupTopic>(
        `/api/discussion/groups/${trimId(groupId)}/topics`,
        data,
      ),

    /** 获取话题详情 */
    getById: (id: string | number, params?: { page?: number; pageSize?: number }) =>
      request.get<TopicDetail>(`/api/discussion/topics/${trimId(id)}`, { params }),

    /** 删除话题 */
    delete: (id: string | number) =>
      request.delete(`/api/discussion/topics/${trimId(id)}`),

    /** 置顶/取消置顶 */
    togglePin: (id: string | number, isPinned: boolean) =>
      request.patch(`/api/discussion/topics/${trimId(id)}/pin`, { is_pinned: isPinned }),
  },

  // ========== 回复管理 ==========
  replies: {
    /** 发布回复 */
    create: (
      topicId: string | number,
      data: { content: string; media_urls?: string[] },
    ) =>
      request.post<TopicReply>(
        `/api/discussion/topics/${trimId(topicId)}/replies`,
        data,
      ),

    /** 删除回复 */
    delete: (id: string | number) =>
      request.delete(`/api/discussion/replies/${trimId(id)}`),
  },

  // ========== 讨论总结 ==========
  summaries: {
    /** 获取小组总结列表 */
    list: (groupId: string | number) =>
      request.get<DiscussionSummary[]>(
        `/api/discussion/groups/${trimId(groupId)}/summaries`,
      ),

    /** 生成话题总结 */
    generateTopic: (topicId: string | number) =>
      request.post<{ id: string; title: string; summary_type: string; message: string }>(
        `/api/discussion/topics/${trimId(topicId)}/summary`,
      ),

    /** 生成小组总结 */
    generateGroup: (
      groupId: string | number,
      data?: { time_range_start?: string; time_range_end?: string },
    ) =>
      request.post<{ id: string; title: string; summary_type: string; message: string }>(
        `/api/discussion/groups/${trimId(groupId)}/summary`,
        data,
      ),

    /** 获取总结详情 */
    getById: (id: string | number) =>
      request.get<DiscussionSummary>(`/api/discussion/summaries/${trimId(id)}`),

    /** 编辑总结 */
    update: (id: string | number, content: any) =>
      request.put(`/api/discussion/summaries/${trimId(id)}`, { content }),

    /** 获取版本历史 */
    versions: (id: string | number) =>
      request.get<SummaryVersion[]>(
        `/api/discussion/summaries/${trimId(id)}/versions`,
      ),

    /** 导出总结 */
    export: (id: string | number, format: 'md' | 'pdf' = 'md') => {
      return request.get(`/api/discussion/summaries/${trimId(id)}/export`, {
        params: { format },
        responseType: format === 'md' ? 'blob' : 'text',
      });
    },
  },
};

export default discussionApi;