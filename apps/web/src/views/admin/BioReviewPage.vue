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

onMounted(() => {
  clanId.value = route.query.clanId as string || '1'
  fetchReviews()
})
</script>

<template>
  <div class="bio-review-page">
    <ElCard>
      <template #header>
        <h2>生平审核</h2>
      </template>

      <ElTabs v-model="activeTab" @tab-change="fetchReviews">
        <ElTabPane label="待审核" name="PENDING" />
        <ElTabPane label="已通过" name="APPROVED" />
        <ElTabPane label="已驳回" name="REJECTED" />
      </ElTabs>

      <ElTable :data="reviews" v-loading="loading">
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
