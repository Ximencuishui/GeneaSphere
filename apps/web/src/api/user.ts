import request from '@/utils/request';
import type {
  UserProfile,
  UserSetting,
  UserPhotoItem,
  UserAnnotation,
  UserOrder,
  UserOrderDetail,
  UserNotification,
  Pagination,
  UserToolHistoryItem,
  UserGroup,
  UserVideo,
} from '@/types';

const trimId = (s: string | number) => String(s);

/** 用户中心 API 封装（与 /api/user/* 对接） */
export const userApi = {
  // ========== 资料 ==========
  profile: {
    get: () => request.get<UserProfile, UserProfile>('/api/user/profile'),

    update: (data: {
      nickname?: string;
      email?: string;
      gender?: 'male' | 'female';
      birth_date?: string;
      avatar_url?: string;
    }) => request.put('/api/user/profile', data),

    /** 上传头像：base64 data-url 模式 */
    uploadAvatarByDataUrl: (dataUrl: string) =>
      request.post<{ avatar_url: string }, { avatar_url: string }>('/api/user/avatar/data-url', {
        data_url: dataUrl,
      }),

    /** 上传头像：multipart/form-data 模式 */
    uploadAvatarByFile: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return request.post<{ avatar_url: string }, { avatar_url: string }>('/api/user/avatar', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
  },

  // ========== 密码与账号 ==========
  password: {
    change: (data: {
      old_password: string;
      new_password: string;
      confirm_password: string;
    }) => request.post('/api/user/password', data),
  },

  account: {
    delete: (confirmation: string) =>
      request.delete('/api/user/account', {
        data: { confirmation },
      }),
  },

  // ========== 我的时光 ==========
  photos: {
    list: (params?: {
      page?: number;
      pageSize?: number;
      taken_year?: number;
      clan_id?: string | number;
    }) =>
      request.get<Pagination<UserPhotoItem>, Pagination<UserPhotoItem>>('/api/user/photos', { params }),
  },

  // ========== 我的标注 ==========
  annotations: {
    list: (params?: { page?: number; pageSize?: number }) =>
      request.get<Pagination<UserAnnotation>, Pagination<UserAnnotation>>('/api/user/annotations', {
        params,
      }),
  },

  // ========== 我的订单 ==========
  orders: {
    list: (params?: {
      page?: number;
      pageSize?: number;
      status?: string;
    }) =>
      request.get<Pagination<UserOrder>, Pagination<UserOrder>>('/api/user/orders', { params }),

    getById: (id: string | number) =>
      request.get<UserOrderDetail, UserOrderDetail>(`/api/user/orders/${trimId(id)}`),
  },

  // ========== 我的工具箱 ==========
  toolHistory: {
    list: () =>
      request.get<{
        data: UserToolHistoryItem[];
        pagination: Pagination<UserToolHistoryItem>['pagination'];
        notice?: string;
      }, {
        data: UserToolHistoryItem[];
        pagination: Pagination<UserToolHistoryItem>['pagination'];
        notice?: string;
      }>('/api/user/tool-history'),
  },

  // ========== 我的小组 ==========
  groups: {
    list: () =>
      request.get<{ data: UserGroup[]; notice?: string }, { data: UserGroup[]; notice?: string }>('/api/user/groups'),
  },

  // ========== 我的音像墙 ==========
  videos: {
    list: () =>
      request.get<{ data: UserVideo[]; notice?: string }, { data: UserVideo[]; notice?: string }>('/api/user/videos'),
  },

  // ========== 设置 ==========
  settings: {
    get: () => request.get<UserSetting, UserSetting>('/api/user/settings'),
    update: (data: Partial<UserSetting>) =>
      request.put('/api/user/settings', data),
  },

  // ========== 通知 ==========
  notifications: {
    unreadCount: () =>
      request.get<{ unread_count: number }, { unread_count: number }>(
        '/api/user/notifications/unread-count',
      ),
    list: () =>
      request.get<{ data: UserNotification[] }, { data: UserNotification[] }>('/api/user/notifications'),
    markRead: (id: string | number) =>
      request.post(`/api/user/notifications/${trimId(id)}/read`),
  },
};

export default userApi;