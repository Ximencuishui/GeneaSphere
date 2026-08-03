import request from '@/utils/request';

export interface StorageUpgradePlan {
  code: string;
  name: string;
  quota_bytes: number;
  price: number;
}

export interface StorageUpgradeRequest {
  id: string;
  clan_id: string;
  applicant_id: string;
  plan_code: string;
  plan_name: string;
  quota_bytes: string;
  current_quota_bytes: string;
  reason: string | null;
  contact_info: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED';
  reviewed_at: string | null;
  reviewer_id: string | null;
  reviewer_note: string | null;
  applied_quota_bytes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * 存储扩容 API
 * - 本轮只接「人工审核」流：未配置真实支付 Provider 时，禁止伪造支付/立即扩容
 * - 平台管理员审核通过后才真正更新 ClanQuota
 */
export const storageUpgradeApi = {
  listPlans: () =>
    request.get<{ data: StorageUpgradePlan[] }, { data: StorageUpgradePlan[] }>(
      '/api/admin/storage/plans',
    ),

  listMyRequests: (clanSlug: string) =>
    request.get<{ data: StorageUpgradeRequest[] }, { data: StorageUpgradeRequest[] }>(
      '/api/admin/storage/upgrade-requests',
      { params: { clanSlug } },
    ),

  submitRequest: (
    clanSlug: string,
    body: { plan_code: string; reason?: string; contact_info?: string },
  ) =>
    request.post<{ data: StorageUpgradeRequest }, { data: StorageUpgradeRequest }>(
      '/api/admin/storage/upgrade-requests',
      body,
      { params: { clanSlug } },
    ),

  cancelRequest: (id: string | number) =>
    request.post<{ data: StorageUpgradeRequest }, { data: StorageUpgradeRequest }>(
      `/api/admin/storage/upgrade-requests/${id}/cancel`,
    ),
};

export default storageUpgradeApi;
