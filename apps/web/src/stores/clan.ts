import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { clanApi } from '@/api/clan';
import type { Clan, CreateClanDto, UpdateClanDto } from '@/types';

export const useClanStore = defineStore('clan', () => {
  // ==================== State ====================
  const clans = ref<Clan[]>([]);
  const currentClan = ref<Clan | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  // ==================== Getters ====================
  const clanCount = computed(() => clans.value.length);
  const currentClanId = computed(() => currentClan.value?.id);

  // ==================== Actions ====================

  /**
   * Fetch all clans for current user
   */
  async function fetchClans() {
    loading.value = true;
    error.value = null;

    try {
      const data = await clanApi.findAll();
      clans.value = data;
    } catch (err: any) {
      error.value = err.message || '获取家族列表失败';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Fetch a specific clan by ID
   */
  async function fetchClanById(id: string) {
    loading.value = true;
    error.value = null;

    try {
      const data = await clanApi.findOne(id);
      currentClan.value = data;
      return data;
    } catch (err: any) {
      error.value = err.message || '获取家族详情失败';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Create a new clan
   */
  async function createClan(data: CreateClanDto) {
    loading.value = true;
    error.value = null;

    try {
      const newClan = await clanApi.create(data);
      clans.value.push(newClan);
      currentClan.value = newClan;
      return newClan;
    } catch (err: any) {
      error.value = err.message || '创建家族失败';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Update a clan
   */
  async function updateClan(id: string, data: UpdateClanDto) {
    loading.value = true;
    error.value = null;

    try {
      const updatedClan = await clanApi.update(id, data);
      
      // Update in list
      const index = clans.value.findIndex((c) => c.id === Number(id));
      if (index !== -1) {
        clans.value[index] = updatedClan;
      }

      // Update current if it's the same
      if (currentClan.value?.id === Number(id)) {
        currentClan.value = updatedClan;
      }

      return updatedClan;
    } catch (err: any) {
      error.value = err.message || '更新家族失败';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Delete a clan
   */
  async function deleteClan(id: string) {
    loading.value = true;
    error.value = null;

    try {
      await clanApi.remove(id);

      // Remove from list
      clans.value = clans.value.filter((c) => c.id !== Number(id));

      // Clear current if it's the same
      if (currentClan.value?.id === Number(id)) {
        currentClan.value = null;
      }
    } catch (err: any) {
      error.value = err.message || '删除家族失败';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Set current clan
   */
  function setCurrentClan(clan: Clan | null) {
    currentClan.value = clan;
  }

  /**
   * Reset store state
   */
  function reset() {
    clans.value = [];
    currentClan.value = null;
    loading.value = false;
    error.value = null;
  }

  return {
    // State
    clans,
    currentClan,
    loading,
    error,

    // Getters
    clanCount,
    currentClanId,

    // Actions
    fetchClans,
    fetchClanById,
    createClan,
    updateClan,
    deleteClan,
    setCurrentClan,
    reset,
  };
});
