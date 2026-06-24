/**
 * 平台管理后台 API 客户端（类型安全）
 *
 * 约定：
 *   - 路径前缀：/api/platform/*
 *   - 鉴权：通过 request interceptor 自动附加 platform_token Bearer
 *   - 分页响应：后端返回 `{ data, pagination }`，统一用 PagedResult<T>
 *   - 错误：依赖 request.ts 的统一拦截器（GlobalHttpExceptionFilter）
 *
 * 与平台管理后台 views/platform-admin/* 页面一一对应，调用方应直接使用
 * 此处导出的具名方法，避免在页面内重复手写 URL 路径。
 */
import request from '@/utils/request';
import type { PagedQuery, PagedResult } from '@/types/api';

// ==================== 公共类型 ====================

export type StatisticsPeriod = 'day' | 'week' | 'month';
export type StatisticsExportType = 'summary' | 'family-ranking';
export type StatisticsExportFormat = 'excel' | 'csv';

export type FamilyRankingType =
  | 'member_count'
  | 'photo_count'
  | 'storage'
  | 'revenue';

export interface PlatformPagination {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

// ==================== Dashboard ====================

export interface PlatformDashboard {
  statistics: {
    total_families: number;
    pending_families: number;
    active_families: number;
    banned_families: number;
    total_users: number;
    active_users: number;
    banned_users: number;
    total_media: number;
    total_orders: number;
    revenue_30d: number;
  };
  trends: Array<{ date: string; new_families: number; new_users: number }>;
}

// ==================== Families ====================

export type ClanPlatformStatus = 'PENDING' | 'ACTIVE' | 'BANNED' | 'DELETED';

export interface PlatformFamily {
  id: string;
  name: string;
  description?: string | null;
  status: ClanPlatformStatus;
  admin_user_id?: string | null;
  admin_phone_masked?: string | null;
  member_count: number;
  person_count: number;
  media_count: number;
  register_ip?: string | null;
  created_at: string;
  reviewed_at?: string | null;
  has_id_card: boolean;
  id_card_uploaded_at?: string | null;
}

export interface PlatformFamilyListQuery extends PagedQuery {
  keyword?: string;
  status?: ClanPlatformStatus;
  startDate?: string;
  endDate?: string;
}

export interface PlatformFamilyActionResult {
  message: string;
  family_id: string;
}

export type PlatformFamilyAction = 'approve' | 'reject' | 'ban' | 'unban';

export interface PlatformFamilyActionPayload {
  reason?: string;
  duration_days?: number;
}

// ==================== Users ====================

export type UserPlatformBanStatus = 'NONE' | 'BANNED';

export interface PlatformUser {
  id: string;
  phone: string;
  phone_masked: string;
  nickname?: string | null;
  avatar_url?: string | null;
  ban_status: UserPlatformBanStatus;
  ban_reason?: string | null;
  ban_until?: string | null;
  families: Array<{ id: string; name: string }>;
  created_at: string;
  last_login_at?: string | null;
}

export interface PlatformUserListQuery extends PagedQuery {
  keyword?: string;
  familyId?: string;
  status?: UserPlatformBanStatus;
}

export interface PlatformUserBanPayload {
  reason: string;
  duration_days: number;
}

export interface PlatformUserResetPasswordResult {
  message: string;
  temp_password: string;
  user_id: string;
}

// ==================== Statistics ====================

export interface StatisticsSummary {
  period: StatisticsPeriod;
  since: string;
  totals: {
    new_families: number;
    new_users: number;
    new_media: number;
    new_orders: number;
    revenue: number;
  };
  trends: Array<{
    date: string;
    revenue: number;
    order_count: number;
  }>;
}

export interface FamilyRankingItem {
  clan_id: string;
  name: string;
  value: number;
}

export interface FamilyRankingResponse {
  type: FamilyRankingType;
  data: FamilyRankingItem[];
}

export interface ToolUsageItem {
  tool: string;
  usage_count: number;
  unique_users: number;
  last_used_at: string;
}

export interface ToolUsageResponse {
  message: string;
  data: ToolUsageItem[];
}

// ==================== Logs ====================

export interface PlatformOperationLog {
  id: string;
  admin_id: string;
  admin_username: string;
  action_type: string;
  target_type: string;
  target_id?: string | null;
  detail: Record<string, unknown>;
  ip_address: string;
  user_agent?: string | null;
  created_at: string;
}

export interface PlatformOperationLogQuery extends PagedQuery {
  adminId?: string;
  actionType?: string;
  startDate?: string;
  endDate?: string;
}

// ==================== Orders ====================

export type PrintOrderStatus =
  | 'PENDING'
  | 'PAID'
  | 'PRINTING'
  | 'SHIPPED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REFUNDED';

export type RechargeOrderStatus =
  | 'PENDING'
  | 'PAID'
  | 'CANCELLED'
  | 'REFUNDED';

export interface PlatformPrintOrder {
  id: string;
  order_no: string;
  clan_id: string;
  clan_name: string;
  user_id: string;
  user_phone: string;
  amount: number;
  specification: string;
  quantity: number;
  status: PrintOrderStatus;
  shipping_address?: Record<string, unknown> | null;
  tracking_no?: string | null;
  paid_at?: string | null;
  shipped_at?: string | null;
  created_at: string;
}

export interface PlatformRechargeOrder {
  id: string;
  order_no: string;
  user_id: string;
  user_phone: string;
  amount: number;
  payment_method?: string | null;
  status: RechargeOrderStatus;
  paid_at?: string | null;
  created_at: string;
}

export interface PlatformOrderQuery extends PagedQuery {
  status?: PrintOrderStatus | RechargeOrderStatus;
  clanId?: string;
  startDate?: string;
  endDate?: string;
}

// ==================== API ====================

export const adminApi = {
  // ─── Dashboard ──────────────────────────────────────────
  /** 平台首页统计数据 */
  getDashboard: () =>
    request.get<PlatformDashboard, PlatformDashboard>('/api/platform/dashboard'),

  // ─── Families ──────────────────────────────────────────
  /** 家族列表 */
  listFamilies: (query: PlatformFamilyListQuery = {}) =>
    request.get<PagedResult<PlatformFamily>, PagedResult<PlatformFamily>>(
      '/api/platform/families',
      { params: query },
    ),

  /** 家族详情 */
  getFamily: (familyId: string) =>
    request.get<PlatformFamily, PlatformFamily>(`/api/platform/families/${familyId}`),

  /** 家族操作（approve / reject / ban / unban） */
  familyAction: (
    familyId: string,
    action: PlatformFamilyAction,
    payload: PlatformFamilyActionPayload = {},
  ) =>
    request.post<PlatformFamilyActionResult, PlatformFamilyActionResult>(
      `/api/platform/families/${familyId}/${action}`,
      payload,
    ),

  /** 强制删除家族（仅 DELETED 状态可执行） */
  hardDeleteFamily: (familyId: string) =>
    request.delete<{ message: string }, { message: string }>(
      `/api/platform/families/${familyId}/hard`,
    ),

  // ─── Users ─────────────────────────────────────────────
  /** 用户列表 */
  listUsers: (query: PlatformUserListQuery = {}) =>
    request.get<PagedResult<PlatformUser>, PagedResult<PlatformUser>>('/api/platform/users', {
      params: query,
    }),

  /** 用户详情 */
  getUser: (userId: string) =>
    request.get<PlatformUser, PlatformUser>(`/api/platform/users/${userId}`),

  /** 封禁用户 */
  banUser: (userId: string, payload: PlatformUserBanPayload) =>
    request.post<{ message: string }, { message: string }>(
      `/api/platform/users/${userId}/ban`,
      payload,
    ),

  /** 解封用户 */
  unbanUser: (userId: string) =>
    request.post<{ message: string }, { message: string }>(
      `/api/platform/users/${userId}/unban`,
    ),

  /** 重置密码（返回临时密码） */
  resetUserPassword: (userId: string) =>
    request.post<PlatformUserResetPasswordResult, PlatformUserResetPasswordResult>(
      `/api/platform/users/${userId}/reset-password`,
    ),

  // ─── Statistics ────────────────────────────────────────
  /** 周期汇总 */
  getStatisticsSummary: (period: StatisticsPeriod = 'day') =>
    request.get<StatisticsSummary, StatisticsSummary>('/api/platform/statistics/summary', {
      params: { period },
    }),

  /** 家族排行 */
  getFamilyRanking: (
    type: FamilyRankingType = 'member_count',
    limit = 20,
  ) =>
    request.get<FamilyRankingResponse, FamilyRankingResponse>(
      '/api/platform/statistics/family-ranking',
      { params: { type, limit } },
    ),

  /** AI 工具使用统计（v1.1 占位） */
  getToolUsage: () =>
    request.get<ToolUsageResponse, ToolUsageResponse>('/api/platform/statistics/tool-usage'),

  /**
   * 导出统计报表（Excel/CSV）
   * 注意：返回 blob，需在调用方使用 URL.createObjectURL 下载
   */
  exportStatistics: async (
    type: StatisticsExportType = 'summary',
    format: StatisticsExportFormat = 'excel',
  ): Promise<Blob> => {
    const res = await request.get<Blob, Blob>('/api/platform/statistics/export', {
      params: { type, format },
      responseType: 'blob',
    });
    return res as unknown as Blob;
  },

  // ─── Logs ──────────────────────────────────────────────
  /** 平台操作日志 */
  listLogs: (query: PlatformOperationLogQuery = {}) =>
    request.get<PagedResult<PlatformOperationLog>, PagedResult<PlatformOperationLog>>(
      '/api/platform/logs',
      { params: query },
    ),

  // ─── Orders ────────────────────────────────────────────
  /** 印刷订单列表 */
  listPrintOrders: (query: PlatformOrderQuery = {}) =>
    request.get<PagedResult<PlatformPrintOrder>, PagedResult<PlatformPrintOrder>>(
      '/api/platform/orders/print',
      { params: query },
    ),

  /** 充值订单列表 */
  listRechargeOrders: (query: PlatformOrderQuery = {}) =>
    request.get<PagedResult<PlatformRechargeOrder>, PagedResult<PlatformRechargeOrder>>(
      '/api/platform/orders/recharge',
      { params: query },
    ),
};

export default adminApi;
