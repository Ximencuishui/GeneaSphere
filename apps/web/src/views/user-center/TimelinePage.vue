<script setup lang="ts">
import { ref, onMounted, computed, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import { Picture, Location, Refresh } from '@element-plus/icons-vue'
import userApi from '@/api/user'
import type { UserPhotoItem, Pagination } from '@/types'

const loading = ref(false)
const error = ref<string | null>(null)
const photos = ref<UserPhotoItem[]>([])
const total = ref(0)
const currentPage = ref(1)
const pageSize = ref(20)
const filterYear = ref<number | undefined>(undefined)
const filterClanId = ref<string>('')
const filterTimer = ref<ReturnType<typeof setTimeout> | null>(null)

// 简单防重：记一个递增的请求序号，回调时过期响应被丢弃
let requestSeq = 0

async function fetchPhotos() {
  if (loading.value) return
  const mySeq = ++requestSeq
  loading.value = true
  error.value = null
  try {
    const res = (await userApi.photos.list({
      page: currentPage.value,
      pageSize: pageSize.value,
      taken_year: filterYear.value,
      clan_id: filterClanId.value || undefined,
    })) as unknown as Pagination<UserPhotoItem>
    if (mySeq !== requestSeq) return
    // 去重：仅按 id 去重
    const seen = new Set<string>()
    const deduped = (res.data || []).filter((p) => {
      const k = String(p.id)
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    // 切换分页时重置，筛选条件不变时增量追加
    if (currentPage.value === 1) {
      photos.value = deduped
    } else {
      const existing = new Set(photos.value.map((p) => String(p.id)))
      photos.value = photos.value.concat(deduped.filter((p) => !existing.has(String(p.id))))
    }
    total.value = res.pagination.total
  } catch (err: any) {
    if (mySeq !== requestSeq) return
    error.value = err?.response?.data?.message || err?.message || '加载失败，请重试'
  } finally {
    if (mySeq === requestSeq) {
      loading.value = false
    }
  }
}

function handlePageChange(page: number) {
  currentPage.value = page
  fetchPhotos()
}

function handleSizeChange(size: number) {
  pageSize.value = size
  currentPage.value = 1
  fetchPhotos()
}

function handleFilterReset() {
  filterYear.value = undefined
  filterClanId.value = ''
  currentPage.value = 1
  fetchPhotos()
}

function handleRetry() {
  fetchPhotos()
}

// 输入防抖：clan_id 输入时延迟 400ms 再请求
function onClanIdInput() {
  if (filterTimer.value) clearTimeout(filterTimer.value)
  filterTimer.value = setTimeout(() => {
    currentPage.value = 1
    fetchPhotos()
  }, 400)
}

const availableYears = computed(() => {
  const years = new Set<number>()
  photos.value.forEach((p) => {
    if (p.taken_year) years.add(p.taken_year)
  })
  return Array.from(years).sort((a, b) => b - a)
})

const reachedEnd = computed(() => photos.value.length >= total.value && total.value > 0)

onMounted(fetchPhotos)
onBeforeUnmount(() => {
  if (filterTimer.value) clearTimeout(filterTimer.value)
  // 取消未决请求序号：后续响应被丢弃
  requestSeq++
})
</script>

<template>
  <div class="timeline-page">
    <ElCard v-loading="loading">
      <template #header>
        <h2 class="page-title">我的时光</h2>
      </template>

      <!-- 筛选 -->
      <div class="filter-bar">
        <ElSelect
          v-model="filterYear"
          placeholder="按年份筛选"
          clearable
          style="width: 160px"
          @change="fetchPhotos"
        >
          <ElOption
            v-for="year in availableYears"
            :key="year"
            :label="year"
            :value="year"
          />
        </ElSelect>
        <ElInput
          v-model="filterClanId"
          placeholder="按家族 ID 筛选"
          clearable
          style="width: 200px; margin-left: 12px"
          @clear="fetchPhotos"
          @input="onClanIdInput"
        />
        <ElButton style="margin-left: 12px" @click="handleFilterReset">
          重置
        </ElButton>
        <span class="meta">共 {{ total }} 张照片</span>
      </div>

      <!-- 错误态 -->
      <ElAlert
        v-if="error"
        :title="error"
        type="error"
        :closable="false"
        show-icon
        style="margin-bottom: 12px"
      >
        <template #default>
          <div>{{ error }}</div>
          <ElButton size="small" type="primary" plain @click="handleRetry" style="margin-top: 8px">
            <ElIcon><Refresh /></ElIcon>
            重试
          </ElButton>
        </template>
      </ElAlert>

      <!-- 照片网格 -->
      <div v-if="photos.length > 0" class="photo-grid">
        <div
          v-for="photo in photos"
          :key="photo.id"
          class="photo-card"
          @click="() => {}"
        >
          <div class="photo-thumb">
            <img
              v-if="photo.file_url"
              :src="photo.file_url"
              :alt="photo.description || '照片'"
              loading="lazy"
            />
            <div v-else class="photo-empty">
              <ElIcon :size="32"><Picture /></ElIcon>
            </div>
          </div>
          <div class="photo-info">
            <div class="photo-year">
              {{ photo.taken_year || '未知年份' }}
            </div>
            <div class="photo-location">
              <ElIcon><Location /></ElIcon>
              {{ photo.taken_location || '未标注地点' }}
            </div>
            <div v-if="photo.clan" class="photo-clan">
              {{ photo.clan.name }}
            </div>
          </div>
        </div>
      </div>

      <ElEmpty
        v-else-if="!loading"
        description="暂无上传的照片"
      >
        <ElButton type="primary" @click="$router.push('/timeline')">
          去上传照片
        </ElButton>
      </ElEmpty>

      <ElPagination
        v-if="total > 0"
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[12, 20, 48]"
        layout="total, sizes, prev, pager, next, jumper"
        class="pagination"
        @current-change="handlePageChange"
        @size-change="handleSizeChange"
      />

      <ElDivider v-if="reachedEnd && photos.length > 0">
        <span class="end-marker">已显示全部 {{ total }} 张照片</span>
      </ElDivider>
    </ElCard>
  </div>
</template>

<style scoped>
.timeline-page {
  max-width: 1200px;
  margin: 0 auto;
}

.page-title {
  margin: 0;
  font-size: 18px;
}

.filter-bar {
  display: flex;
  align-items: center;
  margin-bottom: 20px;
}

.meta {
  margin-left: auto;
  font-size: 13px;
  color: #909399;
}

.photo-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}

.photo-card {
  background: #fff;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}

.photo-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.photo-thumb {
  width: 100%;
  aspect-ratio: 4 / 3;
  background-color: #f5f5f5;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.photo-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.photo-empty {
  color: #c0c4cc;
}

.photo-info {
  padding: 12px;
}

.photo-year {
  font-size: 15px;
  font-weight: 600;
  color: #5d4037;
  margin-bottom: 4px;
}

.photo-location {
  font-size: 12px;
  color: #909399;
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 4px;
}

.photo-clan {
  font-size: 11px;
  color: #b08968;
}

.pagination {
  margin-top: 24px;
  display: flex;
  justify-content: flex-end;
}

.end-marker {
  font-size: 12px;
  color: #909399;
}
</style>