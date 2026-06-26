<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'

const route = useRoute()

const clanSlug = ref('')
const loading = ref(false)
const reviews = ref<any[]>([])
const total = ref(0)
const currentPage = ref(1)
const pageSize = ref(20)
const activeTab = ref('PENDING')

// 批量审核状态
const selectedReviews = ref<any[]>([])
const batchOperating = ref(false)

// 预设驳回理由（依据需求文档 4.3.1）
const presetRejectReasons = [
  '涉及隐私',
  '图像模糊',
  '重复上传',
  '其他',
]

const fetchReviews = async () => {
  loading.value = true
  try {
    const res = await axios.get('/api/admin/reviews/media', {
      params: {
        clanSlug: clanId.value,
        page: currentPage.value,
        pageSize: pageSize.value,
        status: activeTab.value,
      },
    })
    reviews.value = res.data.data
    total.value = res.data.pagination.total
    // 切换 Tab 时清空选择
    selectedReviews.value = []
  } catch (error) {
    console.error('Failed to fetch reviews:', error)
  } finally {
    loading.value = false
  }
}

const handleApprove = async (review: any) => {
  try {
    await axios.post(`/api/admin/reviews/media/${review.id}/approve`)
    ElMessage.success('审核通过')
    fetchReviews()
  } catch (error: any) {
    ElMessage.error(error.response?.data?.message || '操作失败')
  }
}

const handleReject = async (review: any) => {
  try {
    const { value } = await ElMessageBox.prompt(
      '请输入驳回理由',
      '驳回审核',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        inputPattern: /.+/,
        inputErrorMessage: '理由不能为空',
        inputType: 'textarea',
      }
    )
    await axios.post(`/api/admin/reviews/media/${review.id}/reject`, {
      reason: value,
    })
    ElMessage.success('已驳回')
    fetchReviews()
  } catch (error: any) {
    if (error.response?.data?.message) {
      ElMessage.error(error.response.data.message)
    }
  }
}

// 设为封面（需求文档 4.3.1节）
const handleSetCover = async (review: any) => {
  try {
    await ElMessageBox.confirm(
      `确定要将此影像设为「${review.category}」聚落封面吗？`,
      '设为封面',
      { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' }
    )
    await axios.post(`/api/admin/reviews/media/${review.id}/set-cover`)
    ElMessage.success('已设为聚落封面')
    fetchReviews()
  } catch (error: any) {
    if (error !== 'cancel' && error.response?.data?.message) {
      ElMessage.error(error.response.data.message)
    }
  }
}

const toggleSelection = (review: any, checked: boolean) => {
  if (checked) {
    if (!selectedReviews.value.find((r) => r.id === review.id)) {
      selectedReviews.value.push(review)
    }
  } else {
    selectedReviews.value = selectedReviews.value.filter(
      (r) => r.id !== review.id
    )
  }
}

// 批量通过
const handleBatchApprove = async () => {
  if (selectedReviews.value.length === 0) {
    ElMessage.warning('请先勾选要通过的影像')
    return
  }
  try {
    await ElMessageBox.confirm(
      `确定要批量通过选中的 ${selectedReviews.value.length} 项影像吗？`,
      '批量通过',
      { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' }
    )
    batchOperating.value = true
    const reviewIds = selectedReviews.value.map((r) => r.id)
    const res = await axios.post('/api/admin/reviews/media/batch-approve', {
      reviewIds,
    })
    ElMessage.success(res.data.message || `成功通过 ${res.data.count} 项`)
    fetchReviews()
  } catch (error: any) {
    if (error !== 'cancel' && error.response?.data?.message) {
      ElMessage.error(error.response.data.message)
    }
  } finally {
    batchOperating.value = false
  }
}

// 批量驳回：使用预设理由下拉
const handleBatchReject = async () => {
  if (selectedReviews.value.length === 0) {
    ElMessage.warning('请先勾选要驳回的影像')
    return
  }
  try {
    const { value: reason } = await ElMessageBox.prompt(
      '请输入驳回理由',
      `批量驳回 ${selectedReviews.value.length} 项影像`,
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        inputPattern: /.+/,
        inputErrorMessage: '理由不能为空',
        inputType: 'textarea',
        inputPlaceholder: '预设理由：涉及隐私 / 图像模糊 / 重复上传 / 其他',
      }
    )
    batchOperating.value = true
    const reviewIds = selectedReviews.value.map((r) => r.id)
    const res = await axios.post('/api/admin/reviews/media/batch-reject', {
      reviewIds,
      reason,
    })
    ElMessage.success(res.data.message || `成功驳回 ${res.data.count} 项`)
    fetchReviews()
  } catch (error: any) {
    if (error !== 'cancel' && error.response?.data?.message) {
      ElMessage.error(error.response.data.message)
    }
  } finally {
    batchOperating.value = false
  }
}

// 快速使用预设理由进行批量驳回
const handleBatchRejectWithPreset = async (preset: string) => {
  if (selectedReviews.value.length === 0) {
    ElMessage.warning('请先勾选要驳回的影像')
    return
  }
  try {
    await ElMessageBox.confirm(
      `将选中的 ${selectedReviews.value.length} 项影像以预设理由「${preset}」批量驳回？`,
      '批量驳回',
      { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' }
    )
    batchOperating.value = true
    const reviewIds = selectedReviews.value.map((r) => r.id)
    const res = await axios.post('/api/admin/reviews/media/batch-reject', {
      reviewIds,
      reason: preset,
    })
    ElMessage.success(res.data.message || `成功驳回 ${res.data.count} 项`)
    fetchReviews()
  } catch (error: any) {
    if (error !== 'cancel' && error.response?.data?.message) {
      ElMessage.error(error.response.data.message)
    }
  } finally {
    batchOperating.value = false
  }
}

const hasSelection = computed(() => selectedReviews.value.length > 0)
const allSelectedIds = computed(() => selectedReviews.value.map((r) => r.id))

onMounted(() => {
  clanId.value = route.params.slug as string || '1'
  fetchReviews()
})
</script>

<template>
  <div class="media-review-page">
    <ElCard>
      <template #header>
        <div class="page-header">
          <h2>影像审核</h2>
          <div class="header-actions">
            <ElButton
              type="success"
              :disabled="!hasSelection || batchOperating"
              :loading="batchOperating"
              @click="handleBatchApprove"
            >
              批量通过 ({{ selectedReviews.length }})
            </ElButton>
            <ElDropdown @command="handleBatchRejectWithPreset">
              <ElButton
                type="danger"
                :disabled="!hasSelection || batchOperating"
                :loading="batchOperating"
              >
                批量驳回 ({{ selectedReviews.length }})<ElIcon class="el-icon--right"><ArrowDown /></ElIcon>
              </ElButton>
              <template #dropdown>
                <ElDropdownMenu>
                  <ElDropdownItem
                    v-for="preset in presetRejectReasons"
                    :key="preset"
                    :command="preset"
                  >
                    {{ preset }}
                  </ElDropdownItem>
                </ElDropdownMenu>
              </template>
            </ElDropdown>
            <ElButton
              type="warning"
              plain
              :disabled="!hasSelection || batchOperating"
              @click="handleBatchReject"
            >
              自定义理由驳回
            </ElButton>
          </div>
        </div>
      </template>

      <ElTabs v-model="activeTab" @tab-change="fetchReviews">
        <ElTabPane label="待审核" name="PENDING" />
        <ElTabPane label="已通过" name="APPROVED" />
        <ElTabPane label="已驳回" name="REJECTED" />
      </ElTabs>

      <div class="review-grid">
        <ElCard
          v-for="review in reviews"
          :key="review.id"
          class="review-card"
          :class="{ 'is-selected': allSelectedIds.includes(review.id) }"
          shadow="hover"
        >
          <ElCheckbox
            v-if="activeTab === 'PENDING'"
            class="review-checkbox"
            :model-value="allSelectedIds.includes(review.id)"
            @change="(val: any) => toggleSelection(review, val)"
          />
          <div class="review-image">
            <ElImage
              :src="review.media_url"
              :preview-src-list="[review.media_url]"
              fit="cover"
              class="image-preview"
            />
          </div>
          <div class="review-info">
            <p><strong>上传者：</strong>{{ review.uploader_id }}</p>
            <p v-if="review.taken_year">
              <strong>拍摄年份：</strong>{{ review.taken_year }}
            </p>
            <p v-if="review.taken_location">
              <strong>拍摄地点：</strong>{{ review.taken_location }}
            </p>
            <p v-if="review.description">
              <strong>描述：</strong>{{ review.description }}
            </p>
            <p><strong>上传时间：</strong>{{ new Date(review.created_at).toLocaleDateString() }}</p>
            <p v-if="review.reject_reason" class="reject-reason">
              <strong>驳回理由：</strong>{{ review.reject_reason }}
            </p>
          </div>
          <div class="review-actions" v-if="activeTab === 'PENDING'">
            <ElButton type="success" @click="handleApprove(review)">
              通过
            </ElButton>
            <ElButton type="danger" @click="handleReject(review)">
              驳回
            </ElButton>
            <ElButton
              v-if="review.category === '村寨风貌' || review.category === '祭祀活动'"
              type="warning"
              plain
              @click="handleSetCover(review)"
            >
              设为封面
            </ElButton>
          </div>
        </ElCard>
      </div>

      <ElEmpty v-if="!loading && reviews.length === 0" description="暂无数据" />

      <ElPagination
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[12, 24, 48]"
        layout="total, sizes, prev, pager, next, jumper"
        class="pagination"
        @size-change="fetchReviews"
        @current-change="fetchReviews"
      />
    </ElCard>
  </div>
</template>

<style scoped>
.media-review-page {
  max-width: 1400px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.page-header h2 {
  margin: 0;
}

.header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.review-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
  margin-top: 20px;
}

.review-card {
  display: flex;
  flex-direction: column;
  position: relative;
  transition: box-shadow 0.2s, border-color 0.2s;
}

.review-card.is-selected {
  border: 2px solid #409EFF;
}

.review-checkbox {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 2;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 4px;
  padding: 2px 6px;
}

.review-image {
  width: 100%;
  height: 200px;
  overflow: hidden;
  border-radius: 4px;
}

.image-preview {
  width: 100%;
  height: 100%;
}

.review-info {
  padding: 12px 0;
  font-size: 14px;
}

.review-info p {
  margin: 4px 0;
}

.reject-reason {
  color: #F56C6C;
}

.review-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.pagination {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}
</style>