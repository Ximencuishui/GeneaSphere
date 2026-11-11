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
  person_id?: string;
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
  art_name?: string;
  epitaph?: string;
  source_note?: string;
  figures?: { url: string; caption: string }[];
  father_name?: string;
  father_id?: string;
  child_type?: string;
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

  getBookProfile: (clanId: string | number, share?: string) =>
    request.get<{ profile: 'compact' | 'standard' }>(`/api/cepu/${clanId}/book-profile`, share ? { params: { share } } : undefined),

  setBookProfile: (clanId: string | number, profile: 'compact' | 'standard') =>
    request.patch<{ profile: 'compact' | 'standard' }>(`/api/cepu/${clanId}/book-profile`, { profile }),

  getGenerationIndex: (clanId: string | number, share?: string) =>
    request.get<{ generation: number; character: string; note?: string | null }[]>(
      `/api/cepu/${clanId}/generation-index`,
      share ? { params: { share } } : undefined,
    ),

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

  /** 导出 PDF URL（PR#1 透传 layout 强制版式；二期：页眉页脚 + 批注 + 分享 token） */
  exportPdfUrl: (
    clanId: string | number,
    opts: {
      header?: string;
      footer?: string;
      withAnnotations?: boolean;
      layout?: 'su' | 'ou' | 'ou_chart' | 'shixi_table';
      edition?: 'electronic' | 'print';
      script?: 'horizontal' | 'antique';
      titleVertical?: boolean;
      pack?: 'exclusive' | 'share';
      profile?: 'compact' | 'standard';
      beadLines?: boolean;
      showFrame?: boolean;
      framePt?: number;
      continueNote?: 'brief' | 'full';
      showAvatars?: boolean;
    } = {},
    share?: string,
  ) => {
    const qs = new URLSearchParams();
    if (opts.header) qs.set('header', opts.header);
    if (opts.footer) qs.set('footer', opts.footer);
    if (opts.withAnnotations) qs.set('withAnnotations', '1');
    if (opts.layout) qs.set('layout', opts.layout);
    if (opts.edition) qs.set('edition', opts.edition);
    if (opts.script === 'antique') qs.set('script', 'antique');
    if (opts.titleVertical) qs.set('titleVertical', '1');
    if (opts.pack === 'share') qs.set('chartPack', 'share');
    if (opts.profile) qs.set('profile', opts.profile);
    if (opts.beadLines) qs.set('beadLines', '1');
    if (opts.showFrame) qs.set('showFrame', '1');
    if (opts.showFrame && opts.framePt != null) qs.set('framePt', String(opts.framePt));
    if (opts.continueNote) qs.set('continueNote', opts.continueNote);
    if (opts.showAvatars != null) qs.set('showAvatars', opts.showAvatars ? '1' : '0');
    if (share) qs.set('share', share);
    const q = qs.toString();
    return `/api/cepu/${clanId}/export-pdf${q ? `?${q}` : ''}`;
  },

  /** 导出 Word（.doc）URL（PR#1 透传 layout；二期：分享 token） */
  exportWordUrl: (
    clanId: string | number,
    opts: {
      withAnnotations?: boolean;
      layout?: 'su' | 'ou' | 'ou_chart' | 'shixi_table';
      script?: 'horizontal' | 'antique';
      titleVertical?: boolean;
      pack?: 'exclusive' | 'share';
      profile?: 'compact' | 'standard';
      beadLines?: boolean;
      showFrame?: boolean;
      framePt?: number;
      continueNote?: 'brief' | 'full';
      showAvatars?: boolean;
    } = {},
    share?: string,
  ) => {
    const qs = new URLSearchParams();
    if (opts.withAnnotations) qs.set('withAnnotations', '1');
    if (opts.layout) qs.set('layout', opts.layout);
    if (opts.script === 'antique') qs.set('script', 'antique');
    if (opts.titleVertical) qs.set('titleVertical', '1');
    if (opts.pack === 'share') qs.set('chartPack', 'share');
    if (opts.profile) qs.set('profile', opts.profile);
    if (opts.beadLines) qs.set('beadLines', '1');
    if (opts.showFrame) qs.set('showFrame', '1');
    if (opts.showFrame && opts.framePt != null) qs.set('framePt', String(opts.framePt));
    if (opts.continueNote) qs.set('continueNote', opts.continueNote);
    if (opts.showAvatars != null) qs.set('showAvatars', opts.showAvatars ? '1' : '0');
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
