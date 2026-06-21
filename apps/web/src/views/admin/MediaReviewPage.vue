<script setup lang="ts">
import { ref, onMounted } from 'vue'
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

const fetchReviews = async () => {
  loading.value = true
  try {
    const res = await axios.get('/api/admin/reviews/media', {
      params: {
        clanId: clanId.value,
        page: currentPage.value,
        pageSize: pageSize.value,
        status: activeTab.value,
      },
    })
    reviews.value = res.data.data
    total.value = res.data.pagination.total
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

const handleBatchApprove = async () => {
  // TODO: 批量通过
  ElMessage.info('批量操作开发中')
}

onMounted(() => {
  clanId.value = route.query.clanId as string || '1'
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
            <ElButton type="primary" @click="handleBatchApprove">
              批量通过
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
          shadow="hover"
        >
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

.review-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
  margin-top: 20px;
}

.review-card {
  display: flex;
  flex-direction: column;
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
