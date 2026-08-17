import request from '@/utils/request';

// ==================== 册谱 API（2026-08-17 一期） ====================

export interface BookVolume {
  id: string;
  clan_id?: string;
  sort_order: number;
  title: string;
  type: 'document' | 'shilu';
  content?: string;
  config?: any;
  created_by?: string;
}

export interface ShiluChild {
  name: string;
  gender: string;
  rank?: number;
  child_type?: string;
}
export interface ShiluSpouse {
  name: string;
  gender: string;
  marriage_order: number;
  native_place?: string;
}
export interface ShiluEntry {
  person_id: string;
  generation: number;
  rank?: number;
  full_name: string;
  gender: 'male' | 'female';
  courtesy_name?: string;
  birth_year?: number;
  death_year?: number;
  is_living: boolean;
  native_place?: string;
  burial_place?: string;
  achievements?: string;
  anecdotes?: string;
  biography?: string;
  adoption_note?: string;
  father_name?: string;
  spouses: ShiluSpouse[];
  children: ShiluChild[];
  premature: boolean;
}

export interface PersonBio {
  person_id: string;
  full_name?: string;
  gender?: string;
  courtesy_name?: string;
  native_place?: string;
  burial_place?: string;
  achievements?: string;
  anecdotes?: string;
  biography?: string;
  marital_notes?: string;
  adoption_note?: string;
  premature?: boolean | null;
}

export interface SearchResult {
  persons: {
    person_id: string;
    full_name: string;
    gender: string;
    courtesy_name?: string;
    burial_place?: string;
    birth_year?: number;
    death_year?: number;
  }[];
  volumes: { id: string; title: string; sort_order: number }[];
}

export const cepuApi = {
  /** share：分享只读 token（来自 ?share=），透传给读端点 */
  getVolumes: (clanId: string | number, share?: string) =>
    request.get<BookVolume[]>(`/api/cepu/${clanId}/volumes`, share ? { params: { share } } : undefined),

  getVolume: (clanId: string | number, id: string | number, share?: string) =>
    request.get<{ id: string; title: string; type: string; content?: string; config?: any; entries?: ShiluEntry[] }>(
      `/api/cepu/${clanId}/volume/${id}`,
      share ? { params: { share } } : undefined,
    ),

  createVolume: (
    clanId: string | number,
    data: { title: string; type?: string; content?: string; config?: any },
  ) => request.post('/api/cepu/volumes', data, { params: { clanSlug: clanId } }),

  updateVolume: (id: string | number, data: { title?: string; content?: string; config?: any }) =>
    request.patch(`/api/cepu/volumes/${id}`, data),

  deleteVolume: (id: string | number) => request.delete(`/api/cepu/volumes/${id}`),

  reorderVolumes: (clanId: string | number, ids: string[]) =>
    request.post('/api/cepu/volumes/reorder', { ids }, { params: { clanSlug: clanId } }),

  getPersonBio: (personId: string | number, share?: string) =>
    request.get<PersonBio>(`/api/cepu/person-bio/${personId}`, share ? { params: { share } } : undefined),

  upsertPersonBio: (personId: string | number, data: Partial<PersonBio>) =>
    request.put(`/api/cepu/person-bio/${personId}`, data),

  search: (clanId: string | number, q: string, share?: string) =>
    request.get<SearchResult>(`/api/cepu/${clanId}/search`, {
      params: share ? { q, share } : { q },
    }),

  // ==================== 二期：批注 / 导出增强 ====================

  getAnnotations: (volumeId: string | number) =>
    request.get<{ id: string; volume_id: string; anchor: string; note: string; created_by: string; created_at: string }[]>(
      `/api/cepu/volume/${volumeId}/annotations`,
    ),

  createAnnotation: (volumeId: string | number, data: { anchor: string; note: string }) =>
    request.post(`/api/cepu/volume/${volumeId}/annotations`, data),

  deleteAnnotation: (annotationId: string | number) =>
    request.delete(`/api/cepu/annotations/${annotationId}`),

  /** 导出 PDF URL（支持页眉页脚自定义 + 批注输出 + 分享 token） */
  exportPdfUrl: (
    clanId: string | number,
    opts: { header?: string; footer?: string; withAnnotations?: boolean } = {},
    share?: string,
  ) => {
    const qs = new URLSearchParams();
    if (opts.header) qs.set('header', opts.header);
    if (opts.footer) qs.set('footer', opts.footer);
    if (opts.withAnnotations) qs.set('withAnnotations', '1');
    if (share) qs.set('share', share);
    const q = qs.toString();
    return `/api/cepu/${clanId}/export-pdf${q ? `?${q}` : ''}`;
  },

  /** 导出 Word（.doc）URL（支持分享 token） */
  exportWordUrl: (clanId: string | number, withAnnotations = false, share?: string) => {
    const qs = new URLSearchParams();
    if (withAnnotations) qs.set('withAnnotations', '1');
    if (share) qs.set('share', share);
    const q = qs.toString();
    return `/api/cepu/${clanId}/export-word${q ? `?${q}` : ''}`;
  },

  // ==================== 二期：分享只读链接 ====================

  createShare: (clanId: string | number) =>
    request.post<{ id: string; token: string; scope: string; url: string; created_at: string }>(
      `/api/cepu/${clanId}/share`,
    ),

  listShares: (clanId: string | number) =>
    request.get<{ id: string; token: string; scope: string; url: string; created_at: string; expires_at?: string | null }[]>(
      `/api/cepu/${clanId}/share-links`,
    ),

  revokeShare: (token: string) => request.delete(`/api/cepu/share/${token}`),

  // ==================== 二期：卷宗版本历史 ====================

  listVolumeVersions: (volumeId: string | number) =>
    request.get<{ id: string; version: number; title: string; created_by: string; created_at: string }[]>(
      `/api/cepu/volume/${volumeId}/versions`,
    ),

  restoreVolumeVersion: (volumeId: string | number, version: number) =>
    request.post(`/api/cepu/volume/${volumeId}/versions/${version}/restore`),
};
