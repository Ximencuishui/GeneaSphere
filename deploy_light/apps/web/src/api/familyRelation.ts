import request from '@/utils/request';
import type {
  LinkedPerson,
  CurrentRelationship,
  FamilyRelationChange,
  RelationPrivacyPreference,
  UpdateMarriagePayload,
  UpdateSpousePayload,
  AddChildPayload,
  UpdateCustodyPayload,
} from '@/types';

/** 柔性家庭关系更新 API 封装 */
export const familyRelationApi = {
  /** 获取当前用户关联的本人 Person */
  myPerson: () => request.get<unknown, LinkedPerson[]>('/api/family-relation/my-person'),

  /** 获取指定 person 的当前家庭关系 */
  current: (personId: string) =>
    request.get<unknown, CurrentRelationship>(`/api/family-relation/persons/${personId}/current`),

  /** 获取变更历史 */
  history: (params: {
    person_id?: string;
    change_type?: string;
    start_date?: string;
    end_date?: string;
    page?: number;
    pageSize?: number;
  }) => request.get<unknown, { data: FamilyRelationChange[]; pagination: any }>('/api/family-relation/history', { params }),

  /** 更新婚姻状态 */
  updateMarriage: (data: UpdateMarriagePayload) =>
    request.post<unknown, any>('/api/family-relation/marriage', data),

  /** 新增/解除/更换配偶 */
  updateSpouse: (data: UpdateSpousePayload) =>
    request.post<unknown, any>('/api/family-relation/spouse', data),

  /** 新增子女 */
  addChild: (data: AddChildPayload) =>
    request.post<unknown, any>('/api/family-relation/child', data),

  /** 更新子女抚养关系 */
  updateCustody: (childId: string, data: UpdateCustodyPayload) =>
    request.put<unknown, any>(`/api/family-relation/children/${childId}/custody`, data),

  /** 隐私偏好 */
  privacy: {
    get: () => request.get<unknown, RelationPrivacyPreference>('/api/family-relation/privacy'),
    update: (data: Partial<RelationPrivacyPreference>) =>
      request.put<unknown, RelationPrivacyPreference>('/api/family-relation/privacy', data),
  },

  /** 管理员端 */
  admin: {
    listChanges: (params: {
      clanId: string;
      status?: string;
      change_type?: string;
      page?: number;
      pageSize?: number;
    }) => request.get<unknown, { data: any[]; pagination: any }>('/api/admin/family-relation/changes', { params }),

    getChange: (id: string) =>
      request.get<unknown, any>(`/api/admin/family-relation/changes/${id}`),

    approve: (id: string) =>
      request.post<unknown, any>(`/api/admin/family-relation/changes/${id}/approve`),

    reject: (id: string, reason: string) =>
      request.post<unknown, any>(`/api/admin/family-relation/changes/${id}/reject`, { reason }),

    markManual: (id: string) =>
      request.post<unknown, any>(`/api/admin/family-relation/changes/${id}/manual`),

    listDisputes: (clanId: string) =>
      request.get<unknown, any[]>('/api/admin/family-relation/disputes', { params: { clanId } }),

    resolveDispute: (id: string, custodyStatus: string) =>
      request.post<unknown, any>(`/api/admin/family-relation/disputes/${id}/resolve`, { custody_status: custodyStatus }),
  },
};
