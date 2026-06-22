import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { ElMessage } from 'element-plus';
import router from '@/router';
import userApi from '@/api/user';
import { useAuthStore } from './auth';
import type {
  UserProfile,
  UserSetting,
  UserNotification,
} from '@/types';
import type {
  LinkedPerson,
  FamilyRelationChange,
  RelationPrivacyPreference,
  UpdateMarriagePayload,
  UpdateSpousePayload,
  AddChildPayload,
  UpdateCustodyPayload,
} from '@/types';
import { familyRelationApi } from '@/api/familyRelation';

/**
 * 用户中心全局状态：
 * - 聚合当前用户资料、设置、未读通知数
 * - 提供统一的 fetch / update 入口
 */
export const useUserCenterStore = defineStore('userCenter', () => {
  const authStore = useAuthStore();

  // 状态
  const profile = ref<UserProfile | null>(null);
  const settings = ref<UserSetting | null>(null);
  const unreadCount = ref(0);
  const notifications = ref<UserNotification[]>([]);

  const loading = ref(false);
  const saving = ref(false);

  const isLoggedIn = computed(() => authStore.isLoggedIn);
  const isFamilyAdmin = computed(
    () =>
      profile.value?.primary_clan?.role === 'OWNER' ||
      profile.value?.primary_clan?.role === 'ADMIN',
  );

  // ============ 资料 ============

  async function fetchProfile(): Promise<UserProfile | null> {
    if (!isLoggedIn.value) return null;
    loading.value = true;
    try {
      const data = (await userApi.profile.get()) as unknown as UserProfile;
      profile.value = data;
      return data;
    } catch (err) {
      console.error('[userCenter] fetchProfile failed:', err);
      return null;
    } finally {
      loading.value = false;
    }
  }

  async function updateProfile(payload: {
    nickname?: string;
    email?: string;
    gender?: 'male' | 'female';
    birth_date?: string;
    avatar_url?: string;
  }) {
    saving.value = true;
    try {
      await userApi.profile.update(payload);
      ElMessage.success('资料已保存');
      await fetchProfile();
    } catch (err) {
      throw err;
    } finally {
      saving.value = false;
    }
  }

  async function uploadAvatarByDataUrl(dataUrl: string): Promise<string> {
    saving.value = true;
    try {
      const res = (await userApi.profile.uploadAvatarByDataUrl(
        dataUrl,
      )) as unknown as { avatar_url: string };
      ElMessage.success('头像已更新');
      await fetchProfile();
      return res.avatar_url;
    } finally {
      saving.value = false;
    }
  }

  async function uploadAvatarByFile(file: File): Promise<string> {
    saving.value = true;
    try {
      const res = (await userApi.profile.uploadAvatarByFile(
        file,
      )) as unknown as { avatar_url: string };
      ElMessage.success('头像已更新');
      await fetchProfile();
      return res.avatar_url;
    } finally {
      saving.value = false;
    }
  }

  // ============ 密码与账号 ============

  async function changePassword(payload: {
    old_password: string;
    new_password: string;
    confirm_password: string;
  }) {
    await userApi.password.change(payload);
    ElMessage.success('密码已更新');
  }

  async function deleteAccount(confirmation: string) {
    await userApi.account.delete(confirmation);
    ElMessage.success('账号已注销');
    authStore.logout();
    router.push('/login');
  }

  // ============ 设置 ============

  async function fetchSettings(): Promise<UserSetting | null> {
    try {
      const data = (await userApi.settings.get()) as unknown as UserSetting;
      settings.value = data;
      return data;
    } catch (err) {
      console.error('[userCenter] fetchSettings failed:', err);
      return null;
    }
  }

  async function updateSettings(payload: Partial<UserSetting>) {
    saving.value = true;
    try {
      await userApi.settings.update(payload);
      ElMessage.success('设置已保存');
      await fetchSettings();
    } finally {
      saving.value = false;
    }
  }

  // ============ 通知 ============

  async function fetchUnreadCount() {
    if (!isLoggedIn.value) {
      unreadCount.value = 0;
      return;
    }
    try {
      const res = (await userApi.notifications.unreadCount()) as unknown as {
        unread_count: number;
      };
      unreadCount.value = res.unread_count;
    } catch {
      unreadCount.value = 0;
    }
  }

  async function fetchNotifications() {
    try {
      const res = (await userApi.notifications.list()) as unknown as {
        data: UserNotification[];
      };
      notifications.value = res.data;
    } catch (err) {
      console.error('[userCenter] fetchNotifications failed:', err);
    }
  }

  async function markNotificationRead(id: string | number) {
    await userApi.notifications.markRead(id);
    const item = notifications.value.find((n) => String(n.id) === String(id));
    if (item) item.is_read = true;
    unreadCount.value = Math.max(0, unreadCount.value - 1);
  }

  // ============ 重置 ============

  function reset() {
    profile.value = null;
    settings.value = null;
    notifications.value = [];
    unreadCount.value = 0;
    linkedPersons.value = [];
    relationHistory.value = [];
    privacyPreference.value = null;
  }

  // ============ 柔性家庭关系更新 ============

  const linkedPersons = ref<LinkedPerson[]>([]);
  const relationHistory = ref<FamilyRelationChange[]>([]);
  const privacyPreference = ref<RelationPrivacyPreference | null>(null);

  async function fetchMyPerson() {
    try {
      linkedPersons.value = (await familyRelationApi.myPerson()) as unknown as LinkedPerson[];
    } catch (err) {
      console.error('[userCenter] fetchMyPerson failed:', err);
    }
  }

  async function fetchRelationHistory(params?: {
    person_id?: string;
    change_type?: string;
    start_date?: string;
    end_date?: string;
    page?: number;
    pageSize?: number;
  }) {
    try {
      const res = (await familyRelationApi.history(params || {})) as unknown as {
        data: FamilyRelationChange[];
        pagination: any;
      };
      relationHistory.value = res.data;
      return res;
    } catch (err) {
      console.error('[userCenter] fetchRelationHistory failed:', err);
    }
  }

  async function updateMarriage(payload: UpdateMarriagePayload) {
    return familyRelationApi.updateMarriage(payload);
  }

  async function updateSpouse(payload: UpdateSpousePayload) {
    return familyRelationApi.updateSpouse(payload);
  }

  async function addChild(payload: AddChildPayload) {
    return familyRelationApi.addChild(payload);
  }

  async function updateCustody(childId: string, payload: UpdateCustodyPayload) {
    return familyRelationApi.updateCustody(childId, payload);
  }

  async function fetchPrivacyPreference() {
    try {
      privacyPreference.value = await familyRelationApi.privacy.get();
    } catch (err) {
      console.error('[userCenter] fetchPrivacyPreference failed:', err);
    }
  }

  async function updatePrivacyPreference(payload: Partial<RelationPrivacyPreference>) {
    privacyPreference.value = await familyRelationApi.privacy.update(payload);
  }

  return {
    profile,
    settings,
    notifications,
    unreadCount,
    loading,
    saving,
    isLoggedIn,
    isFamilyAdmin,
    // 家庭关系
    linkedPersons,
    relationHistory,
    privacyPreference,
    fetchMyPerson,
    fetchRelationHistory,
    updateMarriage,
    updateSpouse,
    addChild,
    updateCustody,
    fetchPrivacyPreference,
    updatePrivacyPreference,
    // 原有
    fetchProfile,
    updateProfile,
    uploadAvatarByDataUrl,
    uploadAvatarByFile,
    changePassword,
    deleteAccount,
    fetchSettings,
    updateSettings,
    fetchUnreadCount,
    fetchNotifications,
    markNotificationRead,
    reset,
  };
});