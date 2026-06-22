<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'

const route = useRoute()

const clanId = ref('')
const loading = ref(false)
const reviews = ref<any[]>([])
const total = ref(0)
const currentPage = ref(1)
const pageSize = ref(20)
const activeTab = ref('PENDING')

// 批量审核状态
const selectedReviews = ref<any[]>([])
const batchOperating = ref(false)

// 预设驳回理由
const presetRejectReasons = [
  '内容不实',
  '语言不当',
  '重复提交',
  '其他',
]

const fetchReviews = async () => {
  loading.value = true
  try {
    const res = await axios.get('/api/admin/reviews/bio', {
      params: {
        clanId: clanId.value,
        page: currentPage.value,
        pageSize: pageSize.value,
        status: activeTab.value,
      },
    })
    reviews.value = res.data.data
    total.value = res.data.pagination.total
    selectedReviews.value = []
  } catch (error) {
    console.error('Failed to fetch bio reviews:', error)
  } finally {
    loading.value = false
  }
}

const handleApprove = async (review: any) => {
  try {
    await axios.post(`/api/admin/reviews/bio/${review.id}/approve`)
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
    await axios.post(`/api/admin/reviews/bio/${review.id}/reject`, {
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

const handleSelectionChange = (selection: any[]) => {
  selectedReviews.value = selection
}

// 批量通过
const handleBatchApprove = async () => {
  if (selectedReviews.value.length === 0) {
    ElMessage.warning('请先勾选要通过的生平')
    return
  }
  try {
    await ElMessageBox.confirm(
      `确定要批量通过选中的 ${selectedReviews.value.length} 项生平吗？`,
      '批量通过',
      { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' }
    )
    batchOperating.value = true
    const reviewIds = selectedReviews.value.map((r) => r.id)
    const res = await axios.post('/api/admin/reviews/bio/batch-approve', {
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

// 批量驳回（自定义理由）
const handleBatchReject = async () => {
  if (selectedReviews.value.length === 0) {
    ElMessage.warning('请先勾选要驳回的生平')
    return
  }
  try {
    const { value: reason } = await ElMessageBox.prompt(
      '请输入驳回理由',
      `批量驳回 ${selectedReviews.value.length} 项生平`,
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        inputPattern: /.+/,
        inputErrorMessage: '理由不能为空',
        inputType: 'textarea',
      }
    )
    batchOperating.value = true
    const reviewIds = selectedReviews.value.map((r) => r.id)
    const res = await axios.post('/api/admin/reviews/bio/batch-reject', {
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
    ElMessage.warning('请先勾选要驳回的生平')
    return
  }
  try {
    await ElMessageBox.confirm(
      `将选中的 ${selectedReviews.value.length} 项生平以预设理由「${preset}」批量驳回？`,
      '批量驳回',
      { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' }
    )
    batchOperating.value = true
    const reviewIds = selectedReviews.value.map((r) => r.id)
    const res = await axios.post('/api/admin/reviews/bio/batch-reject', {
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

onMounted(() => {
  clanId.value = route.query.clanId as string || '1'
  fetchReviews()
})
</script>

<template>
  <div class="bio-review-page">
    <ElCard>
      <template #header>
        <div class="page-header">
          <h2>生平审核</h2>
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

      <ElTable
        :data="reviews"
        v-loading="loading"
        @selection-change="handleSelectionChange"
      >
        <ElTableColumn
          v-if="activeTab === 'PENDING'"
          type="selection"
          width="50"
        />
        <ElTableColumn prop="title" label="标题" min-width="150" />
        <ElTableColumn prop="person_name" label="关联人物" width="120" />
        <ElTableColumn prop="author_phone" label="作者" width="150" />
        <ElTableColumn label="内容预览" min-width="200">
          <template #default="{ row }">
            <div class="content-preview">
              {{ row.content?.substring(0, 100) }}{{ row.content?.length > 100 ? '...' : '' }}
            </div>
          </template>
        </ElTableColumn>
        <ElTableColumn prop="created_at" label="提交时间" width="180">
          <template #default="{ row }">
            {{ new Date(row.created_at).toLocaleDateString() }}
          </template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <ElButton
              v-if="activeTab === 'PENDING'"
              type="success"
              size="small"
              @click="handleApprove(row)"
            >
              通过
            </ElButton>
            <ElButton
              v-if="activeTab === 'PENDING'"
              type="danger"
              size="small"
              @click="handleReject(row)"
            >
              驳回
            </ElButton>
            <ElButton
              type="primary"
              size="small"
              @click="$router.push('/admin/reviews/bio/' + row.id)"
            >
              查看详情
            </ElButton>
          </template>
        </ElTableColumn>
      </ElTable>

      <ElEmpty v-if="!loading && reviews.length === 0" description="暂无数据" />

      <ElPagination
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next, jumper"
        class="pagination"
        @size-change="fetchReviews"
        @current-change="fetchReviews"
      />
    </ElCard>
  </div>
</template>

<style scoped>
.bio-review-page {
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

.content-preview {
  max-height: 60px;
  overflow: hidden;
  color: #909399;
  font-size: 13px;
}

.pagination {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}
</style>