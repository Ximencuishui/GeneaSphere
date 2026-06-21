/**
 * GeneaSphere 全局类型定义
 */

// ==================== 家族相关 ====================

export interface Clan {
  id: number;
  name: string;
  description?: string;
  settings_json?: any;
  admin_user_id: string;
  created_at: string;
  updated_at: string;
  admin_user?: {
    id: string;
    phone: string;
  };
  _count?: {
    persons: number;
    media?: number;
  };
}

export interface CreateClanDto {
  name: string;
  description?: string;
  settings_json?: any;
}

export interface UpdateClanDto {
  name?: string;
  description?: string;
  settings_json?: any;
}

export interface ClanStatistics {
  person_count: number;
  media_count: number;
  family_count: number;
}

// ==================== 用户相关 ====================

export interface User {
  id: string;
  phone: string;
  created_at: string;
  updated_at: string;
}

export interface LoginDto {
  phone: string;
  password: string;
}

export interface RegisterDto {
  phone: string;
  password: string;
}

export interface AuthResponse {
  access_token: string;
  user: User;
}

// ==================== 族谱树相关 ====================

export interface Person {
  id: number;
  clan_id: number;
  full_name: string;
  gender: 'male' | 'female';
  birth_date?: string;
  death_date?: string;
  is_living: boolean;
  created_at: string;
  updated_at: string;
}

export interface GenealogyNode {
  id: string;
  label: string;
  gender: 'male' | 'female';
  is_living: boolean;
  birth_year?: number;
  death_year?: number;
  children?: GenealogyNode[];
}

export interface TreeResponse {
  nodes: GenealogyNode[];
  edges: {
    source: string;
    target: string;
  }[];
}

// ==================== 导入相关 ====================

export interface ImportTemplate {
  id: number;
  name: string;
  description?: string;
}

export interface ColumnMapping {
  excelColumn: string;
  targetField: string;
  required: boolean;
}

export interface ImportPreview {
  total: number;
  valid: number;
  errors: {
    row: number;
    message: string;
  }[];
  data: any[];
}

// ==================== 寻亲相关 ====================

export interface SearchPost {
  id: number;
  origin_place: string;
  xipai_keywords: string[];
  contact_info: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CreateSearchPostDto {
  origin_place: string;
  xipai_keywords: string[];
  contact_info: string;
}

// ==================== 媒体档案相关 ====================

export interface MediaArchive {
  id: number;
  clan_id: number;
  uploader_id: string;
  file_url: string;
  taken_year?: number;
  taken_location?: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateMediaDto {
  clan_id: number;
  file_url: string;
  taken_year?: number;
  taken_location?: string;
  description?: string;
}
