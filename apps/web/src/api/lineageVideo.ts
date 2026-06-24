import request from '@/utils/request';
import type { Pagination } from '@/types';

// ==================== 类型定义 ====================

export interface LineageVideoProject {
  id: string;
  center_person: {
    id: string;
    full_name: string;
    gender: 'male' | 'female';
    birth_date?: string;
    death_date?: string;
  };
  direction: 'paternal' | 'maternal' | 'both';
  up_generations: number;
  down_generations: number;
  include_spouse: boolean;
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

export interface LineageVideoMaterial {
  media_id: string;
  file_url: string;
  taken_year?: number;
  description?: string;
  media_type: string;
  person_id: string;
  person_name: string;
  sequence_order: number;
}

export interface LineagePerson {
  id: string;
  full_name: string;
  gender: string;
  birth_year?: number;
  death_year?: number;
  relationship: string;
  generation: number;
}

export interface LineagePreviewResult {
  persons: LineagePerson[];
  person_count: number;
  media_count: number;
  video_count: number;
  estimated_duration_seconds: number;
}

export interface CreateLineageProjectDto {
  center_person_id: number;
  direction?: 'paternal' | 'maternal' | 'both';
  up_generations?: number;
  down_generations?: number;
  include_spouse?: boolean;
  style?: 'nostalgic' | 'bw复古' | 'modern';
  use_priority?: boolean;
}

export interface MonthlyUsage {
  used: number;
  limit: number;
  remaining: number;
}

// ==================== API ====================

/**
 * 直系血缘视频生成 API
 */
export const lineageVideoApi = {
  /**
   * 创建直系血缘视频项目
   */
  createProject: (data: CreateLineageProjectDto) =>
    request.post<{ id: string; queue_position: number; estimated_wait_minutes: number }, { id: string; queue_position: number; estimated_wait_minutes: number }>(
      '/api/lineage-video/projects',
      data,
    ),

  /**
   * 获取我的项目列表
   */
  listProjects: (params?: { page?: number; pageSize?: number }) =>
    request.get<{ data: LineageVideoProject[]; pagination: Pagination<LineageVideoProject>['pagination'] }, { data: LineageVideoProject[]; pagination: Pagination<LineageVideoProject>['pagination'] }>(
      '/api/lineage-video/projects',
      { params },
    ),

  /**
   * 获取项目详情
   */
  getProject: (id: string) =>
    request.get<LineageVideoProject & { materials: LineageVideoMaterial[] }, LineageVideoProject & { materials: LineageVideoMaterial[] }>(
      `/api/lineage-video/projects/${id}`,
    ),

  /**
   * 取消项目
   */
  cancelProject: (id: string) =>
    request.delete(`/api/lineage-video/projects/${id}`),

  /**
   * 删除项目
   */
  deleteProject: (id: string) =>
    request.delete(`/api/lineage-video/projects/${id}/delete`),

  /**
   * 素材预览
   */
  previewMaterials: (params: {
    centerPersonId: string | number;
    direction?: string;
    upGenerations?: number;
    downGenerations?: number;
    includeSpouse?: boolean;
  }) =>
    request.get<LineagePreviewResult, LineagePreviewResult>('/api/lineage-video/preview', { params }),

  /**
   * 获取月度用量
   */
  getMonthlyUsage: () =>
    request.get<MonthlyUsage, MonthlyUsage>('/api/lineage-video/monthly-usage'),

  /**
   * 在家族内搜索人物
   */
  searchPersons: (keyword?: string, limit = 20) =>
    request.get<Array<{
      id: string;
      full_name: string;
      gender: string;
      birth_date?: string;
      death_date?: string;
    }>, Array<{
      id: string;
      full_name: string;
      gender: string;
      birth_date?: string;
      death_date?: string;
    }>>('/api/lineage-video/persons/search', { params: { keyword, limit } }),
};

export default lineageVideoApi;
