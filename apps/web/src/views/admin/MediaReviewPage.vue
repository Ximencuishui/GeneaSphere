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
const uploaderId = ref('')
const uploaders = ref<{ user_id: string; label: string }[]>([])
const rejectVisible = ref(false)
const rejectTarget = ref<any>(null)
const rejectPreset = ref('涉及隐私')
const rejectNote = ref('')
const rejecting = ref(false)

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
        clanSlug: clanSlug.value,
        page: currentPage.value,
        pageSize: pageSize.value,
        status: activeTab.value,
        uploaderId: uploaderId.value || undefined,
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

const loadUploaders = async () => {
  try {
    const res = await axios.get('/api/admin/members', {
      params: { clanSlug: clanSlug.value, page: 1, pageSize: 100 },
    })
    uploaders.value = (res.data?.data || []).map((member: any) => ({
      user_id: member.user_id,
      label: member.full_name || member.nickname || member.phone,
    }))
  } catch {
    uploaders.value = []
  }
}

const handleReject = (review: any) => {
  rejectTarget.value = review
  rejectPreset.value = '涉及隐私'
  rejectNote.value = ''
  rejectVisible.value = true
}

const submitReject = async () => {
  if (!rejectTarget.value) return
  if (rejectPreset.value === '其他' && !rejectNote.value.trim()) {
    ElMessage.warning('选择「其他」时请填写说明')
    return
  }
  rejecting.value = true
  try {
    await axios.post(`/api/admin/reviews/media/${rejectTarget.value.id}/reject`, {
      reason: rejectPreset.value,
      custom_reason: rejectPreset.value === '其他' ? rejectNote.value.trim() : undefined,
    })
    ElMessage.success('已驳回')
    rejectVisible.value = false
    fetchReviews()
  } catch (error: any) {
    ElMessage.error(error.response?.data?.message || '操作失败')
  } finally {
    rejecting.value = false
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
  clanSlug.value = route.params.slug as string || '1'
  loadUploaders()
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

      <div class="review-filter">
        <span>上传者</span>
        <ElSelect v-model="uploaderId" clearable placeholder="全部" style="width: 180px;" @change="fetchReviews">
          <ElOption v-for="item in uploaders" :key="item.user_id" :label="item.label" :value="item.user_id" />
        </ElSelect>
      </div>

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
            <p><strong>上传者：</strong>{{ review.uploader_name || review.uploader_id }}</p>
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

      <ElDialog v-model="rejectVisible" title="驳回审核" width="480px">
        <p>请选择驳回理由</p>
        <ElRadioGroup v-model="rejectPreset" class="reject-presets">
          <ElRadio v-for="preset in presetRejectReasons" :key="preset" :value="preset">{{ preset }}</ElRadio>
        </ElRadioGroup>
        <ElInput
          v-if="rejectPreset === '其他'"
          v-model="rejectNote"
          type="textarea"
          :rows="3"
          placeholder="请填写说明"
          style="margin-top: 12px;"
        />
        <template #footer>
          <ElButton @click="rejectVisible = false">取消</ElButton>
          <ElButton type="danger" :loading="rejecting" @click="submitReject">确定驳回</ElButton>
        </template>
      </ElDialog>

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

.review-filter {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
}

.reject-presets {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}

.pagination {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}
</style>