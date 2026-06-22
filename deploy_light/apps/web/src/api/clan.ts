import request from '@/utils/request';
import type { CreateClanDto, UpdateClanDto, Clan } from '@/types';

export const clanApi = {
  /**
   * Create a new clan
   * The authenticated user becomes the admin
   */
  create: (data: CreateClanDto) =>
    request.post('/api/clans', data),

  /**
   * Get all clans
   * If user is authenticated, returns only their clans
   */
  findAll: () =>
    request.get('/api/clans'),

  /**
   * Get a specific clan by ID
   */
  findOne: (id: string) =>
    request.get(`/api/clans/${id}`),

  /**
   * Update a clan
   * Only the clan admin can update
   */
  update: (id: string, data: UpdateClanDto) =>
    request.patch(`/api/clans/${id}`, data),

  /**
   * Delete a clan
   * Only the clan admin can delete
   */
  remove: (id: string) =>
    request.delete(`/api/clans/${id}`),

  /**
   * Get clan statistics
   */
  getStatistics: (id: string) =>
    request.get(`/api/clans/${id}/statistics`),
};
