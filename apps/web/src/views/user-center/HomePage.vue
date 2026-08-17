<script setup lang="ts">
/**
 * 用户中心首页（族员用户中心 · 首页）
 *
 * 设计目标：
 * 1. 首页直接给出"树谱 / 册谱"两大入口卡片，族员进来第一眼就能进入族谱浏览；
 * 2. 其余功能按分类归拢为"快捷功能"，避免菜单层级过深、入口太多。
 */
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useUserCenterStore } from '@/stores/userCenter'
import {
  UserFilled,
  Share,
  Notebook,
  PictureFilled,
  VideoCamera,
  EditPen,
  House,
  ChatLineRound,
  Tools,
  User,
  OfficeBuilding,
  Connection,
  CircleCheck,
  List,
  Setting,
  Right,
  Management,
  Collection,
  VideoPlay,
} from '@element-plus/icons-vue'

const router = useRouter()
const userStore = useUserCenterStore()

const profile = computed(() => userStore.profile)
const primaryClan = computed(() => userStore.profile?.primary_clan)

/** 树谱/册谱路由参数：优先 slug，兜底 id（后端两者均可解析） */
const clanKey = computed(() => {
  const clan = primaryClan.value
  if (!clan) return ''
  return clan.slug || clan.id
})

const avatarUrl = computed(() => profile.value?.avatar_url || '')
const displayName = computed(
  () => profile.value?.nickname || profile.value?.phone || '用户',
)
const clanName = computed(
  () => primaryClan.value?.name || '尚未加入家族',
)

const roleLabel = computed(() => {
  switch (primaryClan.value?.role) {
    case 'OWNER':
      return '所有者'
    case 'ADMIN':
      return '管理员'
    case 'EDITOR':
      return '编辑者'
    case 'VIEWER':
      return '观察员'
    default:
      return '成员'
  }
})

const roleTagType = computed(() => {
  switch (primaryClan.value?.role) {
    case 'OWNER':
      return 'danger'
    case 'ADMIN':
      return 'warning'
    case 'EDITOR':
      return 'primary'
    default:
      return 'info'
  }
})

/** 首页主入口：树谱 / 册谱 */
const genealogyLinks = computed(() => {
  const key = clanKey.value
  return [
    {
      title: '树谱',
      desc: '查看世系树，纵览家族脉络',
      icon: Share,
      path: `/tree/${key}`,
      accent: '#5D4037',
    },
    {
      title: '册谱',
      desc: '翻阅世系册，检索世录信息',
      icon: Notebook,
      path: `/cepu/${key}`,
      accent: '#8D6E63',
    },
  ]
})

/** 快捷功能（与侧边菜单分类一致，方便快速直达） */
const quickGroups = [
  {
    title: '内容与空间',
    items: [
      { title: '我的时光', icon: PictureFilled, path: '/user-center/timeline' },
      { title: '家庭图册', icon: Notebook, path: '/user-center/family-book' },
      { title: '我的音像墙', icon: VideoCamera, path: '/user-center/videos' },
      { title: '我的标注', icon: EditPen, path: '/user-center/annotations' },
      { title: '我的记忆贡献', icon: Collection, path: '/user-center/memory-contributions' },
      { title: '个人空间', icon: House, path: '/user-center/personal-space/albums' },
    ],
  },
  {
    title: '互动与工具',
    items: [
      { title: '我的小组', icon: ChatLineRound, path: '/user-center/groups' },
      { title: '寻找小伙伴', icon: UserFilled, path: '/user-center/buddies' },
      { title: '直系血缘视频', icon: VideoPlay, path: '/user-center/lineage-video' },
      { title: '我的工具箱', icon: Tools, path: '/user-center/toolbox' },
    ],
  },
  {
    title: '账户与服务',
    items: [
      { title: '个人资料', icon: User, path: '/user-center/profile' },
      { title: '我的家族', icon: OfficeBuilding, path: '/user-center/families' },
      { title: '家庭关系', icon: Connection, path: '/user-center/family-relation' },
      { title: '我的验证', icon: CircleCheck, path: '/user-center/verify' },
      { title: '我的订单', icon: List, path: '/user-center/orders' },
      { title: '设置', icon: Setting, path: '/user-center/settings' },
    ],
  },
]

const stats = computed(
  () => [
    { label: '上传照片', value: profile.value?.stats?.photo_count ?? 0 },
    { label: '照片标注', value: profile.value?.stats?.annotation_count ?? 0 },
    { label: '印刷订单', value: profile.value?.stats?.order_count ?? 0 },
    { label: '加入小组', value: profile.value?.stats?.group_count ?? 0 },
  ],
)

function go(path: string) {
  router.push(path)
}

function goAdminDashboard() {
  const slug = primaryClan.value?.slug
  if (slug) {
    router.push(`/zupu/${slug}`)
  } else {
    router.push('/select-family')
  }
}

onMounted(async () => {
  // 兜底：若布局尚未加载资料（如直接刷新到本页），补拉一次
  if (!userStore.profile) {
    await userStore.fetchProfile()
  }
})
</script>

<template>
  <div class="home-page">
    <!-- 欢迎卡 -->
    <div class="welcome-card">
      <div class="welcome-main">
        <div
          class="welcome-avatar"
          :style="avatarUrl ? { backgroundImage: `url(${avatarUrl})` } : undefined"
        >
          <ElIcon v-if="!avatarUrl" :size="40" color="#fff"><UserFilled /></ElIcon>
        </div>
        <div class="welcome-meta">
          <div class="welcome-hello">您好，{{ displayName }}</div>
          <div class="welcome-sub">
            <span class="welcome-clan" :title="clanName">{{ clanName }}</span>
            <ElTag
              v-if="primaryClan"
              :type="roleTagType"
              size="small"
              effect="light"
            >
              {{ roleLabel }}
            </ElTag>
          </div>
        </div>
        <div v-if="userStore.isFamilyAdmin" class="welcome-actions">
          <ElButton type="primary" plain @click="goAdminDashboard">
            <ElIcon><Management /></ElIcon>
            <span>家族管理后台</span>
          </ElButton>
        </div>
      </div>
      <div class="welcome-stats">
        <div v-for="s in stats" :key="s.label" class="welcome-stat">
          <div class="stat-num">{{ s.value }}</div>
          <div class="stat-label">{{ s.label }}</div>
        </div>
      </div>
    </div>

    <!-- 族谱浏览：树谱 / 册谱 直接入口 -->
    <section class="section">
      <h3 class="section-title">族谱浏览</h3>
      <div v-if="clanKey" class="genealogy-grid">
        <div
          v-for="g in genealogyLinks"
          :key="g.title"
          class="genealogy-card"
          @click="go(g.path)"
        >
          <div
            class="genealogy-icon"
            :style="{ background: `linear-gradient(135deg, ${g.accent}, #A1887F)` }"
          >
            <ElIcon :size="32" color="#fff"><component :is="g.icon" /></ElIcon>
          </div>
          <div class="genealogy-info">
            <div class="genealogy-title">{{ g.title }}</div>
            <div class="genealogy-desc">{{ g.desc }}</div>
          </div>
          <ElIcon class="genealogy-arrow" :size="18" color="#C0C4CC">
            <Right />
          </ElIcon>
        </div>
      </div>
      <div v-else class="no-clan-card">
        <div class="no-clan-icon">
          <ElIcon :size="28" color="#C9A96E"><OfficeBuilding /></ElIcon>
        </div>
        <div class="no-clan-text">
          您尚未加入任何家族，加入后可查看树谱与册谱
        </div>
        <ElButton type="primary" @click="go('/clans')">去浏览家族</ElButton>
      </div>
    </section>

    <!-- 快捷功能：分类归拢 -->
    <section class="section">
      <h3 class="section-title">快捷功能</h3>
      <div v-for="group in quickGroups" :key="group.title" class="quick-group">
        <div class="quick-group-title">{{ group.title }}</div>
        <div class="quick-grid">
          <div
            v-for="item in group.items"
            :key="item.path"
            class="quick-card"
            @click="go(item.path)"
          >
            <ElIcon :size="18" class="quick-icon"><component :is="item.icon" /></ElIcon>
            <span class="quick-label">{{ item.title }}</span>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.home-page {
  max-width: 1100px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* ---------- 欢迎卡 ---------- */
.welcome-card {
  background: linear-gradient(135deg, #5d4037 0%, #795548 100%);
  border-radius: 16px;
  padding: 24px 28px;
  color: #fff;
  box-shadow: 0 8px 24px rgba(93, 64, 55, 0.18);
}

.welcome-main {
  display: flex;
  align-items: center;
  gap: 16px;
}

.welcome-avatar {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.22);
  background-size: cover;
  background-position: center;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border: 2px solid rgba(255, 255, 255, 0.35);
}

.welcome-meta {
  flex: 1;
  min-width: 0;
}

.welcome-hello {
  font-size: 20px;
  font-weight: 600;
}

.welcome-sub {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
}

.welcome-clan {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.85);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 220px;
}

.welcome-actions :deep(.el-button) {
  --el-button-text-color: #fff;
  --el-button-border-color: rgba(255, 255, 255, 0.6);
  --el-button-hover-text-color: #fff;
  --el-button-hover-border-color: #fff;
  --el-button-hover-bg-color: rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.45);
  color: #fff;
}

.welcome-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 12px;
  margin-top: 20px;
  padding-top: 18px;
  border-top: 1px solid rgba(255, 255, 255, 0.18);
}

.welcome-stat {
  text-align: center;
}

.stat-num {
  font-size: 24px;
  font-weight: 700;
}

.stat-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.75);
  margin-top: 2px;
}

/* ---------- 区块 ---------- */
.section-title {
  margin: 0 0 14px 0;
  font-size: 16px;
  color: #303133;
  display: flex;
  align-items: center;
  gap: 8px;
}

.section-title::before {
  content: '';
  width: 4px;
  height: 16px;
  border-radius: 2px;
  background: #c9a96e;
}

/* ---------- 树谱 / 册谱 ---------- */
.genealogy-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
}

.genealogy-card {
  display: flex;
  align-items: center;
  gap: 16px;
  background: #fff;
  border: 1px solid #ebeef5;
  border-radius: 14px;
  padding: 20px;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}

.genealogy-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 10px 28px rgba(93, 64, 55, 0.12);
  border-color: #c9a96e;
}

.genealogy-icon {
  width: 64px;
  height: 64px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.genealogy-info {
  flex: 1;
  min-width: 0;
}

.genealogy-title {
  font-size: 18px;
  font-weight: 600;
  color: #303133;
}

.genealogy-desc {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

.genealogy-arrow {
  flex-shrink: 0;
  transition: transform 0.2s ease;
}

.genealogy-card:hover .genealogy-arrow {
  transform: translateX(4px);
}

.no-clan-card {
  background: #fff;
  border: 1px dashed #d7ccc8;
  border-radius: 14px;
  padding: 32px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  text-align: center;
}

.no-clan-icon {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: rgba(201, 169, 110, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
}

.no-clan-text {
  font-size: 14px;
  color: #606266;
}

/* ---------- 快捷功能 ---------- */
.quick-group {
  margin-bottom: 16px;
}

.quick-group-title {
  font-size: 13px;
  color: #909399;
  margin-bottom: 10px;
  padding-left: 2px;
}

.quick-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
}

.quick-card {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #fff;
  border: 1px solid #ebeef5;
  border-radius: 10px;
  padding: 14px 16px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.quick-card:hover {
  border-color: #c9a96e;
  background: rgba(201, 169, 110, 0.06);
  transform: translateY(-1px);
}

.quick-icon {
  color: #5d4037;
  flex-shrink: 0;
}

.quick-label {
  font-size: 13px;
  color: #303133;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ---------- 移动端 ---------- */
@media (max-width: 768px) {
  .home-page {
    gap: 18px;
  }
  .welcome-card {
    padding: 20px;
  }
  .welcome-actions {
    display: none;
  }
  .welcome-stats {
    grid-template-columns: repeat(2, 1fr);
  }
  .genealogy-grid {
    grid-template-columns: 1fr;
  }
  .quick-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
