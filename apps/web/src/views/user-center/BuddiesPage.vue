<script setup lang="ts">
import { ref, onMounted, computed, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Location, Picture, Bell, Search, Refresh, Plus } from '@element-plus/icons-vue'
import {
  findBuddies,
  sendGreeting,
  getMyMatches,
  getInboundMatches,
  respondMatch,
  findByPhoto,
  claimPhoto,
  getMyPhotoClaims,
  getChildhoodPlaces,
  type BuddyMatch,
  type PhotoClaim,
  type PhotoFindCandidate,
} from '@/api/buddy'
import { mediaApi } from '@/api/media'
import { useClanStore } from '@/stores/clan'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const clanStore = useClanStore()
const authStore = useAuthStore()
const currentUserId = computed(() => authStore.user?.sub || '')

// ==================== 状态 ====================
const loading = ref(false)
const locationMatches = ref<any[]>([])
const photoMatches = ref<PhotoFindCandidate[]>([])
const outboundMatches = ref<BuddyMatch[]>([])
const inboundMatches = ref<BuddyMatch[]>([])
const photoClaims = ref<PhotoClaim[]>([])

const locationInput = ref<{ focus: () => void } | null>(null)
const findForm = ref({
  location_name: '',
  start_year: undefined as number | undefined,
  end_year: undefined as number | undefined,
})

const photoFindForm = reactive({
  media_id: undefined as number | undefined,
  taken_year: undefined as number | undefined,
  taken_location: '',
})

const claimForm = reactive({
  media_id: undefined as number | undefined,
  position_description: '',
})

// 当前用户的隐私提示
const photoFindPrivacyNotice = ref<string | null>(null)

// 我的家族媒体（仅用于「按照片找」选择器）
const myClanMedia = ref<any[]>([])
const childhoodPlaces = ref<any[]>([])

// 媒体选择对话框
const mediaPickerVisible = ref(false)
const mediaPickerLoading = ref(false)
const mediaSearch = ref('')
const inboundTab = ref<'pending' | 'accepted' | 'outbound'>('pending')

const filteredMedia = computed(() => {
  const q = mediaSearch.value.trim().toLowerCase()
  if (!q) return myClanMedia.value
  return myClanMedia.value.filter(
    (m) =>
      (m.description || '').toLowerCase().includes(q) ||
      (m.taken_location || '').toLowerCase().includes(q),
  )
})

// ==================== 计算属性 ====================
const pendingInbound = computed(() =>
  inboundMatches.value.filter((m) => m.status === 'PENDING'),
)
const acceptedInbound = computed(() =>
  inboundMatches.value.filter((m) => m.status === 'ACCEPTED'),
)

// ==================== 加载 ====================
async function loadChildhoodPlaces() {
  try {
    const res = await getChildhoodPlaces()
    childhoodPlaces.value = res.data || []
  } catch (e) {
    childhoodPlaces.value = []
  }
}

async function loadMyClanMedia() {
  const clanId = clanStore.currentClanId
  if (!clanId) {
    myClanMedia.value = []
    return
  }
  try {
    const res = await mediaApi.listMedia(clanId)
    myClanMedia.value = res || []
  } catch (e) {
    myClanMedia.value = []
  }
}

async function loadOutboundMatches() {
  try {
    const res = await getMyMatches({ status: 'PENDING' })
    // 我作为发起人的匹配（outbound）
    outboundMatches.value = (res.data || []).filter(
      (m) => m.requester_id === currentUserId.value,
    )
  } catch (e) {
    outboundMatches.value = []
  }
}

async function loadInboundMatches() {
  try {
    const res = await getInboundMatches()
    inboundMatches.value = res.data || []
  } catch (e) {
    inboundMatches.value = []
  }
}

async function loadPhotoClaims() {
  try {
    const res = await getMyPhotoClaims()
    photoClaims.value = res.data || []
  } catch (e) {
    photoClaims.value = []
  }
}

async function refreshAll() {
  loading.value = true
  try {
    await Promise.all([
      loadInboundMatches(),
      loadOutboundMatches(),
      loadPhotoClaims(),
    ])
  } finally {
    loading.value = false
  }
}

// ==================== 按地点找 ====================
async function handleFindByLocation() {
  if (!findForm.value.location_name) {
    ElMessage.warning('请输入童年地点名称')
    return
  }
  loading.value = true
  try {
    const res = await findBuddies(findForm.value)
    locationMatches.value = res.data || []
    if (locationMatches.value.length === 0) {
      ElMessage.info('暂时没有找到小伙伴，建议补充更多童年地点信息')
    } else {
      ElMessage.success(`找到 ${locationMatches.value.length} 位可能的小伙伴`)
    }
  } catch (error: any) {
    ElMessage.error(error.response?.data?.message || '寻找失败')
  } finally {
    loading.value = false
  }
}

async function handleGreeting(matchedUserId: string) {
  try {
    await sendGreeting(matchedUserId, {
      message: '你好，我也是在那里长大的，还记得我吗？',
    })
    ElMessage.success('打招呼已发送，等待对方回应')
    await loadOutboundMatches()
  } catch (error: any) {
    ElMessage.error(error.response?.data?.message || '发送失败')
  }
}

function viewMatchDetail(matchId: string) {
  router.push(`/user-center/buddies/${matchId}`)
}

function managePlaces() {
  router.push('/user-center/buddies/childhood-places')
}

// ==================== 按照片找 ====================
async function openMediaPicker() {
  mediaPickerVisible.value = true
  if (myClanMedia.value.length === 0) {
    mediaPickerLoading.value = true
    try {
      await loadMyClanMedia()
    } finally {
      mediaPickerLoading.value = false
    }
  }
}

function pickMedia(media: any) {
  photoFindForm.media_id = Number(media.id)
  claimForm.media_id = Number(media.id)
  mediaPickerVisible.value = false
}

async function handleFindByPhoto() {
  if (!photoFindForm.media_id && !photoFindForm.taken_year && !photoFindForm.taken_location) {
    ElMessage.warning('请至少选择一张照片或填写年份/地点')
    return
  }
  loading.value = true
  photoFindPrivacyNotice.value = null
  try {
    const res = await findByPhoto({
      media_id: photoFindForm.media_id,
      taken_year: photoFindForm.taken_year,
      taken_location: photoFindForm.taken_location || undefined,
    })
    photoMatches.value = res.data || []
    if (photoMatches.value.length === 0) {
      ElMessage.info('未找到符合隐私设置的小伙伴，可调整年份或地点后再试')
    } else {
      ElMessage.success(`找到 ${photoMatches.value.length} 位可能出现在照片中的人`)
    }
  } catch (error: any) {
    if (error?.response?.status === 400) {
      photoFindPrivacyNotice.value =
        error.response.data?.message || '请提供照片或年份/地点信息'
    } else {
      ElMessage.error(error.response?.data?.message || '按照片找失败')
    }
  } finally {
    loading.value = false
  }
}

async function handleClaimFromFind(candidate: PhotoFindCandidate) {
  // 通过匹配候选发起 photo-claim
  if (!photoFindForm.media_id) {
    ElMessage.warning('请先选择一张原始照片再发起认领')
    return
  }
  try {
    await claimPhoto({
      media_id: photoFindForm.media_id,
      position_description: claimForm.position_description || undefined,
    })
    ElMessage.success('已提交照片认领申请，请等待照片所有者审核')
    await loadPhotoClaims()
  } catch (error: any) {
    ElMessage.error(error.response?.data?.message || '认领失败')
  }
}

async function handleClaimDirect() {
  if (!claimForm.media_id) {
    ElMessage.warning('请选择要认领的照片')
    return
  }
  try {
    await claimPhoto({
      media_id: claimForm.media_id,
      position_description: claimForm.position_description || undefined,
    })
    ElMessage.success('已提交照片认领申请')
    claimForm.position_description = ''
    await loadPhotoClaims()
  } catch (error: any) {
    ElMessage.error(error.response?.data?.message || '认领失败')
  }
}

// ==================== 谁在找我 ====================
async function handleRespond(match: BuddyMatch, action: 'accept' | 'decline' | 'ignore') {
  const labelMap: Record<typeof action, string> = {
    accept: '接受',
    decline: '婉拒',
    ignore: '忽略',
  }
  if (action !== 'ignore') {
    try {
      await ElMessageBox.confirm(
        `确认${labelMap[action]} ${match.requester?.nickname || '该用户'} 的打招呼？`,
        `${labelMap[action]}匹配`,
        { confirmButtonText: '确认', cancelButtonText: '取消', type: 'warning' },
      )
    } catch {
      return
    }
  }
  try {
    await respondMatch(match.id, { action })
    ElMessage.success(`已${labelMap[action]}`)
    await loadInboundMatches()
  } catch (error: any) {
    ElMessage.error(error.response?.data?.message || '操作失败')
  }
}

const claimStatusTagType = (status: PhotoClaim['status']) => {
  if (status === 'APPROVED') return 'success'
  if (status === 'REJECTED') return 'danger'
  return 'warning'
}

const matchStatusTagType = (status: BuddyMatch['status']) => {
  if (status === 'ACCEPTED') return 'success'
  if (status === 'DECLINED' || status === 'IGNORED' || status === 'EXPIRED') return 'info'
  if (status === 'PENDING') return 'warning'
  return 'info'
}

const formatDate = (s?: string | null) => (s ? new Date(s).toLocaleString() : '')

onMounted(async () => {
  await loadChildhoodPlaces()
  await refreshAll()
})
</script>

<template>
  <div class="buddies-page">
    <div class="page-header">
      <h2>寻找儿时伙伴</h2>
      <ElSpace>
        <ElButton type="primary" plain @click="managePlaces">
          <ElIcon><Location /></ElIcon>
          我的童年地点
        </ElButton>
        <ElButton @click="refreshAll" :loading="loading">
          <ElIcon><Refresh /></ElIcon>
          刷新
        </ElButton>
      </ElSpace>
    </div>

    <!-- 三宫格快捷入口 -->
    <ElCard class="quick-entry-card" shadow="hover">
      <ElRow :gutter="20">
        <ElCol :xs="24" :sm="8">
          <div class="entry-tile entry-location" @click="locationInput?.focus?.()">
            <ElIcon :size="28" color="#fff"><Location /></ElIcon>
            <div class="entry-title">按地点找</div>
            <div class="entry-sub">通过童年共同生活地点匹配</div>
          </div>
        </ElCol>
        <ElCol :xs="24" :sm="8">
          <div class="entry-tile entry-photo">
            <ElIcon :size="28" color="#fff"><Picture /></ElIcon>
            <div class="entry-title">按照片找</div>
            <div class="entry-sub">通过共同出现的照片匹配</div>
          </div>
        </ElCol>
        <ElCol :xs="24" :sm="8">
          <div class="entry-tile entry-bell" :class="{ 'has-pending': pendingInbound.length > 0 }">
            <ElIcon :size="28" color="#fff"><Bell /></ElIcon>
            <div class="entry-title">谁在找我</div>
            <div class="entry-sub">
              <ElBadge
                v-if="pendingInbound.length > 0"
                :value="pendingInbound.length"
                :max="99"
                class="pending-badge"
              />
              <span v-else>暂无新招呼</span>
            </div>
          </div>
        </ElCol>
      </ElRow>
    </ElCard>

    <!-- 1. 按地点找 -->
    <ElCard class="find-form-card" shadow="hover">
      <template #header>
        <div class="card-header">
          <span><ElIcon><Location /></ElIcon> 按地点找</span>
          <span class="header-sub">已设 {{ childhoodPlaces.length }} 个童年地点</span>
        </div>
      </template>
      <ElForm :model="findForm" label-width="100px" inline>
        <ElFormItem label="童年地点">
          <ElInput
            ref="locationInput"
            v-model="findForm.location_name"
            placeholder="例如：王家村、红旗小学"
            clearable
            style="width: 260px"
          />
        </ElFormItem>
        <ElFormItem label="年份起">
          <ElInputNumber
            v-model="findForm.start_year"
            :min="1900"
            :max="2020"
            placeholder="开始年份"
            style="width: 140px"
          />
        </ElFormItem>
        <ElFormItem label="年份止">
          <ElInputNumber
            v-model="findForm.end_year"
            :min="1900"
            :max="2020"
            placeholder="结束年份"
            style="width: 140px"
          />
        </ElFormItem>
        <ElFormItem>
          <ElButton type="primary" :loading="loading" @click="handleFindByLocation">
            <ElIcon><Search /></ElIcon>
            开始寻找
          </ElButton>
        </ElFormItem>
      </ElForm>

      <ElTable
        v-if="locationMatches.length > 0"
        :data="locationMatches"
        style="width: 100%; margin-top: 12px"
        max-height="300"
      >
        <ElTableColumn label="用户" min-width="200">
          <template #default="{ row }">
            <div class="user-cell">
              <ElAvatar :size="36" :src="row.matched_user?.avatar_url">
                {{ row.matched_user?.nickname?.charAt(0) || '用' }}
              </ElAvatar>
              <div class="user-info">
                <div class="nickname">{{ row.matched_user?.nickname || '匿名用户' }}</div>
                <div class="location">{{ row.location }}</div>
              </div>
            </div>
          </template>
        </ElTableColumn>
        <ElTableColumn label="匹配度" width="100">
          <template #default="{ row }">
            <ElTag :type="row.match_score >= 80 ? 'success' : row.match_score >= 60 ? 'warning' : 'info'">
              {{ row.match_score }}%
            </ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn label="匹配依据" min-width="260">
          <template #default="{ row }">
            <div v-for="(reason, idx) in row.match_reasons" :key="idx" class="reason-item">
              {{ reason }}
            </div>
          </template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <ElButton size="small" type="primary" @click="handleGreeting(row.matched_user.id)">
              打招呼
            </ElButton>
          </template>
        </ElTableColumn>
      </ElTable>
    </ElCard>

    <!-- 2. 按照片找 -->
    <ElCard class="find-form-card" shadow="hover">
      <template #header>
        <div class="card-header">
          <span><ElIcon><Picture /></ElIcon> 按照片找</span>
          <span class="header-sub">
            已遵守
            <ElTooltip
              content="仅当其他用户开启了「允许通过照片找到我」时，才会出现在匹配结果中。"
              placement="top"
            >
              <span class="privacy-hint">隐私设置 allow_photo_find_me</span>
            </ElTooltip>
          </span>
        </div>
      </template>

      <ElForm :model="photoFindForm" label-width="100px" inline>
        <ElFormItem label="选择照片">
          <ElSpace>
            <ElButton @click="openMediaPicker">
              <ElIcon><Plus /></ElIcon>
              {{ photoFindForm.media_id ? '已选 #' + photoFindForm.media_id : '选择家族照片' }}
            </ElButton>
            <ElInputNumber
              v-model="photoFindForm.taken_year"
              :min="1900"
              :max="2030"
              placeholder="拍摄年份"
              style="width: 140px"
            />
            <ElInput
              v-model="photoFindForm.taken_location"
              placeholder="或输入拍摄地点"
              clearable
              style="width: 220px"
            />
          </ElSpace>
        </ElFormItem>
        <ElFormItem>
          <ElButton type="success" :loading="loading" @click="handleFindByPhoto">
            <ElIcon><Search /></ElIcon>
            按照片匹配
          </ElButton>
        </ElFormItem>
      </ElForm>

      <ElAlert
        v-if="photoFindPrivacyNotice"
        :title="photoFindPrivacyNotice"
        type="warning"
        :closable="false"
        show-icon
        style="margin-top: 8px"
      />

      <ElTable
        v-if="photoMatches.length > 0"
        :data="photoMatches"
        style="width: 100%; margin-top: 12px"
        max-height="320"
      >
        <ElTableColumn label="用户" min-width="200">
          <template #default="{ row }">
            <div class="user-cell">
              <ElAvatar :size="36" :src="row.matched_user?.avatar_url">
                {{ row.matched_user?.nickname?.charAt(0) || '用' }}
              </ElAvatar>
              <div class="user-info">
                <div class="nickname">{{ row.matched_user?.nickname || '匿名用户' }}</div>
                <div class="location">
                  <span v-if="row.matched_user?.birth_date">
                    出生年份：{{ new Date(row.matched_user.birth_date).getFullYear() }}
                  </span>
                </div>
              </div>
            </div>
          </template>
        </ElTableColumn>
        <ElTableColumn label="共同照片" min-width="220">
          <template #default="{ row }">
            <div v-for="(p, idx) in row.shared_photos" :key="idx" class="shared-photo">
              <ElImage
                v-if="p.file_url"
                :src="p.file_url"
                :preview-src-list="[p.file_url]"
                fit="cover"
                style="width: 56px; height: 56px; border-radius: 4px"
                :preview-teleported="true"
              />
              <div class="shared-photo-meta">
                <div>#{{ p.media_id }} · {{ p.taken_year || '年份未知' }}</div>
                <div class="muted">{{ p.taken_location || '地点未填' }}</div>
              </div>
            </div>
          </template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <ElButton size="small" type="primary" @click="handleClaimFromFind(row as PhotoFindCandidate)">
              发起认领
            </ElButton>
          </template>
        </ElTableColumn>
      </ElTable>

      <ElDivider />

      <div class="sub-section">
        <div class="sub-title">直接认领一张照片</div>
        <ElForm :model="claimForm" label-width="100px" inline>
          <ElFormItem label="选择照片">
            <ElButton @click="openMediaPicker">
              <ElIcon><Plus /></ElIcon>
              {{ claimForm.media_id ? '已选 #' + claimForm.media_id : '选择家族照片' }}
            </ElButton>
          </ElFormItem>
          <ElFormItem label="位置描述">
            <ElInput
              v-model="claimForm.position_description"
              placeholder="例如：前排左起第三人"
              clearable
              style="width: 260px"
            />
          </ElFormItem>
          <ElFormItem>
            <ElButton type="primary" :loading="loading" @click="handleClaimDirect">
              提交认领
            </ElButton>
          </ElFormItem>
        </ElForm>

        <ElTable
          v-if="photoClaims.length > 0"
          :data="photoClaims"
          style="width: 100%; margin-top: 12px"
          max-height="280"
        >
          <ElTableColumn label="照片" min-width="220">
            <template #default="{ row }">
              <div class="shared-photo">
                <ElImage
                  v-if="row.media?.thumb_url || row.media?.file_url"
                  :src="row.media?.thumb_url || row.media?.file_url"
                  :preview-src-list="[row.media?.file_url || row.media?.thumb_url || '']"
                  fit="cover"
                  style="width: 56px; height: 56px; border-radius: 4px"
                  :preview-teleported="true"
                />
                <div class="shared-photo-meta">
                  <div>#{{ row.media_id }} · {{ row.media?.taken_year || '年份未知' }}</div>
                  <div class="muted">{{ row.media?.taken_location || row.position_description || '未填说明' }}</div>
                </div>
              </div>
            </template>
          </ElTableColumn>
          <ElTableColumn label="状态" width="100">
            <template #default="{ row }">
              <ElTag :type="claimStatusTagType(row.status)">{{ row.status }}</ElTag>
            </template>
          </ElTableColumn>
          <ElTableColumn label="提交时间" min-width="180">
            <template #default="{ row }">
              {{ formatDate(row.created_at) }}
            </template>
          </ElTableColumn>
        </ElTable>
      </div>
    </ElCard>

    <!-- 3. 谁在找我 -->
    <ElCard class="find-form-card" shadow="hover">
      <template #header>
        <div class="card-header">
          <span><ElIcon><Bell /></ElIcon> 谁在找我</span>
          <span class="header-sub">仅显示当前登录用户作为被匹配方的记录</span>
        </div>
      </template>

      <ElTabs v-model="inboundTab">
        <ElTabPane :label="`待处理 (${pendingInbound.length})`" name="pending">
          <ElTable
            v-if="pendingInbound.length > 0"
            :data="pendingInbound"
            style="width: 100%"
          >
            <ElTableColumn label="对方" min-width="200">
              <template #default="{ row }">
                <div class="user-cell">
                  <ElAvatar :size="36" :src="row.requester?.avatar_url">
                    {{ row.requester?.nickname?.charAt(0) || '用' }}
                  </ElAvatar>
                  <div class="user-info">
                    <div class="nickname">{{ row.requester?.nickname || '匿名用户' }}</div>
                    <div class="location">{{ formatDate(row.contacted_at) }}</div>
                  </div>
                </div>
              </template>
            </ElTableColumn>
            <ElTableColumn label="留言" min-width="260">
              <template #default="{ row }">
                <div class="reason-item">{{ row.greeting_message || '（无留言）' }}</div>
              </template>
            </ElTableColumn>
            <ElTableColumn label="操作" width="320" fixed="right">
              <template #default="{ row }">
                <ElButton size="small" type="primary" @click="handleRespond(row as BuddyMatch, 'accept')">
                  接受
                </ElButton>
                <ElButton size="small" @click="handleRespond(row as BuddyMatch, 'decline')">婉拒</ElButton>
                <ElButton size="small" type="info" plain @click="handleRespond(row as BuddyMatch, 'ignore')">
                  忽略
                </ElButton>
                <ElButton size="small" link @click="viewMatchDetail(row.id)">详情</ElButton>
              </template>
            </ElTableColumn>
          </ElTable>
          <ElEmpty v-else description="暂无待处理的招呼" />
        </ElTabPane>

        <ElTabPane :label="`已接受 (${acceptedInbound.length})`" name="accepted">
          <ElTable
            v-if="acceptedInbound.length > 0"
            :data="acceptedInbound"
            style="width: 100%"
          >
            <ElTableColumn label="对方" min-width="200">
              <template #default="{ row }">
                <div class="user-cell">
                  <ElAvatar :size="36" :src="row.requester?.avatar_url">
                    {{ row.requester?.nickname?.charAt(0) || '用' }}
                  </ElAvatar>
                  <div class="user-info">
                    <div class="nickname">{{ row.requester?.nickname || '匿名用户' }}</div>
                    <div class="location">响应于 {{ formatDate(row.responded_at) }}</div>
                  </div>
                </div>
              </template>
            </ElTableColumn>
            <ElTableColumn label="操作" width="120" fixed="right">
              <template #default="{ row }">
                <ElButton size="small" link @click="viewMatchDetail(row.id)">查看详情</ElButton>
              </template>
            </ElTableColumn>
          </ElTable>
          <ElEmpty v-else description="暂无已接受的小伙伴" />
        </ElTabPane>

        <ElTabPane :label="`我发起的 (${outboundMatches.length})`" name="outbound">
          <ElTable
            v-if="outboundMatches.length > 0"
            :data="outboundMatches"
            style="width: 100%"
          >
            <ElTableColumn label="对方" min-width="200">
              <template #default="{ row }">
                <div class="user-cell">
                  <ElAvatar :size="36" :src="row.matched_user?.avatar_url">
                    {{ row.matched_user?.nickname?.charAt(0) || '用' }}
                  </ElAvatar>
                  <div class="user-info">
                    <div class="nickname">{{ row.matched_user?.nickname || '匿名用户' }}</div>
                    <div class="location">{{ formatDate(row.contacted_at) }}</div>
                  </div>
                </div>
              </template>
            </ElTableColumn>
            <ElTableColumn label="状态" width="120">
              <template #default="{ row }">
                <ElTag :type="matchStatusTagType(row.status)">{{ row.status }}</ElTag>
              </template>
            </ElTableColumn>
          </ElTable>
          <ElEmpty v-else description="暂无我发起的小伙伴招呼" />
        </ElTabPane>
      </ElTabs>
    </ElCard>

    <!-- 媒体选择器对话框 -->
    <ElDialog
      v-model="mediaPickerVisible"
      title="选择家族照片"
      width="720"
      destroy-on-close
    >
      <ElInput
        v-model="mediaSearch"
        placeholder="搜索照片描述或地点"
        clearable
        style="margin-bottom: 12px"
      />
      <ElScrollbar v-loading="mediaPickerLoading" max-height="480">
        <ElEmpty v-if="!mediaPickerLoading && filteredMedia.length === 0" description="暂无可选照片" />
        <div class="media-grid">
          <div
            v-for="m in filteredMedia"
            :key="String(m.id)"
            class="media-item"
            @click="pickMedia(m)"
          >
            <ElImage
              :src="m.thumb_url || m.file_url"
              :preview-src-list="[m.file_url]"
              fit="cover"
              style="width: 100%; height: 130px; border-radius: 6px"
              :preview-teleported="true"
              :hide-on-click-modal="true"
            />
            <div class="media-meta">
              <div>#{{ m.id }} · {{ m.taken_year || '年份未知' }}</div>
              <div class="muted">{{ m.taken_location || m.description || '未填说明' }}</div>
            </div>
          </div>
        </div>
      </ElScrollbar>
    </ElDialog>
  </div>
</template>

<style scoped>
.buddies-page {
  max-width: 1200px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.page-header h2 {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  color: #303133;
}

.quick-entry-card,
.find-form-card {
  margin-bottom: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
}

.card-header > span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.header-sub {
  font-size: 12px;
  color: #909399;
  font-weight: 400;
}

.privacy-hint {
  text-decoration: underline dotted;
  cursor: help;
}

.entry-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 110px;
  border-radius: 8px;
  color: #fff;
  cursor: pointer;
  transition: transform 0.2s ease;
}

.entry-tile:hover {
  transform: translateY(-2px);
}

.entry-location {
  background: linear-gradient(135deg, #409eff, #66b1ff);
}

.entry-photo {
  background: linear-gradient(135deg, #67c23a, #85ce61);
}

.entry-bell {
  background: linear-gradient(135deg, #e6a23c, #f0b75e);
}

.entry-bell.has-pending {
  background: linear-gradient(135deg, #f56c6c, #f89898);
}

.entry-title {
  font-size: 18px;
  font-weight: 600;
  margin-top: 8px;
}

.entry-sub {
  font-size: 12px;
  opacity: 0.85;
  margin-top: 4px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.pending-badge :deep(.el-badge__content) {
  background: #fff;
  color: #f56c6c;
  border: none;
}

.user-cell {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-info {
  flex: 1;
}

.nickname {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}

.location {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

.reason-item {
  font-size: 13px;
  color: #606266;
  line-height: 1.6;
}

.shared-photo {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 0;
}

.shared-photo + .shared-photo {
  border-top: 1px dashed #ebeef5;
  margin-top: 4px;
  padding-top: 8px;
}

.shared-photo-meta {
  font-size: 12px;
  color: #303133;
  flex: 1;
}

.muted {
  color: #909399;
  font-size: 11px;
  margin-top: 2px;
}

.sub-section {
  background: #fafbfc;
  border-radius: 6px;
  padding: 14px 16px;
  margin-top: 8px;
}

.sub-title {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 8px;
}

.media-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
}

.media-item {
  border: 1px solid #ebeef5;
  border-radius: 8px;
  padding: 8px;
  cursor: pointer;
  transition: border-color 0.2s ease, transform 0.2s ease;
}

.media-item:hover {
  border-color: #409eff;
  transform: translateY(-2px);
}

.media-meta {
  font-size: 12px;
  color: #303133;
  margin-top: 6px;
}

@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .page-header h2 {
    font-size: 20px;
  }
}
</style>
