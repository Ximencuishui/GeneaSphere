import request from '@/utils/request';
import type { Pagination } from '@/types';

export interface VideoProject {
  id: string;
  target_person: {
    id: string;
    full_name: string;
    gender: 'male' | 'female';
    birth_date?: string;
    death_date?: string;
  };
  status: 'queued' | 'processing' | 'completed' | 'failed';
  queue_position: number;
  priority: boolean;
  video_url?: string;
  duration_seconds?: number;
  style: string;
  material_count: number;
  created_at: string;
  completed_at?: string;
  error_message?: string;
}

export interface VideoMaterial {
  media_id: string;
  file_url: string;
  taken_year?: number;
  description?: string;
  sequence_order: number;
}

export interface LineageInfo {
  ancestors: Array<{
    id: string;
    full_name: string;
    birth_year?: number;
    death_year?: number;
  }>;
  descendants: Array<{
    id: string;
    full_name: string;
    birth_year?: number;
    death_year?: number;
  }>;
  total_ancestors: number;
  total_descendants: number;
}

export interface MaterialPreview {
  media_count: number;
  persons: Array<{
    id: string;
    full_name: string;
    media_count: number;
  }>;
}

export interface CreateProjectDto {
  target_person_id: number;
  style?: 'nostalgic' | 'bw复古' | 'modern';
  use_priority?: boolean;
}

export interface VipStatus {
  is_vip: boolean;
  expires_at?: string;
  order_type?: string;
}

export interface QueueStatus {
  position: number;
  estimated_wait_minutes: number;
}

export interface PurchaseVipDto {
  order_type: 'single' | 'monthly' | 'yearly';
  amount: number;
}

/**
 * 视频生成相关API
 */
export const videoApi = {
  // ========== 项目管理 ==========

  /**
   * 创建视频生成项目
   */
  createProject: (data: CreateProjectDto) =>
    request.post<{ id: string; queue_position: number; estimated_wait_minutes: number }, { id: string; queue_position: number; estimated_wait_minutes: number }>(
      '/api/video/projects',
      data,
    ),

  /**
   * 获取我的项目列表
   */
  listProjects: (params?: { page?: number; pageSize?: number }) =>
    request.get<{ data: VideoProject[]; pagination: Pagination<VideoProject>['pagination'] }, { data: VideoProject[]; pagination: Pagination<VideoProject>['pagination'] }>(
      '/api/video/projects',
      { params },
    ),

  /**
   * 获取项目详情
   */
  getProject: (id: string) =>
    request.get<VideoProject & { materials: VideoMaterial[] }, VideoProject & { materials: VideoMaterial[] }>(`/api/video/projects/${id}`),

  /**
   * 取消项目
   */
  cancelProject: (id: string) =>
    request.delete(`/api/video/projects/${id}`),

  /**
   * 删除项目
   */
  deleteProject: (id: string) =>
    request.delete(`/api/video/projects/${id}/delete`),

  // ========== 人物信息 ==========

  /**
   * 获取目标人物直系血脉信息
   */
  getPersonLineage: (personId: string | number) =>
    request.get<LineageInfo, LineageInfo>(`/api/video/person/${personId}/lineage`),

  /**
   * 预览可用素材
   */
  previewMaterials: (personId: string | number) =>
    request.get<MaterialPreview, MaterialPreview>(`/api/video/person/${personId}/preview`),

  // ========== VIP相关 ==========

  /**
   * 获取VIP状态
   */
  getVipStatus: () =>
    request.get<VipStatus, VipStatus>('/api/video/vip/status'),

  /**
   * 购买VIP
   */
  purchaseVip: (data: PurchaseVipDto) =>
    request.post<{ success: boolean; message: string }, { success: boolean; message: string }>('/api/video/vip/purchase', data),

  // ========== 队列状态 ==========

  /**
   * 获取排队状态
   */
  getQueueStatus: () =>
    request.get<QueueStatus, QueueStatus>('/api/video/queue/status'),
};

export default videoApi;
