<template>
  <div class="page">
    <div class="page-header">
      <h2>验证记录</h2>
      <div>
        <el-select v-model="status" placeholder="状态" clearable style="width: 160px;" @change="fetchList">
          <el-option label="PENDING" value="PENDING" />
          <el-option label="PASSED" value="PASSED" />
          <el-option label="FAILED" value="FAILED" />
          <el-option label="EXPIRED" value="EXPIRED" />
        </el-select>
        <el-button @click="fetchList" style="margin-left: 8px;">刷新</el-button>
      </div>
    </div>

    <el-table :data="list" v-loading="loading" border stripe>
      <el-table-column prop="id" label="ID" width="100" />
      <el-table-column label="扫码者" width="200">
        <template #default="{ row }">
          <div>{{ row.scanner_nickname || '—' }}</div>
          <div style="color: #909399; font-size: 12px;">{{ row.scanner_phone || row.scanner_openid.slice(0, 12) + '…' }}</div>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="statusTag(row.status)">{{ row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="verify_method" label="验证方式" width="120" />
      <el-table-column label="创建时间" width="180">
        <template #default="{ row }">
          {{ formatDate(row.created_at) }}
        </template>
      </el-table-column>
      <el-table-column label="过期时间" width="180">
        <template #default="{ row }">
          {{ formatDate(row.expire_at) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="100" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="viewDetail(row)">详情</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      v-model:current-page="page"
      v-model:page-size="pageSize"
      :total="total"
      layout="total, prev, pager, next"
      @current-change="fetchList"
      style="margin-top: 12px; text-align: right;"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import axios from 'axios'

const route = useRoute()
const router = useRouter()
const clanId = ref(String(route.query.clanId || '1'))

const list = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const status = ref<string>('')
const loading = ref(false)

const formatDate = (d: string) => (d ? new Date(d).toLocaleString() : '—')

const statusTag = (s: string) => ({
  PENDING: 'warning',
  PASSED: 'success',
  FAILED: 'danger',
  EXPIRED: 'info',
}[s] as any || '')

const fetchList = async () => {
  loading.value = true
  try {
    const res = await axios.get('/api/invite/verification-records', {
      params: {
        clan_id: clanId.value,
        status: status.value || undefined,
        page: page.value,
        pageSize: pageSize.value,
      },
    })
    list.value = res.data.data
    total.value = res.data.pagination.total
  } finally {
    loading.value = false
  }
}

const viewDetail = (row: any) => {
  router.push({
    name: 'admin-invite-record-detail',
    params: { id: row.id },
    query: { clanId: clanId.value },
  })
}

onMounted(fetchList)
</script>

<style scoped>
.page { padding: 16px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
</style>
