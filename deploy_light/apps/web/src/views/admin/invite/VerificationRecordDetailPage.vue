<template>
  <div class="page" v-loading="loading">
    <div class="page-header">
      <h2>验证详情 #{{ id }}</h2>
      <el-button @click="$router.back()">返回</el-button>
    </div>

    <el-descriptions title="会话信息" :column="2" border v-if="detail">
      <el-descriptions-item label="扫码者">{{ detail.scanner_nickname || '—' }}</el-descriptions-item>
      <el-descriptions-item label="手机号">{{ detail.scanner_phone || '—' }}</el-descriptions-item>
      <el-descriptions-item label="OpenID">{{ detail.scanner_openid }}</el-descriptions-item>
      <el-descriptions-item label="状态">
        <el-tag :type="statusTag(detail.status)">{{ detail.status }}</el-tag>
      </el-descriptions-item>
      <el-descriptions-item label="验证方式">{{ detail.verify_method || '—' }}</el-descriptions-item>
      <el-descriptions-item label="匹配人物">{{ detail.matched_person_id || '—' }}</el-descriptions-item>
      <el-descriptions-item label="创建时间">{{ formatDate(detail.created_at) }}</el-descriptions-item>
      <el-descriptions-item label="过期时间">{{ formatDate(detail.expire_at) }}</el-descriptions-item>
      <el-descriptions-item label="通过时间" v-if="detail.passed_at">{{ formatDate(detail.passed_at) }}</el-descriptions-item>
      <el-descriptions-item label="失败原因" v-if="detail.fail_reason">{{ detail.fail_reason }}</el-descriptions-item>
    </el-descriptions>

    <h3 style="margin: 16px 0 8px;">知识问答 ({{ detail?.quiz_attempts?.length || 0 }} 题)</h3>
    <el-table :data="detail?.quiz_attempts || []" border>
      <el-table-column prop="question" label="题目" min-width="200" />
      <el-table-column label="正确答案" width="120">
        <template #default="{ row }">
          <span style="color: #67c23a;">{{ row.correct_answer }}</span>
        </template>
      </el-table-column>
      <el-table-column label="用户答案" width="120">
        <template #default="{ row }">
          <span :style="row.is_correct ? 'color:#67c23a' : 'color:#f56c6c'">
            {{ row.user_answer || '未答' }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="结果" width="80">
        <template #default="{ row }">
          <el-tag v-if="row.is_correct === true" type="success" size="small">正确</el-tag>
          <el-tag v-else-if="row.is_correct === false" type="danger" size="small">错误</el-tag>
          <el-tag v-else type="info" size="small">未答</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="difficulty" label="难度" width="80" />
    </el-table>

    <h3 style="margin: 16px 0 8px;">背书记录 ({{ detail?.endorsements?.length || 0 }} 条)</h3>
    <el-table :data="detail?.endorsements || []" border>
      <el-table-column prop="endorser_user_id" label="背书人 ID" width="280" />
      <el-table-column label="结果" width="100">
        <template #default="{ row }">
          <el-tag v-if="row.result === 'CONFIRMED'" type="success">已确认</el-tag>
          <el-tag v-else-if="row.result === 'REJECTED'" type="danger">已拒绝</el-tag>
          <el-tag v-else type="warning">待响应</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="响应时间" width="180">
        <template #default="{ row }">
          {{ formatDate(row.responded_at) }}
        </template>
      </el-table-column>
      <el-table-column prop="reject_reason" label="拒绝原因" />
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'

const route = useRoute()
const id = String(route.params.id || '')
const detail = ref<any>(null)
const loading = ref(false)

const formatDate = (d: string) => (d ? new Date(d).toLocaleString() : '—')

const statusTag = (s: string) => ({
  PENDING: 'warning', PASSED: 'success', FAILED: 'danger', EXPIRED: 'info',
}[s] as any || '')

onMounted(async () => {
  loading.value = true
  try {
    const res = await axios.get(`/api/invite/verification-records/${id}`)
    detail.value = res
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.page { padding: 16px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
</style>
