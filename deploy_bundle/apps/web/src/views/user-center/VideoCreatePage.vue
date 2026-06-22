<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useUserCenterStore } from '@/stores/userCenter'
import videoApi, { type LineageInfo, type MaterialPreview } from '@/api/video'
import treeApi from '@/api/tree'

const router = useRouter()
const route = useRoute()
const userStore = useUserCenterStore()

// 状态
const loading = ref(false)
const submitting = ref(false)
const personSearchLoading = ref(false)

// 选中的目标人物
const selectedPerson = ref<any>(null)

// 人物搜索
const searchQuery = ref('')
const searchResults = ref<any[]>([])
const showSearchDropdown = ref(false)

// 血脉信息
const lineageInfo = ref<LineageInfo | null>(null)
const materialPreview = ref<MaterialPreview | null>(null)
const loadingPreview = ref(false)

// VIP状态
const vipStatus = ref<{ is_vip: boolean; expires_at?: string }>({ is_vip: false })

// 创建表单
const createForm = reactive({
  style: 'nostalgic',
  use_priority: false,
})

// 视频风格选项
const styleOptions = [
  { value: 'nostalgic', label: '温馨怀旧（泛黄滤镜）' },
  { value: 'bw复古', label: '黑白复古' },
  { value: 'modern', label: '现代明亮' },
]

// VIP套餐
const vipPackages = [
  { type: 'single', name: '单次优先', price: 9.9, desc: '立即处理一次' },
  { type: 'monthly', name: '月度VIP', price: 29.9, desc: '30天内无限优先' },
  { type: 'yearly', name: '年度VIP', price: 199, desc: '365天内无限优先' },
]

// 计算属性
const canCreate = computed(() => {
  return selectedPerson.value && materialPreview.value && materialPreview.value.media_count > 0
})

const estimatedDuration = computed(() => {
  if (!materialPreview.value) return 0
  const count = materialPreview.value.media_count
  return Math.min(count * 3, 300) // 最多5分钟
})

const formattedDuration = computed(() => {
  const seconds = estimatedDuration.value
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
})

// 搜索人物
async function searchPersons(query: string) {
  if (!query || query.length < 1) {
    searchResults.value = []
    showSearchDropdown.value = false
    return
  }

  personSearchLoading.value = true
  try {
    const clanId = userStore.profile?.primary_clan?.id
    if (!clanId) return

    const res = await treeApi.searchPersons(query, Number(clanId)) as any
    searchResults.value = res || []
    showSearchDropdown.value = searchResults.value.length > 0
  } catch (err) {
    console.error('搜索失败:', err)
    searchResults.value = []
  } finally {
    personSearchLoading.value = false
  }
}

// 选择人物
async function selectPerson(person: any) {
  selectedPerson.value = person
  searchQuery.value = person.full_name
  showSearchDropdown.value = false

  // 加载血脉信息和素材预览
  await loadPreview()
}

// 加载预览信息
async function loadPreview() {
  if (!selectedPerson.value) return

  loadingPreview.value = true
  try {
    const [lineage, materials] = await Promise.all([
      videoApi.getPersonLineage(selectedPerson.value.id),
      videoApi.previewMaterials(selectedPerson.value.id),
    ])
    lineageInfo.value = lineage
    materialPreview.value = materials
  } catch (err) {
    console.error('加载预览失败:', err)
    ElMessage.error('加载预览信息失败')
  } finally {
    loadingPreview.value = false
  }
}

// 创建项目
async function handleCreate() {
  if (!canCreate.value) return

  try {
    await ElMessageBox.confirm(
      `确认要为「${selectedPerson.value.full_name}」生成历史音像墙吗？\n\n风格：${styleOptions.find(s => s.value === createForm.style)?.label}\n素材：${materialPreview.value?.media_count}张照片\n预计时长：${formattedDuration.value}`,
      '确认生成',
      {
        confirmButtonText: '确认生成',
        cancelButtonText: '取消',
        type: 'info',
      },
    )
  } catch {
    return
  }

  submitting.value = true
  try {
    const res = await videoApi.createProject({
      target_person_id: Number(selectedPerson.value.id),
      style: createForm.style,
      use_priority: createForm.use_priority,
    }) as any

    ElMessage.success('生成任务已创建！')
    router.push(`/user-center/videos/${res.id}`)
  } catch (err: any) {
    ElMessage.error(err.message || '创建失败')
  } finally {
    submitting.value = false
  }
}

// 购买VIP
async function handlePurchaseVip(type: string, price: number) {
  try {
    await ElMessageBox.confirm(
      `确认购买「${vipPackages.find(p => p.type === type)?.name}」？\n价格：¥${price}`,
      '确认购买',
      {
        confirmButtonText: '确认支付',
        cancelButtonText: '取消',
        type: 'warning',
      },
    )
  } catch {
    return
  }

  try {
    await videoApi.purchaseVip({ order_type: type as any, amount: price })
    ElMessage.success('VIP购买成功！')
    vipStatus.value = { is_vip: true }
    createForm.use_priority = true
  } catch (err: any) {
    ElMessage.error(err.message || '购买失败')
  }
}

// 跳转到选择人物页面
function goToSelectPerson() {
  router.push({ name: 'tree', query: { mode: 'select-person', callback: 'video-create' } })
}

// 监听搜索输入
function onSearchInput() {
  searchPersons(searchQuery.value)
}

// 初始化
onMounted(async () => {
  // 获取VIP状态
  try {
    vipStatus.value = await videoApi.getVipStatus()
  } catch (err) {
    console.error('获取VIP状态失败:', err)
  }

  // 检查URL参数中是否有预填的人物ID
  const personId = route.query.personId
  if (personId) {
    // 尝试加载预填人物
    try {
      const clanId = userStore.profile?.primary_clan?.id
      if (clanId) {
        const res = await treeApi.searchPersons('', Number(clanId)) as any[]
        const person = res?.find((p: any) => String(p.id) === String(personId))
        if (person) {
          await selectPerson(person)
        }
      }
    } catch (err) {
      console.error('加载预填人物失败:', err)
    }
  }
})
</script>

<template>
  <div class="video-create-page">
    <ElCard v-loading="loading">
      <template #header>
        <div class="header">
          <h2 class="page-title">生成历史音像墙</h2>
        </div>
      </template>

      <div class="create-form">
        <!-- 目标人物选择 -->
        <div class="form-section">
          <h3 class="section-title">选择目标人物</h3>
          <p class="section-desc">选择一位家族成员，系统将自动收集其直系血脉的所有照片</p>

          <div class="person-selector">
            <ElAutoComplete
              v-model="searchQuery"
              :fetch-suggestions="(query: string, cb: any) => { searchPersons(query).then(() => cb(searchResults.map(p => ({ value: p.full_name, person: p })))) }"
              placeholder="搜索家族成员姓名..."
              :trigger-on-focus="false"
              clearable
              @select="(item: any) => selectPerson(item.person)"
              @input="onSearchInput"
            >
              <template #default="{ item }">
                <div class="person-option">
                  <span class="person-name">{{ item.person.full_name }}</span>
                  <span class="person-gender">{{ item.person.gender === 'male' ? '男' : '女' }}</span>
                </div>
              </template>
            </ElAutoComplete>
            <ElButton @click="goToSelectPerson">从族谱选择</ElButton>
          </div>
        </div>

        <!-- 预览信息 -->
        <div v-if="selectedPerson" v-loading="loadingPreview" class="form-section preview-section">
          <h3 class="section-title">血脉与素材预览</h3>

          <!-- 目标人物信息 -->
          <div class="target-person-card">
            <div class="person-avatar">
              <ElIcon :size="32"><User /></ElIcon>
            </div>
            <div class="person-info">
              <div class="person-name">{{ selectedPerson.full_name }}</div>
              <div class="person-meta">
                {{ selectedPerson.gender === 'male' ? '男' : '女' }}
                <template v-if="selectedPerson.birth_date">
                  · {{ selectedPerson.birth_date?.slice(0, 4) }}年
                </template>
                <template v-if="selectedPerson.death_date">
                  - {{ selectedPerson.death_date?.slice(0, 4) }}年
                </template>
              </div>
            </div>
          </div>

          <!-- 血脉统计 -->
          <div class="lineage-stats">
            <div class="stat-item">
              <span class="stat-value">{{ lineageInfo?.total_ancestors || 0 }}</span>
              <span class="stat-label">直系祖先</span>
            </div>
            <div class="stat-item">
              <span class="stat-value">{{ lineageInfo?.total_descendants || 0 }}</span>
              <span class="stat-label">直系后代</span>
            </div>
            <div class="stat-item highlight">
              <span class="stat-value">{{ materialPreview?.media_count || 0 }}</span>
              <span class="stat-label">可用照片</span>
            </div>
          </div>

          <!-- 素材警告 -->
          <ElAlert
            v-if="materialPreview && materialPreview.media_count === 0"
            type="warning"
            title="暂无照片素材"
            description="该成员及其直系血脉暂无照片，请先上传照片后再试"
            :closable="false"
            style="margin-top: 16px"
          />

          <!-- 素材详情 -->
          <div v-if="materialPreview && materialPreview.media_count > 0" class="materials-detail">
            <div class="materials-header">
              <span>素材来源</span>
              <span class="materials-count">共 {{ materialPreview.media_count }} 张照片</span>
            </div>
            <div class="materials-list">
              <div v-for="p in materialPreview.persons.slice(0, 5)" :key="p.id" class="material-person">
                {{ p.full_name }}: {{ p.media_count }}张
              </div>
              <div v-if="materialPreview.persons.length > 5" class="more-persons">
                还有 {{ materialPreview.persons.length - 5 }} 人有照片...
              </div>
            </div>
          </div>

          <!-- 预估时长 -->
          <div v-if="materialPreview && materialPreview.media_count > 0" class="duration-estimate">
            <ElIcon><VideoCamera /></ElIcon>
            预估视频时长：{{ formattedDuration }}
          </div>
        </div>

        <!-- 风格选择 -->
        <div v-if="selectedPerson && materialPreview && materialPreview.media_count > 0" class="form-section">
          <h3 class="section-title">选择视频风格</h3>
          <div class="style-options">
            <div
              v-for="style in styleOptions"
              :key="style.value"
              :class="['style-option', { active: createForm.style === style.value }]"
              @click="createForm.style = style.value"
            >
              <div class="style-preview" :class="style.value" />
              <div class="style-name">{{ style.label }}</div>
            </div>
          </div>
        </div>

        <!-- 优先级选择 -->
        <div v-if="selectedPerson && materialPreview && materialPreview.media_count > 0" class="form-section">
          <h3 class="section-title">处理方式</h3>

          <div class="priority-options">
            <div
              :class="['priority-option', { active: !createForm.use_priority }]"
              @click="createForm.use_priority = false"
            >
              <div class="option-icon">
                <ElIcon :size="24"><Clock /></ElIcon>
              </div>
              <div class="option-info">
                <div class="option-name">普通排队</div>
                <div class="option-desc">免费，预计等待时间取决于队列长度</div>
              </div>
            </div>

            <div
              :class="['priority-option', 'vip-option', { active: createForm.use_priority }]"
              @click="createForm.use_priority = true"
            >
              <div class="option-icon">
                <ElIcon :size="24"><Lightning /></ElIcon>
              </div>
              <div class="option-info">
                <div class="option-name">
                  VIP优先
                  <ElTag v-if="vipStatus.is_vip" type="success" size="small">已开通</ElTag>
                </div>
                <div class="option-desc">
                  <template v-if="vipStatus.is_vip">您的VIP有效期内可无限次使用</template>
                  <template v-else>需要开通VIP服务</template>
                </div>
              </div>
            </div>
          </div>

          <!-- VIP套餐（未开通时显示） -->
          <div v-if="!vipStatus.is_vip" class="vip-packages">
            <div class="packages-title">开通VIP服务</div>
            <div class="packages-grid">
              <div v-for="pkg in vipPackages" :key="pkg.type" class="package-card">
                <div class="package-name">{{ pkg.name }}</div>
                <div class="package-price">¥{{ pkg.price }}</div>
                <div class="package-desc">{{ pkg.desc }}</div>
                <ElButton type="primary" plain size="small" @click="handlePurchaseVip(pkg.type, pkg.price)">
                  购买
                </ElButton>
              </div>
            </div>
          </div>
        </div>

        <!-- 提交按钮 -->
        <div v-if="selectedPerson && materialPreview && materialPreview.media_count > 0" class="form-actions">
          <ElButton size="large" @click="router.back()">取消</ElButton>
          <ElButton
            type="primary"
            size="large"
            :loading="submitting"
            :disabled="!canCreate"
            @click="handleCreate"
          >
            开始生成
          </ElButton>
        </div>
      </div>
    </ElCard>
  </div>
</template>

<style scoped>
.video-create-page {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
}

.page-title {
  margin: 0;
  font-size: 20px;
}

.create-form {
  padding: 20px 0;
}

.form-section {
  margin-bottom: 32px;
}

.section-title {
  margin: 0 0 8px;
  font-size: 16px;
  font-weight: 600;
}

.section-desc {
  margin: 0 0 16px;
  color: #909399;
  font-size: 14px;
}

.person-selector {
  display: flex;
  gap: 12px;
}

.person-selector .el-autocomplete {
  flex: 1;
}

.person-option {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0;
}

.person-gender {
  color: #909399;
  font-size: 12px;
}

.preview-section {
  background: #f5f7fa;
  padding: 20px;
  border-radius: 8px;
}

.target-person-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: #fff;
  border-radius: 8px;
  margin-bottom: 16px;
}

.person-avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: linear-gradient(135deg, #5d4037, #8d6e63);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
}

.person-info .person-name {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 4px;
}

.person-meta {
  color: #909399;
  font-size: 14px;
}

.lineage-stats {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
}

.stat-item {
  flex: 1;
  text-align: center;
  padding: 12px;
  background: #fff;
  border-radius: 8px;
}

.stat-item.highlight {
  background: linear-gradient(135deg, #5d4037, #8d6e63);
  color: #fff;
}

.stat-value {
  display: block;
  font-size: 28px;
  font-weight: 700;
}

.stat-label {
  font-size: 13px;
  color: inherit;
  opacity: 0.8;
}

.materials-detail {
  background: #fff;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 12px;
}

.materials-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 13px;
  color: #606266;
}

.materials-count {
  color: #909399;
}

.materials-list {
  font-size: 13px;
  color: #606266;
}

.material-person {
  padding: 4px 0;
}

.more-persons {
  color: #909399;
  font-style: italic;
}

.duration-estimate {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #5d4037;
  font-weight: 500;
}

.style-options {
  display: flex;
  gap: 16px;
}

.style-option {
  flex: 1;
  border: 2px solid #ebeef5;
  border-radius: 8px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.3s;
}

.style-option:hover {
  border-color: #8d6e63;
}

.style-option.active {
  border-color: #5d4037;
  background: #faf5f3;
}

.style-preview {
  height: 80px;
  border-radius: 4px;
  margin-bottom: 8px;
}

.style-preview.nostalgic {
  background: linear-gradient(135deg, #d4a574, #c4956a);
}

.style-preview.bw复古 {
  background: linear-gradient(135deg, #555, #333);
}

.style-preview.modern {
  background: linear-gradient(135deg, #87ceeb, #98d8c8);
}

.style-name {
  text-align: center;
  font-size: 14px;
}

.priority-options {
  display: flex;
  gap: 16px;
}

.priority-option {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border: 2px solid #ebeef5;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s;
}

.priority-option:hover {
  border-color: #8d6e63;
}

.priority-option.active {
  border-color: #5d4037;
  background: #faf5f3;
}

.priority-option.vip-option .option-icon {
  color: #e6a23c;
}

.option-icon {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: #f5f7fa;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #606266;
}

.option-name {
  font-weight: 600;
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.option-desc {
  font-size: 13px;
  color: #909399;
}

.vip-packages {
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid #ebeef5;
}

.packages-title {
  font-weight: 600;
  margin-bottom: 16px;
}

.packages-grid {
  display: flex;
  gap: 16px;
}

.package-card {
  flex: 1;
  text-align: center;
  padding: 16px;
  background: #fff;
  border-radius: 8px;
  border: 1px solid #ebeef5;
}

.package-name {
  font-weight: 600;
  margin-bottom: 8px;
}

.package-price {
  font-size: 24px;
  font-weight: 700;
  color: #e6a23c;
  margin-bottom: 8px;
}

.package-desc {
  font-size: 12px;
  color: #909399;
  margin-bottom: 12px;
}

.form-actions {
  display: flex;
  justify-content: center;
  gap: 16px;
  padding-top: 24px;
  border-top: 1px solid #ebeef5;
}

.form-actions .el-button {
  min-width: 120px;
}
</style>
