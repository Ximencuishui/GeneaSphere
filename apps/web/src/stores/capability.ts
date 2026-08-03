import { defineStore } from 'pinia';
import { ref } from 'vue';
import { capabilityApi, type CapabilityStatus } from '@/api/capability';

const CAPABILITY_KEYS = [
  'video_generation',
  'ai_tools',
  'sms',
  'sms_recharge',
  'wechat',
] as const;

export const useCapabilityStore = defineStore('capability', () => {
  const statuses = ref<Record<string, CapabilityStatus>>({});
  const loaded = ref(false);
  const loading = ref(false);

  async function refresh(force = false) {
    if (loading.value) return;
    if (loaded.value && !force) return;
    loading.value = true;
    try {
      const res = await capabilityApi.list();
      const map: Record<string, CapabilityStatus> = {};
      for (const item of res.data) {
        map[item.key] = item;
      }
      statuses.value = map;
      loaded.value = true;
    } finally {
      loading.value = false;
    }
  }

  function isAvailable(key: (typeof CAPABILITY_KEYS)[number]): boolean {
    return statuses.value[key]?.available === true;
  }

  function reasonOf(key: (typeof CAPABILITY_KEYS)[number]): string {
    return statuses.value[key]?.reason || '该能力尚未配置';
  }

  return { statuses, loaded, loading, refresh, isAvailable, reasonOf };
});
