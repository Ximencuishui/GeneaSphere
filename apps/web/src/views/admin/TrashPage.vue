<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'

const route = useRoute()
const clanSlug = computed(() => route.params.slug || '1')

// 标签页
const activeTab = ref('members')

// 成员数据
const members = ref<any[]>([])
const membersLoading = ref(false)
const membersPagination = ref({ page: 1, pageSize: 20, total: 0 })

// 影像数据
const media = ref<any[]>([])
const mediaLoading = ref(false)
const mediaPagination = ref({ page: 1, pageSize: 30, total: 0 })

// 加载成员
const fetchMembers = async () => {
  membersLoading.value = true
  try {
    const res = await axios.get('/api/admin/trash/members', {
      params: {
        clanSlug: clanId.value,
        page: membersPagination.value.page,
        pageSize: membersPagination.value.pageSize,
      },
    })
    members.value = res.data.data
    membersPagination.value.total = res.data.total
  } catch (e: any) {
    ElMessage.error(e.message || '加载失败')
  } finally {
    membersLoading.value = false
  }
}

// 加载影像
const fetchMedia = async () => {
  mediaLoading.value = true
  try {
    const res = await axios.get('/api/admin/trash/media', {
      params: {
        clanSlug: clanId.value,
        page: mediaPagination.value.page,
        pageSize: mediaPagination.value.pageSize,
      },
    })
    media.value = res.data.data
    mediaPagination.value.total = res.data.total
  } catch (e: any) {
    ElMessage.error(e.message || '加载失败')
  } finally {
    mediaLoading.value = false
  }
}

// 恢复成员
const handleRestoreMember = async (id: string) => {
  try {
    await ElMessageBox.confirm('确定要恢复该成员吗？', '提示', { type: 'warning' })
    await axios.post(`/api/admin/trash/members/${id}/restore`, {}, {
      params: { clanSlug: clanId.value },
    })
    ElMessage.success('恢复成功')
    fetchMembers()
  } catch (e: any) {
    if (e !== 'cancel') {
      ElMessage.error(e.message || '恢复失败')
    }
  }
}

// 永久删除成员
const handlePermanentDeleteMember = async (id: string) => {
  try {
    await ElMessageBox.confirm('此操作不可逆，确定要永久删除吗？', '危险操作', {
      type: 'error',
      confirmButtonText: '永久删除',
    })
    await axios.delete(`/api/admin/trash/members/${id}`, {
      params: { clanSlug: clanId.value },
    })
    ElMessage.success('已永久删除')
    fetchMembers()
  } catch (e: any) {
    if (e !== 'cancel') {
      ElMessage.error(e.message || '删除失败')
    }
  }
}

// 恢复影像
const handleRestoreMedia = async (id: string) => {
  try {
    await axios.post(`/api/admin/trash/media/${id}/restore`, {}, {
      params: { clanSlug: clanId.value },
    })
    ElMessage.success('恢复成功')
    fetchMedia()
  } catch (e: any) {
    ElMessage.error(e.message || '恢复失败')
  }
}

// 永久删除影像
const handlePermanentDeleteMedia = async (id: string) => {
  try {
    await ElMessageBox.confirm('此操作不可逆，确定要永久删除吗？', '危险操作', {
      type: 'error',
      confirmButtonText: '永久删除',
    })
    await axios.delete(`/api/admin/trash/media/${id}`, {
      params: { clanSlug: clanId.value },
    })
    ElMessage.success('已永久删除')
    fetchMedia()
  } catch (e: any) {
    if (e !== 'cancel') {
      ElMessage.error(e.message || '删除失败')
    }
  }
}

const handleMembersPageChange = (page: number) => {
  membersPagination.value.page = page
  fetchMembers()
}

const handleMediaPageChange = (page: number) => {
  mediaPagination.value.page = page
  fetchMedia()
}

const handleTabChange = (tab: string) => {
  if (tab === 'members' && members.value.length === 0) {
    fetchMembers()
  } else if (tab === 'media' && media.value.length === 0) {
    fetchMedia()
  }
}

onMounted(() => {
  fetchMembers()
})
</script>

<template>
  <div class="trash-page">
    <div class="page-header">
      <h2>回收站</h2>
    </div>

    <el-tabs v-model="activeTab" @tab-change="handleTabChange">
      <el-tab-pane label="已删除成员" name="members">
        <el-table :data="members" v-loading="membersLoading" stripe>
          <el-table-column prop="full_name" label="姓名" width="120" />
          <el-table-column prop="gender" label="性别" width="80">
            <template #default="{ row }">
              {{ row.gender === 'male' ? '男' : '女' }}
            </template>
          </el-table-column>
          <el-table-column label="家族关系" width="150">
            <template #default="{ row }">
              <span>配偶: {{ row.family_info?.spouse_count || 0 }}</span>
              <span style="margin-left: 8px">子女: {{ row.family_info?.children_count || 0 }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="deleted_at" label="删除时间" width="180">
            <template #default="{ row }">
              {{ row.deleted_at ? new Date(row.deleted_at).toLocaleString() : '-' }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="180" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="handleRestoreMember(row.id)">恢复</el-button>
              <el-button link type="danger" @click="handlePermanentDeleteMember(row.id)">永久删除</el-button>
            </template>
          </el-table-column>
        </el-table>
        <el-pagination
          v-model:current-page="membersPagination.page"
          :total="membersPagination.total"
          :page-size="membersPagination.pageSize"
          @current-change="handleMembersPageChange"
          layout="total, prev, pager, next"
          class="pagination"
        />
      </el-tab-pane>

      <el-tab-pane label="已删除影像" name="media">
        <el-table :data="media" v-loading="mediaLoading" stripe>
          <el-table-column label="缩略图" width="100">
            <template #default="{ row }">
              <el-image v-if="row.thumb_url" :src="row.thumb_url" fit="cover" style="width: 60px; height: 60px;" />
              <span v-else>-</span>
            </template>
          </el-table-column>
          <el-table-column prop="taken_location" label="拍摄地点" width="150" />
          <el-table-column prop="taken_year" label="拍摄年份" width="100" />
          <el-table-column prop="uploader_name" label="上传者" width="120" />
          <el-table-column prop="album_name" label="相册" width="120" />
          <el-table-column prop="deleted_at" label="删除时间" width="180">
            <template #default="{ row }">
              {{ row.deleted_at ? new Date(row.deleted_at).toLocaleString() : '-' }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="180" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="handleRestoreMedia(row.id)">恢复</el-button>
              <el-button link type="danger" @click="handlePermanentDeleteMedia(row.id)">永久删除</el-button>
            </template>
          </el-table-column>
        </el-table>
        <el-pagination
          v-model:current-page="mediaPagination.page"
          :total="mediaPagination.total"
          :page-size="mediaPagination.pageSize"
          @current-change="handleMediaPageChange"
          layout="total, prev, pager, next"
          class="pagination"
        />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.trash-page {
  padding: 20px;
}

.page-header {
  margin-bottom: 20px;
}

.page-header h2 {
  margin: 0;
  font-size: 18px;
}

.pagination {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}
</style>
