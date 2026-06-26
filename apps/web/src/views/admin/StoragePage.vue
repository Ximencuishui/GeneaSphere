<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'

const route = useRoute()

const clanSlug = ref('')
const loading = ref(false)
const storageInfo = ref({
  used_bytes: 0,
  used_percentage: 0,
  max_bytes: 5 * 1024 * 1024 * 1024,
  breakdown: { photos: 0, videos: 0, others: 0 },
})

const fetchStorage = async () => {
  loading.value = true
  try {
    const res = await axios.get('/api/admin/settings/storage', {
      params: { clanSlug: clanId.value },
    })
    storageInfo.value = res.data
  } catch (error) {
    console.error('Failed to fetch storage:', error)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  clanId.value = route.params.slug as string || '1'
  fetchStorage()
})
</script>

<template>
  <div class="storage-page">
    <ElCard v-loading="loading">
      <template #header>
        <h2>云存储</h2>
      </template>

      <div class="storage-content">
        <div class="usage-chart">
          <ElProgress
            type="dashboard"
            :percentage="storageInfo.used_percentage"
            :color="storageInfo.used_percentage > 80 ? '#F56C6C' : '#409EFF'"
            :stroke-width="20"
          >
            <template #default="{ percentage }">
              <span class="progress-label">{{ percentage }}%</span>
              <div class="progress-desc">已使用</div>
            </template>
          </ElProgress>
        </div>

        <div class="storage-details">
          <ElDescriptions :column="1" border>
            <ElDescriptionsItem label="已用空间">
              {{ (storageInfo.used_bytes / 1024 / 1024 / 1024).toFixed(2) }} GB
            </ElDescriptionsItem>
            <ElDescriptionsItem label="总空间">
              {{ (storageInfo.max_bytes / 1024 / 1024 / 1024).toFixed(0) }} GB
            </ElDescriptionsItem>
            <ElDescriptionsItem label="剩余空间">
              {{ ((storageInfo.max_bytes - storageInfo.used_bytes) / 1024 / 1024 / 1024).toFixed(2) }} GB
            </ElDescriptionsItem>
          </ElDescriptions>

          <div class="breakdown" style="margin-top: 20px;">
            <h4>文件构成</h4>
            <ElRow :gutter="20">
              <ElCol :span="8">
                <div class="breakdown-item">
                  <div class="breakdown-icon" style="background-color: #409EFF;" />
                  <span>照片：{{ storageInfo.breakdown.photos }} 张</span>
                </div>
              </ElCol>
              <ElCol :span="8">
                <div class="breakdown-item">
                  <div class="breakdown-icon" style="background-color: #67C23A;" />
                  <span>视频：{{ storageInfo.breakdown.videos }} 个</span>
                </div>
              </ElCol>
              <ElCol :span="8">
                <div class="breakdown-item">
                  <div class="breakdown-icon" style="background-color: #E6A23C;" />
                  <span>其他：{{ storageInfo.breakdown.others }} 个</span>
                </div>
              </ElCol>
            </ElRow>
          </div>
        </div>
      </div>

      <ElAlert type="warning" show-icon style="margin-top: 20px;">
        <template #title>扩容说明</template>
        <p>当前为免费版，存储空间上限为 5GB。如需扩容，请联系客服或前往付费页面。</p>
        <ElButton type="primary" style="margin-top: 12px;" disabled>
          前往扩容（开发中）
        </ElButton>
      </ElAlert>
    </ElCard>
  </div>
</template>

<style scoped>
.storage-page {
  max-width: 1000px;
  margin: 0 auto;
}

.storage-content {
  display: flex;
  gap: 40px;
  align-items: center;
}

.usage-chart {
  flex-shrink: 0;
}

.progress-label {
  font-size: 28px;
  font-weight: bold;
  color: #303133;
}

.progress-desc {
  font-size: 14px;
  color: #909399;
}

.storage-details {
  flex: 1;
}

.breakdown-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.breakdown-icon {
  width: 12px;
  height: 12px;
  border-radius: 2px;
}
</style>
