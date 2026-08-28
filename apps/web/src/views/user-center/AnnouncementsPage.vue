<!--
  家族公告（族员只读 · P2 阶段）
  --------------------------------------------------------------------
  - 列表展示家族管理员发布的公告，按置顶 / 发布时间排序；
  - 已读 / 未读状态以左侧色点与标签双重标记；
  - 点击列表项弹出详情抽屉，查看正文后自动标记已读；
  - 空态 / 仅置顶 等局部筛选通过 ElSegmented 切换。
-->
<template>
  <div class="page">
    <header class="page-header">
      <h2 class="page-title">家族公告</h2>
      <p class="page-tip">
        本页展示家族管理员发布的公告，仅可阅读；
        管理员侧公告管理页位于 <code>/zupu/{{ primaryClanSlug }}/announcements</code>。
      </p>
    </header>

    <div class="toolbar">
      <ElSegmented
        v-model="filterMode"
        :options="[
          { label: '全部', value: 'all' },
          { label: '仅未读', value: 'unread' },
          { label: '仅置顶', value: 'pinned' },
        ]"
      />
      <ElButton
        :icon="Refresh"
        :loading="loading"
        @click="fetchList"
        aria-label="刷新列表"
      >
        刷新
      </ElButton>
    </div>

    <div v-loading="loading" class="ann-list">
      <template v-if="filteredList.length > 0">
        <article
          v-for="a in filteredList"
          :key="a.id"
          class="ann-card"
          :class="{ 'ann-card--unread': !a.is_read }"
          @click="openDetail(a)"
        >
          <div class="ann-card-side">
            <span v-if="a.is_pinned" class="pin-badge" title="置顶">
              <ElIcon><StarFilled /></ElIcon>
            </span>
            <span v-else class="read-dot" :class="{ 'read-dot--unread': !a.is_read }"></span>
          </div>
          <div class="ann-card-main">
            <div class="ann-card-title">
              <span class="title-text">{{ a.title }}</span>
              <ElTag v-if="!a.is_read" size="small" type="danger" effect="plain">未读</ElTag>
              <ElTag v-else size="small" type="info" effect="plain">已读</ElTag>
            </div>
            <p class="ann-card-preview">{{ previewOf(a.content) }}</p>
            <div class="ann-card-meta">
              <span class="meta-author">{{ a.creator_name || '管理员' }}</span>
              <span class="meta-time">{{ formatDate(a.published_at || a.created_at) }}</span>
            </div>
          </div>
          <ElIcon class="ann-card-arrow"><ArrowRight /></ElIcon>
        </article>
      </template>
      <div v-else-if="!loading" class="empty-tip">
        <ElIcon :size="32" color="#c9a96e"><BellFilled /></ElIcon>
        <p>{{ emptyText }}</p>
      </div>
    </div>

    <!-- 详情抽屉 -->
    <ElDrawer
      v-model="detailVisible"
      :title="current?.title || '公告详情'"
      direction="rtl"
      size="480px"
      :with-header="true"
    >
      <template v-if="current">
        <div class="detail-header">
          <ElTag v-if="current.is_pinned" type="warning" size="small">置顶</ElTag>
          <span class="detail-time">
            {{ formatDate(current.published_at || current.created_at) }}
          </span>
          <span class="detail-author">发布人：{{ current.creator_name || '管理员' }}</span>
        </div>
        <ElImage
          v-if="current.cover_url"
          :src="current.cover_url"
          class="detail-cover"
          fit="cover"
        />
        <div class="detail-content">{{ current.content }}</div>
        <footer class="detail-footer">
          <ElButton text @click="closeDetail">关闭</ElButton>
        </footer>
      </template>
    </ElDrawer>
  </div>
</template>

<script setup lang="ts">
/**
 * 家族公告族员只读页
 * - 调用 /api/user/clan-announcements（按主家族自动定位）
 * - 详情查看后调用 /api/user/clan-announcements/:id/read 标记已读
 * - 已读 / 未读仅依赖本地内存更新（下次进入页面会重新拉取）
 */
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import {
  Refresh,
  StarFilled,
  ArrowRight,
  BellFilled,
} from '@element-plus/icons-vue'
import userApi from '@/api/user'
import { useUserCenterStore } from '@/stores/userCenter'
import type { UserClanAnnouncement } from '@/types'

const userStore = useUserCenterStore()

const primaryClanSlug = computed(() => userStore.profile?.primary_clan?.slug || '')

const list = ref<(UserClanAnnouncement & { is_read: boolean })[]>([])
const loading = ref(false)

const filterMode = ref<'all' | 'unread' | 'pinned'>('all')

const detailVisible = ref(false)
const current = ref<(UserClanAnnouncement & { is_read: boolean }) | null>(null)

const filteredList = computed(() => {
  if (filterMode.value === 'unread') return list.value.filter((a) => !a.is_read)
  if (filterMode.value === 'pinned') return list.value.filter((a) => a.is_pinned)
  return list.value
})

const emptyText = computed(() => {
  if (filterMode.value === 'unread') return '没有未读公告'
  if (filterMode.value === 'pinned') return '没有置顶公告'
  return primaryClanSlug.value
    ? '家族管理员还未发布公告'
    : '您尚未加入家族，无法查看公告'
})

const formatDate = (d: string | null) => (d ? new Date(d).toLocaleString() : '—')

const previewOf = (s: string) => {
  if (!s) return ''
  // 去掉换行，截前 80 字符
  return s.replace(/\s+/g, ' ').slice(0, 80) + (s.length > 80 ? '…' : '')
}

const fetchList = async () => {
  loading.value = true
  try {
    const res = (await userApi.announcements.list({ page: 1, pageSize: 50 })) as unknown as {
      data: (UserClanAnnouncement & { is_read: boolean })[]
      pagination?: any
    }
    list.value = res?.data || []
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

const openDetail = async (a: UserClanAnnouncement & { is_read: boolean }) => {
  current.value = a
  detailVisible.value = true
  if (!a.is_read) {
    try {
      await userApi.announcements.markRead(a.id)
      a.is_read = true
      // 同步到列表
      const target = list.value.find((x) => x.id === a.id)
      if (target) target.is_read = true
    } catch (e: any) {
      console.warn('[Announcements] 标记已读失败：', e?.message)
    }
  }
}

const closeDetail = () => {
  detailVisible.value = false
}

onMounted(async () => {
  if (!userStore.profile) {
    await userStore.fetchProfile()
  }
  await fetchList()
})
</script>

<style scoped>
.page {
  max-width: 880px;
  margin: 0 auto;
  padding: 16px;
}
.page-header {
  margin-bottom: 16px;
}
.page-title {
  margin: 0 0 4px 0;
  font-size: 18px;
  color: #303133;
}
.page-tip {
  margin: 0;
  color: #909399;
  font-size: 13px;
  line-height: 1.7;
}
.page-tip code {
  background: #f5f7fa;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 12px;
  color: #5d4037;
}
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.ann-list {
  min-height: 200px;
}
.ann-card {
  display: flex;
  align-items: stretch;
  gap: 12px;
  background: #fff;
  border: 1px solid #ebeef5;
  border-radius: 10px;
  padding: 14px 16px;
  margin-bottom: 12px;
  cursor: pointer;
  transition: border-color 0.2s ease, box-shadow 0.2s ease,
    transform 0.2s ease;
}
.ann-card:hover {
  border-color: #c9a96e;
  box-shadow: 0 6px 18px rgba(93, 64, 55, 0.08);
  transform: translateY(-1px);
}
.ann-card--unread {
  border-left: 3px solid #c9a96e;
  background: #fdf8ef;
}
.ann-card-side {
  width: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.pin-badge {
  color: #c9a96e;
}
.read-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #dcdfe6;
}
.read-dot--unread {
  background: #c9a96e;
  box-shadow: 0 0 0 4px rgba(201, 169, 110, 0.18);
}
.ann-card-main {
  flex: 1;
  min-width: 0;
}
.ann-card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  color: #303133;
}
.title-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ann-card-preview {
  margin: 6px 0 4px;
  color: #606266;
  font-size: 13px;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.ann-card-meta {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: #909399;
}
.ann-card-arrow {
  align-self: center;
  color: #c0c4cc;
  flex-shrink: 0;
}
.empty-tip {
  text-align: center;
  padding: 60px 0;
  color: #909399;
}
.empty-tip p {
  margin: 12px 0 0;
  font-size: 14px;
}
.detail-header {
  display: flex;
  align-items: center;
  gap: 12px;
  color: #909399;
  font-size: 13px;
  margin-bottom: 12px;
}
.detail-cover {
  width: 100%;
  border-radius: 8px;
  margin-bottom: 12px;
}
.detail-content {
  white-space: pre-wrap;
  color: #303133;
  font-size: 14px;
  line-height: 1.8;
}
.detail-footer {
  margin-top: 24px;
  text-align: right;
}
</style>
