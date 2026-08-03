import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
});

// 请求拦截器 - 添加 Token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('geneasphere_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ==================== 类型定义 ====================

export interface ChildhoodPlace {
  id: string;
  user_id: string;
  location_name: string;
  lat: number | null;
  lng: number | null;
  start_age: number;
  end_age: number;
  period_description: string | null;
  created_at: string;
}

export interface BuddyUser {
  id: string;
  nickname: string;
  avatar_url?: string | null;
  birth_date?: string | null;
}

export interface BuddyMatch {
  id: string;
  requester_id: string;
  matched_user_id: string;
  match_score: number;
  match_reasons: any;
  shared_media_id: string | null;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'IGNORED' | 'EXPIRED';
  greeting_message: string | null;
  contacted_at: string | null;
  responded_at: string | null;
  created_at: string;
  requester?: BuddyUser;
  matched_user?: BuddyUser;
}

export interface PhotoClaim {
  id: string;
  media_id: string;
  claimer_user_id: string;
  position_description: string | null;
  verified_by: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  created_at: string;
  claimer?: BuddyUser;
  media?: {
    id: string;
    file_url: string;
    thumb_url: string | null;
    taken_year: number | null;
    taken_location: string | null;
    description: string | null;
  };
}

export interface PhotoFindCandidate {
  matched_user: BuddyUser;
  shared_photos: Array<{
    media_id: string;
    file_url: string;
    taken_year: number | null;
    taken_location: string | null;
  }>;
  match_reasons: string[];
}

// ==================== 童年地点管理 ====================

export const getChildhoodPlaces = () =>
  api.get<{ data: ChildhoodPlace[] }, { data: ChildhoodPlace[] }>(
    '/buddy/childhood-places',
  );

export const createChildhoodPlace = (data: Partial<ChildhoodPlace>) =>
  api.post<{ data: ChildhoodPlace }, { data: ChildhoodPlace }>(
    '/buddy/childhood-places',
    data,
  );

export const updateChildhoodPlace = (id: number | string, data: Partial<ChildhoodPlace>) =>
  api.put<{ data: ChildhoodPlace }, { data: ChildhoodPlace }>(
    `/buddy/childhood-places/${id}`,
    data,
  );

export const deleteChildhoodPlace = (id: number | string) =>
  api.delete<{ data: { success: boolean } }, { data: { success: boolean } }>(
    `/buddy/childhood-places/${id}`,
  );

// ==================== 寻找小伙伴 ====================

export const findBuddies = (data: {
  location_name?: string;
  start_year?: number;
  end_year?: number;
  lat?: number;
  lng?: number;
  allow_cross_clan?: boolean;
}) =>
  api.post<{ data: any[] }, { data: any[] }>('/buddy/find', data);

export const getMyMatches = (params?: { status?: string }) =>
  api.get<{ data: BuddyMatch[] }, { data: BuddyMatch[] }>('/buddy/matches', {
    params,
  });

/** 谁在找我：明确只返回 matched_user_id = currentUser 的记录 */
export const getInboundMatches = (params?: { status?: string }) =>
  api.get<{ data: BuddyMatch[] }, { data: BuddyMatch[] }>(
    '/buddy/inbound-matches',
    { params },
  );

export const getMatchDetail = (id: number | string) =>
  api.get<{ data: BuddyMatch }, { data: BuddyMatch }>(`/buddy/matches/${id}`);

export const sendGreeting = (
  matchedUserId: string,
  data?: { message?: string; shared_media_id?: number },
) =>
  api.post<{ data: BuddyMatch }, { data: BuddyMatch }>(
    `/buddy/matches/${matchedUserId}/greeting`,
    data,
  );

export const respondMatch = (
  id: number | string,
  data: { action: 'accept' | 'decline' | 'ignore' },
) =>
  api.post<{ data: BuddyMatch }, { data: BuddyMatch }>(
    `/buddy/matches/${id}/respond`,
    data,
  );

// ==================== 按照片找 / 照片认领 ====================

export const findByPhoto = (data: {
  media_id?: number;
  taken_year?: number;
  taken_location?: string;
}) =>
  api.post<{ data: PhotoFindCandidate[] }, { data: PhotoFindCandidate[] }>(
    '/buddy/find-by-photo',
    data,
  );

export const claimPhoto = (data: { media_id: number; position_description?: string }) =>
  api.post<{ data: PhotoClaim }, { data: PhotoClaim }>(
    '/buddy/photo-claim',
    data,
  );

export const getMyPhotoClaims = () =>
  api.get<{ data: PhotoClaim[] }, { data: PhotoClaim[] }>(
    '/buddy/photo-claims',
  );

export const getPhotoClaims = (mediaId: number | string) =>
  api.get<{ data: PhotoClaim[] }, { data: PhotoClaim[] }>(
    `/buddy/media/${mediaId}/claims`,
  );

export const approvePhotoClaim = (
  id: number | string,
  body: { action: 'approve' | 'reject' },
) =>
  api.post<{ data: PhotoClaim }, { data: PhotoClaim }>(
    `/buddy/photo-claims/${id}/approve`,
    body,
  );

// ==================== 回忆地图 ====================

export const getMemoryMap = () =>
  api.get<{ data: any }, { data: any }>('/buddy/memory-map');

// 统一导出对象形式（同时保留旧式命名导出以兼容）
export const buddyApi = {
  getChildhoodPlaces,
  createChildhoodPlace,
  updateChildhoodPlace,
  deleteChildhoodPlace,
  findBuddies,
  getMyMatches,
  getInboundMatches,
  getMatchDetail,
  sendGreeting,
  respondMatch,
  findByPhoto,
  claimPhoto,
  getMyPhotoClaims,
  getPhotoClaims,
  approvePhotoClaim,
  getMemoryMap,
};

export default api;
