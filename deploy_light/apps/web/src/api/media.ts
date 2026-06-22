import request from '@/utils/request';
import type { MediaArchive, MediaPersonLink } from '@/types';

/**
 * 上传媒体文件
 */
export function uploadMedia(data: {
  file: File;
  clan_id: string | number;
  uploader_id: string;
  taken_year?: number;
  taken_location?: string;
  description?: string;
}) {
  const formData = new FormData();
  formData.append('file', data.file);
  formData.append('clan_id', String(data.clan_id));
  formData.append('uploader_id', data.uploader_id);
  if (data.taken_year) formData.append('taken_year', String(data.taken_year));
  if (data.taken_location) formData.append('taken_location', data.taken_location);
  if (data.description) formData.append('description', data.description);

  return request.post('/api/media/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}

/**
 * 获取家族的媒体档案列表
 */
export function listMedia(
  clanId: string | number,
  filters?: {
    taken_year?: number;
    taken_location?: string;
    person_id?: string | number;
  }
) {
  return request.get<MediaArchive[]>('/api/media/clan/' + clanId, {
    params: filters,
  });
}

/**
 * 获取媒体详情
 */
export function getMediaById(id: string | number) {
  return request.get<MediaArchive>('/api/media/' + id);
}

/**
 * 删除媒体
 */
export function deleteMedia(id: string | number) {
  return request.delete('/api/media/' + id);
}

/**
 * 关联媒体到人物
 */
export function linkMediaToPerson(mediaId: string | number, personId: string | number) {
  return request.post('/api/media/link', {
    media_id: mediaId,
    person_id: personId,
  });
}

/**
 * 取消媒体与人物的关联
 */
export function unlinkMediaFromPerson(mediaId: string | number, personId: string | number) {
  return request.delete('/api/media/link', {
    data: {
      media_id: mediaId,
      person_id: personId,
    },
  });
}

/**
 * 推荐其他家族的相似影像（聚落互联）
 */
export function recommendMedia(
  currentClanId: string | number,
  location?: string,
  takenYear?: number
) {
  return request.post<MediaArchive[]>('/api/media/recommend', {
    currentClanId,
    location,
    takenYear,
  });
}

/**
 * 获取人物相关的媒体
 */
export function getByPersonId(personId: string | number) {
  return request.get<MediaArchive[]>('/api/media/person/' + personId);
}

// 导出为对象形式，方便按需导入
export const mediaApi = {
  uploadMedia,
  listMedia,
  getMediaById,
  deleteMedia,
  linkMediaToPerson,
  unlinkMediaFromPerson,
  recommendMedia,
  getByPersonId,
};
