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

// ==================== 童年地点管理 ====================

export const getChildhoodPlaces = () => api.get('/buddy/childhood-places');

export const createChildhoodPlace = (data: any) =>
  api.post('/buddy/childhood-places', data);

export const updateChildhoodPlace = (id: number, data: any) =>
  api.put(`/buddy/childhood-places/${id}`, data);

export const deleteChildhoodPlace = (id: number) =>
  api.delete(`/buddy/childhood-places/${id}`);

// ==================== 寻找小伙伴 ====================

export const findBuddies = (data: any) => api.post('/buddy/find', data);

export const getMyMatches = (params?: { status?: string }) =>
  api.get('/buddy/matches', { params });

export const getMatchDetail = (id: number) =>
  api.get(`/buddy/matches/${id}`);

export const sendGreeting = (
  matchedUserId: string,
  data?: { message?: string; shared_media_id?: number },
) => api.post(`/buddy/matches/${matchedUserId}/greeting`, data);

export const respondMatch = (id: number, data: { action: string }) =>
  api.post(`/buddy/matches/${id}/respond`, data);

// ==================== 照片认领 ====================

export const claimPhoto = (data: { media_id: number; position_description?: string }) =>
  api.post('/buddy/photo-claim', data);

export const getMyPhotoClaims = () => api.get('/buddy/photo-claims');

export const getPhotoClaims = (mediaId: number) =>
  api.get(`/buddy/media/${mediaId}/claims`);

// ==================== 回忆地图 ====================

export const getMemoryMap = () => api.get('/buddy/memory-map');

export default api;
