<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import axios from 'axios'

const quizzes = ref<any[]>([])
const loading = ref(false)
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const totalPages = ref(0)
const filterStatus = ref<'PENDING' | 'ALL'>('PENDING')

async function loadQuizzes() {
  loading.value = true
  try {
    const params: any = { page: page.value, pageSize: pageSize.value }
    const res = await axios.get('/api/memory/admin/pending', { params })
    quizzes.value = res.data.quizzes
    total.value = res.data.total
    totalPages.value = res.data.totalPages
  } catch (err: any) {
    ElMessage.error('加载失败')
  } finally {
    loading.value = false
  }
}

async function approveQuiz(id: number) {
  try {
    await axios.post(`/api/memory/admin/review/${id}`, { status: 'VERIFIED' })
    ElMessage.success('已审核通过')
    loadQuizzes()
  } catch (err: any) {
    ElMessage.error(err.response?.data?.message || '操作失败')
  }
}

async function rejectQuiz(id: number) {
  try {
    await ElMessageBox.prompt('请输入驳回原因', '驳回题目', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
    })
    await axios.post(`/api/memory/admin/review/${id}`, { status: 'REJECTED' })
    ElMessage.success('已驳回')
    loadQuizzes()
  } catch (err: any) {
    if (err !== 'cancel') ElMessage.error('操作失败')
  }
}

async function setAnswer(id: number) {
  try {
    const { value } = await ElMessageBox.prompt('请输入标准答案', '设置答案', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      inputPattern: /.+/,
      inputErrorMessage: '答案不能为空',
    })
    await axios.post(`/api/memory/admin/review/${id}`, {
      status: 'VERIFIED',
      answer: value,
    })
    ElMessage.success('已设置答案并审核通过')
    loadQuizzes()
  } catch (err: any) {
    if (err !== 'cancel') ElMessage.error('操作失败')
  }
}

onMounted(loadQuizzes)
</script>

<template>
  <div class="memory-quiz-management">
    <div class="page-header">
      <h2>题库管理</h2>
      <p class="header-desc">审核用户提交的地方记忆题目</p>
    </div>

    <div class="table-container" v-loading="loading">
      <el-table :data="quizzes" stripe style="width: 100%">
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column label="题目" min-width="300">
          <template #default="{ row }">
            <div class="question-cell">{{ row.question }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="location" label="地点" width="100" />
        <el-table-column prop="decade" label="年代" width="80" />
        <el-table-column label="出题人" width="120">
          <template #default="{ row }">
            {{ row.creator?.nickname || row.creator?.phone || '匿名' }}
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'VERIFIED' ? 'success' : row.status === 'REJECTED' ? 'danger' : 'warning'">
              {{ row.status === 'VERIFIED' ? '已通过' : row.status === 'REJECTED' ? '已驳回' : '待审核' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="220">
          <template #default="{ row }">
            <div class="action-buttons">
              <el-button
                size="small"
                type="success"
                @click="approveQuiz(row.id)"
                :disabled="row.status !== 'PENDING'"
              >
                通过
              </el-button>
              <el-button
                size="small"
                @click="setAnswer(row.id)"
              >
                设答案
              </el-button>
              <el-button
                size="small"
                type="danger"
                @click="rejectQuiz(row.id)"
                :disabled="row.status !== 'PENDING'"
              >
                驳回
              </el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <div v-if="totalPages > 1" class="pagination">
        <el-pagination
          v-model:current-page="page"
          :page-size="pageSize"
          :total="total"
          layout="prev, pager, next"
          @current-change="loadQuizzes"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.memory-quiz-management {
  padding: 24px;
}
.page-header {
  margin-bottom: 24px;
}
.page-header h2 {
  font-size: 20px;
  font-weight: 700;
  color: #2c3e50;
  margin: 0 0 4px;
}
.header-desc {
  font-size: 13px;
  color: #94a3b8;
  margin: 0;
}
.table-container {
  background: white;
  border-radius: 12px;
  padding: 16px;
  border: 1px solid #e8e0d8;
}
.question-cell {
  font-size: 13px;
  line-height: 1.5;
  color: #2c3e50;
  max-width: 400px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.action-buttons {
  display: flex;
  gap: 6px;
}
.pagination {
  display: flex;
  justify-content: center;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #f0ebe4;
}
</style>
