import request from '@/utils/request';
import type {
  MigrationPoi,
  MigrationEvent,
  CreateMigrationEventDto,
  UpdateMigrationEventDto,
  Branch,
  Dynasty,
  LocationMediaItem,
  LinkLocationMediaDto,
} from '@/types';

/**
 * 迁徙地图 API
 */
export const migrationApi = {
  // ============ 查询接口 ============

  /**
   * 获取家族 POI 列表
   */
  getPois: (clanId: string | number, branch?: string) =>
    request.get<MigrationPoi[], MigrationPoi[]>(`/api/migration/${clanId}/pois`, {
      params: branch ? { branch } : undefined,
    }),

  /**
   * 获取迁徙事件列表
   */
  getEvents: (clanId: string | number, branch?: string) =>
    request.get<MigrationEvent[], MigrationEvent[]>(`/api/migration/${clanId}/events`, {
      params: branch ? { branch } : undefined,
    }),

  /**
   * 获取支系列表
   */
  getBranches: (clanId: string | number) =>
    request.get<Branch[], Branch[]>(`/api/migration/${clanId}/branches`),

  /**
   * 获取预置朝代数据
   */
  getDynasties: () => request.get<Dynasty[], Dynasty[]>('/api/migration/dynasties'),

  /**
   * 获取某地点关联的图片
   */
  getLocationMedia: (clanId: string | number, location: string) =>
    request.get<LocationMediaItem[], LocationMediaItem[]>(`/api/migration/${clanId}/location-media`, {
      params: { location },
    }),

  // ============ 迁徙事件 CRUD（管理员） ============

  /**
   * 创建迁徙事件
   */
  createEvent: (clanId: string | number, data: CreateMigrationEventDto) =>
    request.post<{ id: string; message: string }, { id: string; message: string }>(
      `/api/migration/${clanId}/events`,
      data,
    ),

  /**
   * 更新迁徙事件
   */
  updateEvent: (
    clanId: string | number,
    id: string,
    data: UpdateMigrationEventDto,
  ) =>
    request.put<{ message: string }, { message: string }>(
      `/api/migration/${clanId}/events/${id}`,
      data,
    ),

  /**
   * 删除迁徙事件
   */
  deleteEvent: (clanId: string | number, id: string) =>
    request.delete<{ message: string }, { message: string }>(`/api/migration/${clanId}/events/${id}`),

  // ============ 地点-图片关联（管理员） ============

  /**
   * 关联图片到地点
   */
  linkLocationMedia: (
    clanId: string | number,
    data: LinkLocationMediaDto,
  ) =>
    request.post<{ id: string; message: string }, { id: string; message: string }>(
      `/api/migration/${clanId}/location-media`,
      data,
    ),

  /**
   * 解除图片与地点的关联
   */
  unlinkLocationMedia: (clanId: string | number, linkId: string) =>
    request.delete<{ message: string }, { message: string }>(
      `/api/migration/${clanId}/location-media/${linkId}`,
    ),

  // ============ 经纬度补全（管理员） ============

  /**
   * 获取所有缺少经纬度的地点
   */
  getMissingCoords: (clanId: string | number) =>
    request.get<
      Array<{ name: string; lat: number | null; lng: number | null; person_count: number }>
    , 
      Array<{ name: string; lat: number | null; lng: number | null; person_count: number }>
    >(`/api/migration/${clanId}/locations/missing-coords`),

  /**
   * 补全地点经纬度
   */
  fillCoords: (
    clanId: string | number,
    data: { location_name: string; lat: number; lng: number },
  ) =>
    request.post<{ message: string }, { message: string }>(
      `/api/migration/${clanId}/locations/fill-coords`,
      data,
    ),
};

export default migrationApi;
