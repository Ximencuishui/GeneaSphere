/**
 * 寻根路（xungenlu.cn）全局类型定义
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
  id: number | string;
  label?: string;
  full_name?: string;
  gender: 'male' | 'female';
  is_living: boolean;
  birth_date?: string;
  death_date?: string;
  birth_year?: number;
  death_year?: number;
  children?: GenealogyNode[];
  avatar_url?: string;
  thumbnail_url?: string;
  has_photo: boolean;
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
  display_url?: string;
  thumb_url?: string;
  original_key?: string;
  taken_year?: number;
  taken_location?: string;
  description?: string;
  created_at: string;
  updated_at: string;
  file_size?: number;
  media_type?: string;
}

export interface CreateMediaDto {
  clan_id: number;
  file_url: string;
  taken_year?: number;
  taken_location?: string;
  description?: string;
}

// ==================== 用户中心相关 ====================

export type UserRoleInClan = 'OWNER' | 'ADMIN' | 'EDITOR' | 'VIEWER';

export interface UserClanBrief {
  id: string;
  name: string;
  description?: string | null;
  role: UserRoleInClan;
  joined_at?: string;
  last_active_at?: string;
}

export interface UserStats {
  photo_count: number;
  annotation_count: number;
  order_count: number;
  video_count: number;
  group_count: number;
}

export interface UserPrimaryClan {
  id: string;
  name: string;
  description?: string | null;
  role: UserRoleInClan;
}

export interface UserProfile {
  id: string;
  phone: string;
  phone_raw?: string;
  nickname?: string | null;
  email?: string | null;
  gender?: 'male' | 'female' | null;
  birth_date?: string | null;
  avatar_url?: string | null;
  created_at: string;
  updated_at: string;
  primary_clan?: UserPrimaryClan | null;
  families?: UserClanBrief[];
  stats?: UserStats;
  setting?: UserSetting | null;
}

export interface UserSetting {
  allow_cross_clan_friend_finding: boolean;
  show_childhood_location: boolean;
  allow_photo_find_me: boolean;
  allow_annotation_for_match: boolean;
  enable_in_app_notification: boolean;
  enable_sms_notification: boolean;
  phone_bound?: string | null;
}

export interface UserPhotoItem {
  id: string;
  file_url: string;
  taken_year?: number | null;
  taken_location?: string | null;
  description?: string | null;
  media_type?: string;
  created_at: string;
  clan?: { id: string; name: string } | null;
}

export interface UserAnnotationPerson {
  id: string;
  full_name: string;
  gender?: 'male' | 'female';
  birth_date?: string | null;
  death_date?: string | null;
}

export interface UserAnnotation {
  link_id: string;
  relation_note: string;
  relation_status: string;
  media: {
    id: string;
    file_url: string;
    taken_year?: number | null;
    taken_location?: string | null;
    description?: string | null;
    created_at: string;
  };
  person?: UserAnnotationPerson | null;
}

export interface UserOrder {
  id: string;
  specification: string;
  quantity: number;
  amount: number;
  status: string;
  tracking_no?: string | null;
  tracking_company?: string | null;
  refund_status?: string;
  created_at: string;
  updated_at: string;
}

export interface UserOrderDetail extends UserOrder {
  shipping_address?: any;
  refund_amount?: number;
  refund_reason?: string | null;
  refunded_at?: string | null;
}

export interface UserToolHistoryItem {
  id: string;
  tool_type: string;
  processed_at: string;
  result_thumbnail?: string;
  original_url?: string;
  result_url?: string;
  status?: string;
}

export interface UserGroup {
  id: string;
  name: string;
  member_count: number;
  last_active_at: string;
  unread_topic_count: number;
}

export interface UserVideo {
  id: string;
  target_person_name: string;
  target_person?: {
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
  generated_at: string;
  duration_seconds: number;
  material_count: number;
  style?: string;
  preview_url?: string;
  error_message?: string;
}

export interface UserNotification {
  id: string;
  type: string;
  title: string;
  content: string;
  target_type?: string | null;
  target_id?: string | null;
  is_read: boolean;
  created_at: string;
}

export interface Pagination<T> {
  data: T[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
}

// ==================== 小组讨论相关 ====================

export interface DiscussionGroup {
  id: string;
  name: string;
  description?: string | null;
  cover_url?: string | null;
  is_public?: boolean;
  creator_id?: string;
  member_count: number;
  topic_count: number;
  unread_topic_count: number;
  last_active_at: string;
  my_role: 'CREATOR' | 'ADMIN' | 'MEMBER';
  created_at?: string;
  updated_at?: string;
}

export interface GroupMember {
  user_id: string;
  nickname: string;
  avatar_url?: string | null;
  role: 'CREATOR' | 'ADMIN' | 'MEMBER';
  joined_at: string;
}

export interface GroupTopic {
  id: string;
  group_id: string;
  author: {
    id: string;
    nickname?: string | null;
    avatar_url?: string | null;
  };
  title: string;
  content: string;
  reply_count: number;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}

export interface TopicReply {
  id: string;
  author: {
    id: string;
    nickname?: string | null;
    avatar_url?: string | null;
  };
  content: string;
  media_urls: string[];
  created_at: string;
}

export interface TopicDetail extends GroupTopic {
  group_name: string;
  replies: {
    data: TopicReply[];
    pagination: {
      total: number;
      page: number;
      pageSize: number;
    };
  };
}

export interface SummaryContent {
  background: string;
  main_points: Array<{
    author: string;
    point: string;
    evidence?: string;
  }>;
  consensus: string[];
  disagreements: string[];
  action_items: Array<{
    task: string;
    assignee?: string;
    deadline?: string;
  }>;
  attachments: Array<{
    type: string;
    url: string;
    description: string;
  }>;
}

export interface DiscussionSummary {
  id: string;
  group_id: string;
  group_name?: string;
  summary_type: 'topic' | 'group';
  source_topic_id?: string;
  source_topic_title?: string;
  time_range_start?: string;
  time_range_end?: string;
  title: string;
  content?: SummaryContent;
  version: number;
  generated_by: {
    id: string;
    nickname: string;
    avatar_url?: string | null;
  };
  created_at: string;
  updated_at: string;
}

export interface SummaryVersion {
  version: number;
  content: SummaryContent;
  editor: {
    id: string;
    nickname: string;
  };
  edited_at: string;
}

// ==================== 迁徙地图相关 ====================

export interface MigrationPoi {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  person_count: number;
  media_count: number;
  earliest_year?: number;
  latest_year?: number;
  source: 'birth' | 'death' | 'migration' | 'mixed';
  branch?: string | null;
}

export interface MigrationEvent {
  id: string;
  clan_id: string;
  person_id?: string | null;
  person?: {
    id: string;
    full_name: string;
    gender: 'male' | 'female';
    birth_date?: string | null;
    death_date?: string | null;
  } | null;
  branch?: string | null;
  from_location: string;
  from_lat?: number | null;
  from_lng?: number | null;
  to_location: string;
  to_lat?: number | null;
  to_lng?: number | null;
  event_year: number;
  reason?:
    | 'WAR'
    | 'BUSINESS'
    | 'OFFICIAL'
    | 'RECLAMATION'
    | 'FAMINE'
    | 'OTHER'
    | null;
  description?: string | null;
  created_at: string;
}

export interface CreateMigrationEventDto {
  person_id?: string;
  branch?: string;
  from_location: string;
  from_lat?: number;
  from_lng?: number;
  to_location: string;
  to_lat?: number;
  to_lng?: number;
  event_year: number;
  reason?: 'WAR' | 'BUSINESS' | 'OFFICIAL' | 'RECLAMATION' | 'FAMINE' | 'OTHER';
  description?: string;
}

export interface UpdateMigrationEventDto
  extends Partial<CreateMigrationEventDto> {}

export interface Branch {
  name: string;
}

export interface Dynasty {
  id: number;
  name: string;
  start_year: number;
  end_year: number;
  geojson_url?: string | null;
  description?: string | null;
  color?: string | null;
  fill_opacity: number;
  label_position?: { lat: number; lng: number } | null;
}

export interface LocationMediaItem {
  id: string;
  location_name: string;
  display_order: number;
  media: {
    id: string;
    file_url: string;
    taken_year?: number | null;
    taken_location?: string | null;
    description?: string | null;
    media_type: string;
  };
}

export interface LinkLocationMediaDto {
  location_name: string;
  media_id: string;
  display_order?: number;
}

// ==================== 个人空间相关 ====================

export type SpacePrivacyLevel = 'self' | 'clan' | 'lineage' | 'public' | 'same_location'

export interface UserAlbum {
  id: string
  name: string
  description?: string | null
  cover_photo_url?: string | null
  default_privacy: SpacePrivacyLevel
  photo_count: number
  created_at: string
  updated_at: string
}

export interface UserPhoto {
  id: string
  album_id: string
  album_name: string
  file_url: string
  thumbnail_url?: string | null
  location_name: string
  taken_year: number
  taken_date?: string | null
  description?: string | null
  privacy: SpacePrivacyLevel
  tagged_person_ids?: any
  file_size?: string | null
  created_at: string
}

export interface UserMessage {
  id: string
  content: string
  image_url?: string | null
  privacy: SpacePrivacyLevel
  like_count: number
  is_edited: boolean
  created_at: string
  updated_at: string
  can_edit: boolean
  author: {
    nickname: string
    avatar_url?: string | null
  }
}

export interface UserStorageInfo {
  used_bytes: string
  quota_bytes: string
  used_mb: number
  quota_mb: number
}

// ==================== 柔性家庭关系更新 ====================

export interface LinkedPerson {
  person_id: string;
  clan_id: string;
  relation_role: 'self' | 'parent' | 'child' | 'spouse';
  full_name: string;
  gender: 'male' | 'female';
}

export interface MarriageInfo {
  status: 'married' | 'not_in_marriage' | 'widowed' | 'remarried';
  current_spouse?: { id: string; full_name: string };
  has_history: boolean;
}

export interface ChildInfo {
  id: string;
  full_name: string;
  gender: 'male' | 'female';
  custody_visible?: boolean;
  custody_status?: 'living_with' | 'not_living_with' | 'joint';
}

export interface CurrentRelationship {
  person: { id: string; full_name: string; gender: 'male' | 'female' };
  marriage?: MarriageInfo;
  children: ChildInfo[];
}

export interface FamilyRelationChange {
  id: string;
  person_id: string;
  person_name?: string;
  change_type: 'marriage' | 'spouse' | 'child' | 'custody';
  previous_state: any;
  current_state: any;
  privacy_level: 'self' | 'admin' | 'clan';
  status: 'pending' | 'approved' | 'rejected' | 'auto_approved' | 'needs_manual';
  change_reason?: string;
  needs_manual: boolean;
  is_disputed: boolean;
  created_at: string;
}

export interface RelationPrivacyPreference {
  share_marriage_history: boolean;
  share_custody_details: boolean;
  show_biological_status: boolean;
  enable_change_notifications: boolean;
}

export interface UpdateMarriagePayload {
  person_id: string;
  current_status: 'married' | 'not_in_marriage' | 'widowed' | 'remarried';
  keep_previous_spouse?: boolean;
  change_reason?: string;
}

export interface NewSpouseInfo {
  full_name: string;
  gender: 'male' | 'female';
  birth_date?: string;
  clan_id?: string;
  is_external: boolean;
}

export interface UpdateSpousePayload {
  person_id: string;
  action: 'add' | 'remove' | 'replace';
  spouse_person_id?: string;
  new_spouse?: NewSpouseInfo;
  start_date?: string;
  change_reason?: string;
}

export interface AddChildPersonDto {
  full_name: string;
  gender: 'male' | 'female';
  birth_date?: string;
  father_info_missing: boolean;
  mother_info_missing: boolean;
}

export interface AddChildPayload {
  parent_person_id: string;
  child: AddChildPersonDto;
  custody: 'living_with' | 'not_living_with' | 'joint';
  change_reason?: string;
}

export interface UpdateCustodyPayload {
  child_id: string;
  custody_status: 'living_with' | 'not_living_with' | 'joint';
  is_biological?: boolean;
  change_reason?: string;
}
