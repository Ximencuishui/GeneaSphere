<script setup lang="ts">
/**
 * 家族公众号 - 内容管理
 * - 推送内容列表（图文 / 文本 / 图片）
 * - 草稿、计划推送、已发送三类视图
 * - 支持新建 / 编辑 / 删除 / 立即推送 / 复制
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useCapabilityStore } from '@/stores/capability'

const route = useRoute()
const capabilityStore = useCapabilityStore()

const clanSlug = ref('')
const activeTab = ref<'drafts' | 'scheduled' | 'sent'>('drafts')

const articles = ref<any[]>([])
const loading = ref(false)
const pagination = ref({ page: 1, pageSize: 20, total: 0 })

const dialogVisible = ref(false)
const editingId = ref<string | null>(null)
const form = ref({
  title: '',
  digest: '',
  content: '',
  cover_url: '',
  article_type: 'NEWS' as 'NEWS' | 'TEXT' | 'IMAGE',
  source_url: '',
  scheduled_at: '',
  target_tags: [] as string[],
})

const isMockMode = computed(() => capabilityStore.isAvailable('wechat') === false)

const fetchList = async () => {
  loading.value = true
  try {
    const res = await axios.get('/api/admin/wechat/articles', {
      params: {
        clanSlug: clanSlug.value,
        status: activeTab.value,
        page: pagination.value.page,
        pageSize: pagination.value.pageSize,
      },
    })
    articles.value = res.data?.data || []
    pagination.value.total = res.data?.total || 0
  } catch (e: any) {
    if (e?.response?.status !== 404) {
      ElMessage.error(e?.response?.data?.message || '加载失败')
    }
    articles.value = []
    pagination.value.total = 0
  } finally {
    loading.value = false
  }
}

const handleCreate = () => {
  editingId.value = null
  form.value = {
    title: '',
    digest: '',
    content: '',
    cover_url: '',
    article_type: 'NEWS',
    source_url: '',
    scheduled_at: '',
    target_tags: [],
  }
  dialogVisible.value = true
}

const handleEdit = (row: any) => {
  if (row.status === 'sent') {
    ElMessage.warning('已发送内容不可编辑')
    return
  }
  editingId.value = row.id
  form.value = {
    title: row.title || '',
    digest: row.digest || '',
    content: row.content || '',
    cover_url: row.cover_url || '',
    article_type: row.article_type || 'NEWS',
    source_url: row.source_url || '',
    scheduled_at: row.scheduled_at || '',
    target_tags: row.target_tags || [],
  }
  dialogVisible.value = true
}

const handleSubmit = async () => {
  if (!form.value.title.trim()) {
    ElMessage.warning('请输入标题')
    return
  }
  try {
    if (editingId.value) {
      await axios.put(`/api/admin/wechat/articles/${editingId.value}`, {
        ...form.value,
        clanSlug: clanSlug.value,
      })
      ElMessage.success('已更新')
    } else {
      await axios.post('/api/admin/wechat/articles', {
        ...form.value,
        clanSlug: clanSlug.value,
        status: activeTab.value === 'sent' ? 'drafts' : activeTab.value,
      })
      ElMessage.success('已保存')
    }
    dialogVisible.value = false
    fetchList()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '保存失败')
  }
}

const handlePublish = async (row: any) => {
  try {
    await ElMessageBox.confirm(
      `确认立即推送「${row.title}」给所有关注者？此操作将真实下发到公众号（Mock 模式下仅打印日志）。`,
      '立即推送',
      { type: 'warning', confirmButtonText: '确认推送', cancelButtonText: '取消' },
    )
    await axios.post(`/api/admin/wechat/articles/${row.id}/publish`, {
      clanSlug: clanSlug.value,
    })
    ElMessage.success('已推送')
    fetchList()
  } catch (e: any) {
    if (e !== 'cancel') {
      ElMessage.error(e?.response?.data?.message || '推送失败')
    }
  }
}

const handleDuplicate = async (row: any) => {
  try {
    await axios.post(`/api/admin/wechat/articles/${row.id}/duplicate`, {
      clanSlug: clanSlug.value,
    })
    ElMessage.success('已复制为新草稿')
    activeTab.value = 'drafts'
    fetchList()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '复制失败')
  }
}

const handleDelete = async (id: string) => {
  try {
    await ElMessageBox.confirm('确认删除该内容？此操作不可恢复。', '删除确认', {
      type: 'warning',
    })
    await axios.delete(`/api/admin/wechat/articles/${id}`, {
      params: { clanSlug: clanSlug.value },
    })
    ElMessage.success('已删除')
    fetchList()
  } catch (e: any) {
    if (e !== 'cancel') {
      ElMessage.error(e?.response?.data?.message || '删除失败')
    }
  }
}

const onTabChange = (tab: string | number) => {
  activeTab.value = tab as 'drafts' | 'scheduled' | 'sent'
  pagination.value.page = 1
  fetchList()
}

const formatDate = (s?: string | null) => (s ? new Date(s).toLocaleString() : '—')

const statusTagType = (status: string) => ({
  drafts: 'info',
  scheduled: 'warning',
  sent: 'success',
}[status] as any || 'info')

const statusLabel = (status: string) => ({
  drafts: '草稿',
  scheduled: '已计划',
  sent: '已发送',
}[status] || status)

const typeLabel = (t: string) => ({
  NEWS: '图文',
  TEXT: '文本',
  IMAGE: '图片',
}[t] || t)

const onPageChange = (p: number) => {
  pagination.value.page = p
  fetchList()
}

onMounted(() => {
  clanSlug.value = (route.params.slug as string) || ''
  capabilityStore.refresh().catch(() => {})
  fetchList()
})

watch(
  () => route.params.slug,
  (slug) => {
    clanSlug.value = (slug as string) || ''
    fetchList()
  },
)
</script>

<template>
  <div class="wechat-content-page">
    <div class="page-header">
      <div>
        <h2>内容管理</h2>
        <p class="subtitle">编辑、计划、推送家族公众号图文 / 文本内容</p>
      </div>
      <ElButton type="primary" @click="handleCreate">
        新建内容
      </ElButton>
    </div>

    <ElAlert
      v-if="isMockMode"
      type="info"
      show-icon
      :closable="false"
      style="margin-bottom: 16px;"
    >
      <template #title>Mock 模式</template>
      当前为 Mock 模式，新建内容可保存并查看，但"立即推送"不会真实下发到微信侧，仅打印日志。
    </ElAlert>

    <ElCard v-loading="loading">
      <ElTabs :model-value="activeTab" @tab-change="onTabChange">
        <ElTabPane label="草稿" name="drafts" />
        <ElTabPane label="已计划" name="scheduled" />
        <ElTabPane label="已发送" name="sent" />
      </ElTabs>

      <ElTable :data="articles" stripe>
        <ElTableColumn prop="title" label="标题" min-width="220">
          <template #default="{ row }">
            <div class="article-title">
              <ElTag size="small" effect="plain" style="margin-right: 8px;">
                {{ typeLabel(row.article_type) }}
              </ElTag>
              <span>{{ row.title }}</span>
            </div>
            <div v-if="row.digest" class="article-digest">{{ row.digest }}</div>
          </template>
        </ElTableColumn>
        <ElTableColumn label="状态" width="100">
          <template #default="{ row }">
            <ElTag :type="statusTagType(row.status)">{{ statusLabel(row.status) }}</ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn label="计划推送时间" width="180">
          <template #default="{ row }">
            {{ formatDate(row.scheduled_at) }}
          </template>
        </ElTableColumn>
        <ElTableColumn label="实际推送时间" width="180">
          <template #default="{ row }">
            {{ formatDate(row.sent_at) }}
          </template>
        </ElTableColumn>
        <ElTableColumn label="阅读 / 送达" width="120">
          <template #default="{ row }">
            {{ row.read_count ?? '—' }} / {{ row.delivered_count ?? '—' }}
          </template>
        </ElTableColumn>
        <ElTableColumn label="更新时间" width="180">
          <template #default="{ row }">
            {{ formatDate(row.updated_at) }}
          </template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="280" fixed="right">
          <template #default="{ row }">
            <ElButton link type="primary" @click="handleEdit(row)">编辑</ElButton>
            <ElButton
              v-if="row.status !== 'sent'"
              link
              type="success"
              @click="handlePublish(row)"
            >
              {{ row.status === 'scheduled' ? '立即推送' : '推送' }}
            </ElButton>
            <ElButton link type="info" @click="handleDuplicate(row)">复制</ElButton>
            <ElButton link type="danger" @click="handleDelete(row.id)">删除</ElButton>
          </template>
        </ElTableColumn>
      </ElTable>

      <ElEmpty v-if="!loading && articles.length === 0" description="暂无内容" />

      <ElPagination
        v-model:current-page="pagination.page"
        :total="pagination.total"
        :page-size="pagination.pageSize"
        @current-change="onPageChange"
        layout="total, prev, pager, next"
        class="pagination"
      />
    </ElCard>

    <!-- 新建 / 编辑对话框 -->
    <ElDialog
      v-model="dialogVisible"
      :title="editingId ? '编辑内容' : '新建内容'"
      width="640px"
      :close-on-click-modal="false"
    >
      <ElForm :model="form" label-width="100px">
        <ElFormItem label="标题" required>
          <ElInput v-model="form.title" placeholder="请输入标题" maxlength="120" show-word-limit />
        </ElFormItem>
        <ElFormItem label="摘要">
          <ElInput v-model="form.digest" placeholder="可选，列表与预览中的简介" maxlength="200" show-word-limit />
        </ElFormItem>
        <ElFormItem label="类型">
          <ElSelect v-model="form.article_type" style="width: 200px;">
            <ElOption label="图文" value="NEWS" />
            <ElOption label="文本" value="TEXT" />
            <ElOption label="图片" value="IMAGE" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem v-if="form.article_type !== 'TEXT'" label="封面图">
          <ElInput v-model="form.cover_url" placeholder="封面图 URL" />
        </ElFormItem>
        <ElFormItem label="正文" required>
          <ElInput
            v-model="form.content"
            type="textarea"
            :rows="8"
            :placeholder="form.article_type === 'TEXT' ? '纯文本正文' : '支持 Markdown / HTML（按公众号规则过滤）'"
          />
        </ElFormItem>
        <ElFormItem label="原文链接">
          <ElInput v-model="form.source_url" placeholder="可选，阅读全文跳转地址" />
        </ElFormItem>
        <ElFormItem label="计划推送">
          <ElDatePicker
            v-model="form.scheduled_at"
            type="datetime"
            placeholder="选择计划推送时间（留空则仅保存草稿）"
            style="width: 260px;"
            value-format="YYYY-MM-DD HH:mm:ss"
          />
        </ElFormItem>
        <ElFormItem label="目标人群">
          <ElSelect
            v-model="form.target_tags"
            multiple
            filterable
            allow-create
            placeholder="留空则推送给全部关注者；可输入标签筛选"
            style="width: 100%;"
          />
          <span class="form-hint">支持自定义标签，例如：嫡系、外嫁女、年长者</span>
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="dialogVisible = false">取消</ElButton>
        <ElButton type="primary" @click="handleSubmit">保存</ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<style scoped>
.wechat-content-page {
  padding: 0;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.page-header h2 {
  margin: 0;
}

.subtitle {
  margin: 4px 0 0 0;
  color: #909399;
  font-size: 13px;
}

.article-title {
  display: flex;
  align-items: center;
  font-weight: 500;
}

.article-digest {
  margin-top: 4px;
  color: #909399;
  font-size: 12px;
  line-height: 1.4;
}

.pagination {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}

.form-hint {
  margin-left: 12px;
  color: #909399;
  font-size: 12px;
}
</style>