import request from '@/utils/request';
import type { CreateClanDto, UpdateClanDto, Clan } from '@/types';

/**
 * 家族统计数据（与 view 端解耦，避免类型循环依赖）
 */
export interface ClanStatistics {
  person_count: number;
  media_count: number;
  family_count: number;
}

export const clanApi = {
  /**
   * Create a new clan
   * The authenticated user becomes the admin
   */
  create: (data: CreateClanDto) =>
    request.post<CreateClanDto, Clan>('/api/clans', data),

  /**
   * Get all clans
   * If user is authenticated, returns only their clans
   */
  findAll: () =>
    request.get<Clan[], Clan[]>('/api/clans'),

  /**
   * Get a specific clan by ID
   */
  findOne: (id: string) =>
    request.get<Clan, Clan>(`/api/clans/${id}`),

  /**
   * Update a clan
   * Only the clan admin can update
   */
  update: (id: string, data: UpdateClanDto) =>
    request.patch<UpdateClanDto, Clan>(`/api/clans/${id}`, data),

  /**
   * Delete a clan
   * Only the clan admin can delete
   */
  remove: (id: string) =>
    request.delete<{ message: string }, { message: string }>(`/api/clans/${id}`),

  /**
   * Get clan statistics
   */
  getStatistics: (id: string) =>
    request.get<ClanStatistics, ClanStatistics>(`/api/clans/${id}/statistics`),
};
