import request from '@/utils/request';
import type { Pagination } from '@/types';

// ==================== 类型定义 ====================

export type FamilyBookGrouping = 'family' | 'branch' | 'generation';
export type FamilyBookStatus = 'draft' | 'preview' | 'ordered';

export type FamilyBookCoverTemplate =
  | 'red'
  | 'gold'
  | 'green'
  | 'ink'
  | 'modern';

export type FamilyBookPageType =
  | 'cover'
  | 'toc'
  | 'section'
  | 'person'
  | 'family'
  | 'epilogue';

export interface FamilyBookPerson {
  id: string;
  full_name: string;
  gender: 'male' | 'female';
  birth_date?: string | null;
  death_date?: string | null;
}

export interface FamilyBookStartPerson {
  id: string;
  full_name: string;
  gender: 'male' | 'female';
  birth_date?: string | null;
  death_date?: string | null;
}

export interface FamilyBookPrintOrderRef {
  id: string;
  status: string;
  specification?: string;
}

export interface FamilyBookProject {
  id: string;
  title: string;
  preface?: string | null;
  start_person: FamilyBookStartPerson;
  generations: number;
  include_spouse: boolean;
  grouping: FamilyBookGrouping;
  selected_fields: string[];
  cover_template: FamilyBookCoverTemplate;
  page_count: number;
  person_count: number;
  estimated_price: number;
  status: FamilyBookStatus;
  print_order: FamilyBookPrintOrderRef | null;
  pages?: FamilyBookPage[];
  created_at: string;
  updated_at: string;
}

export interface FamilyBookProjectSummary {
  id: string;
  title: string;
  start_person: {
    id: string;
    full_name: string;
    gender: 'male' | 'female';
  };
  generations: number;
  grouping: FamilyBookGrouping;
  cover_template: FamilyBookCoverTemplate;
  page_count: number;
  person_count: number;
  estimated_price: number;
  status: FamilyBookStatus;
  print_order: { id: string; status: string } | null;
  created_at: string;
  updated_at: string;
}

export interface FamilyBookPage {
  id: string;
  page_number: number;
  page_type: FamilyBookPageType;
  title?: string | null;
  subtitle?: string | null;
  body?: string | null;
  content: Record<string, any>;
}

export interface FamilyBookEstimate {
  person_count: number;
  group_count: number;
  page_count: number;
  estimated_price: number;
}

export interface CreateFamilyBookDto {
  start_person_id: number;
  generations?: number;
  include_spouse?: boolean;
  grouping?: FamilyBookGrouping;
  selected_fields?: string[];
  cover_template?: FamilyBookCoverTemplate;
  title?: string;
  preface?: string;
}

export interface UpdateFamilyBookDto {
  generations?: number;
  include_spouse?: boolean;
  grouping?: FamilyBookGrouping;
  selected_fields?: string[];
  cover_template?: FamilyBookCoverTemplate;
  title?: string;
  preface?: string;
}

export interface UpdateFamilyBookPageDto {
  title?: string;
  subtitle?: string;
  body?: string;
}

export interface PlaceFamilyBookOrderDto {
  specification: string;
  quantity?: number;
  shipping_address?: any;
}

export interface PlaceFamilyBookOrderResult {
  message: string;
  print_order_id: string;
  amount: number;
  page_count: number;
  quantity: number;
}

// ==================== API ====================

/**
 * 家庭图册 API
 */
export const familyBookApi = {
  /** 在家族内搜索人物 */
  searchPersons: (keyword?: string, limit = 20) =>
    request.get<FamilyBookPerson[]>('/api/family-book/persons/search', {
      params: { keyword, limit },
    }),

  /** 创建项目 */
  createProject: (data: CreateFamilyBookDto) =>
    request.post<{ id: string; message: string }>(
      '/api/family-book/projects',
      data,
    ),

  /** 获取我的项目列表 */
  listProjects: (params?: { page?: number; pageSize?: number }) =>
    request.get<
      Pagination<FamilyBookProjectSummary> & {
        data: FamilyBookProjectSummary[];
      }
    >('/api/family-book/projects', { params }),

  /** 获取项目详情 */
  getProject: (id: string) =>
    request.get<FamilyBookProject>(`/api/family-book/projects/${id}`),

  /** 预览估算 */
  previewEstimate: (id: string) =>
    request.post<FamilyBookEstimate>(
      `/api/family-book/projects/${id}/preview-estimate`,
    ),

  /** 生成预览内容 */
  generatePreview: (id: string) =>
    request.post<{ message: string; page_count: number; person_count: number; estimated_price: number }>(
      `/api/family-book/projects/${id}/generate`,
    ),

  /** 更新项目设置 */
  updateProject: (id: string, data: UpdateFamilyBookDto) =>
    request.put<{ message: string }>(`/api/family-book/projects/${id}`, data),

  /** 删除项目 */
  deleteProject: (id: string) =>
    request.delete<{ message: string }>(`/api/family-book/projects/${id}`),

  /** 编辑某个页面 */
  updatePage: (
    projectId: string,
    pageId: string,
    data: UpdateFamilyBookPageDto,
  ) =>
    request.put<{ message: string }>(
      `/api/family-book/projects/${projectId}/pages/${pageId}`,
      data,
    ),

  /** 下单印刷 */
  placeOrder: (projectId: string, data: PlaceFamilyBookOrderDto) =>
    request.post<PlaceFamilyBookOrderResult>(
      `/api/family-book/projects/${projectId}/order`,
      data,
    ),
};

export default familyBookApi;

// ==================== 常量配置 ====================

export const GROUPING_OPTIONS: Array<{
  value: FamilyBookGrouping;
  label: string;
  desc: string;
}> = [
  { value: 'family', label: '按家庭', desc: '每对夫妻及其子女为一组' },
  { value: 'branch', label: '按房支', desc: '按长房/二房等分支分组' },
  { value: 'generation', label: '按世代', desc: '按辈分分组' },
];

export const COVER_TEMPLATE_OPTIONS: Array<{
  value: FamilyBookCoverTemplate;
  label: string;
  preview_color: string;
}> = [
  { value: 'red', label: '喜庆红', preview_color: '#c0392b' },
  { value: 'gold', label: '典雅金', preview_color: '#b8860b' },
  { value: 'green', label: '清新绿', preview_color: '#2e7d4f' },
  { value: 'ink', label: '水墨风', preview_color: '#2c3e50' },
  { value: 'modern', label: '现代简约', preview_color: '#34495e' },
];

export const FIELD_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'name', label: '姓名' },
  { value: 'photo', label: '照片' },
  { value: 'birth', label: '生年' },
  { value: 'death', label: '卒年' },
  { value: 'bio', label: '简介' },
  { value: 'occupation', label: '职业' },
  { value: 'residence', label: '住址' },
  { value: 'birth_place', label: '出生地' },
];

export const FAMILY_BOOK_STATUS_LABEL: Record<FamilyBookStatus, string> = {
  draft: '草稿',
  preview: '已生成预览',
  ordered: '已下单',
};

export const FAMILY_BOOK_STATUS_TAG: Record<FamilyBookStatus, string> = {
  draft: 'info',
  preview: 'success',
  ordered: 'warning',
};
