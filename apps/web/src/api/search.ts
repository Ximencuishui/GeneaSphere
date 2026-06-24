import request from '@/utils/request';
import type { SearchPost } from '@/types';

/**
 * 创建寻亲帖
 */
export function createSearchPost(data: {
  origin_place: string;
  xipai_keywords: string[];
  contact_info: string;
  created_by?: string;
}) {
  return request.post('/api/search/post', data);
}

/**
 * 搜索寻亲帖
 */
export function searchPosts(query: string, origin_place?: string) {
  return request.get<{ post: SearchPost; score: number }[], { post: SearchPost; score: number }[]>('/api/search/posts', {
    params: { query, origin_place },
  });
}

/**
 * 获取寻亲帖详情
 */
export function getSearchPost(id: string | number) {
  return request.get<SearchPost, SearchPost>('/api/search/post/' + id);
}

/**
 * 获取联系方式（需要权限）
 */
export function getContactInfo(id: string | number) {
  return request.get<{ contact_info: string }, { contact_info: string }>('/api/search/post/' + id + '/contact');
}
