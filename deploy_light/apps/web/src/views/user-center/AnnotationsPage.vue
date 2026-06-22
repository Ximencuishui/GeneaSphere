<script setup lang="ts">
import { ref, onMounted } from 'vue'
import userApi from '@/api/user'
import type { UserAnnotation, Pagination } from '@/types'

const loading = ref(false)
const items = ref<UserAnnotation[]>([])
const total = ref(0)
const currentPage = ref(1)
const pageSize = ref(20)

async function fetchAnnotations() {
  loading.value = true
  try {
    const res = (await userApi.annotations.list({
      page: currentPage.value,
      pageSize: pageSize.value,
    })) as unknown as Pagination<UserAnnotation>
    items.value = res.data
    total.value = res.pagination.total
  } finally {
    loading.value = false
  }
}

function statusTagType(status: string) {
  switch (status) {
    case '已标注':
      return 'success'
    case '待确认':
      return 'warning'
    default:
      return 'info'
  }
}

onMounted(fetchAnnotations)
</script>

<template>
  <div class="annotations-page">
    <ElCard v-loading="loading">
      <template #header>
        <div class="header">
          <h2 class="page-title">我的标注</h2>
          <span class="header-meta">共 {{ total }} 条</span>
        </div>
      </template>

      <ElTable :data="items">
        <ElTableColumn label="照片" width="100">
          <template #default="{ row }">
            <div class="thumb-cell">
              <img
                v-if="row.media?.file_url"
                :src="row.media.file_url"
                :alt="row.media.description || '标注照片'"
                class="thumb"
              />
              <div v-else class="thumb-placeholder">
                <ElIcon :size="20"><Picture /></ElIcon>
              </div>
            </div>
          </template>
        </ElTableColumn>
        <ElTableColumn label="关联人物" min-width="140">
          <template #default="{ row }">
            <span v-if="row.person">
              {{ row.person.full_name }}
              <ElTag
                :type="row.person.gender === 'male' ? 'primary' : 'danger'"
                size="small"
                effect="plain"
                style="margin-left: 4px"
              >
                {{ row.person.gender === 'male' ? '男' : '女' }}
              </ElTag>
            </span>
            <span v-else class="muted">未关联</span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="地点" min-width="160">
          <template #default="{ row }">
            {{ row.media?.taken_location || '—' }}
          </template>
        </ElTableColumn>
        <ElTableColumn label="时间段" width="160">
          <template #default="{ row }">
            <span v-if="row.person">
              {{
                row.person.birth_date
                  ? new Date(row.person.birth_date).getFullYear()
                  : '?'
              }}
              -
              {{
                row.person.death_date
                  ? new Date(row.person.death_date).getFullYear()
                  : '今'
              }}
            </span>
            <span v-else>—</span>
          </template>
        </ElTableColumn>
        <ElTableColumn label="关系状态" width="100">
          <template #default="{ row }">
            <ElTag :type="statusTagType(row.relation_status) as any" size="small">
              {{ row.relation_status }}
            </ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn label="标注时间" width="160">
          <template #default="{ row }">
            {{ row.media?.created_at ? new Date(row.media.created_at).toLocaleDateString() : '—' }}
          </template>
        </ElTableColumn>
      </ElTable>

      <ElEmpty
        v-if="!loading && items.length === 0"
        description="暂无标注记录"
      >
        <template #image>
          <ElIcon :size="64" color="#c0c4cc"><EditPen /></ElIcon>
        </template>
      </ElEmpty>

      <ElPagination
        v-if="total > 0"
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next, jumper"
        class="pagination"
        @current-change="fetchAnnotations"
        @size-change="fetchAnnotations"
      />
    </ElCard>
  </div>
</template>

<style scoped>
.annotations-page {
  max-width: 1400px;
  margin: 0 auto;
}

.page-title {
  margin: 0;
  font-size: 18px;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-meta {
  font-size: 13px;
  color: #909399;
}

.thumb-cell {
  width: 60px;
  height: 60px;
}

.thumb {
  width: 60px;
  height: 60px;
  object-fit: cover;
  border-radius: 4px;
}

.thumb-placeholder {
  width: 60px;
  height: 60px;
  border: 1px dashed #dcdfe6;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #c0c4cc;
  background-color: #fafafa;
}

.muted {
  color: #c0c4cc;
}

.pagination {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}
</style>