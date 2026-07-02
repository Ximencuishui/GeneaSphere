<template>
  <div class="tree-page">
    <!-- Top: Navigation Bar (fixed; always visible) -->
    <div class="tree-navbar">
      <div class="navbar-left">
        <el-tooltip content="返回上一页" placement="bottom">
          <el-button :icon="ArrowLeft" circle size="small" @click="goBack" />
        </el-tooltip>
        <el-tooltip content="返回首页" placement="bottom">
          <el-button :icon="HomeFilled" circle size="small" @click="goHome" />
        </el-tooltip>
        <el-divider direction="vertical" />
        <div class="navbar-title">
          <el-icon class="title-icon"><Connection /></el-icon>
          <span class="title-text">{{ pageTitle }}</span>
        </div>
      </div>
      <div class="navbar-right">
        <div v-if="genealogyStore.mainLineage.length" class="lineage-chip">
          <el-icon><Connection /></el-icon>
          <span>传承路径 {{ genealogyStore.mainLineage.length }}代</span>
        </div>
        <el-button size="small" @click="focusMainLineage" :icon="Connection" plain>
          聚焦传承
        </el-button>
        <el-button size="small" @click="highlightFamilyCircle" :icon="User" plain>
          三代亲属
        </el-button>
      </div>
    </div>

    <!-- Left: Tree Canvas -->
    <div class="tree-canvas-container">
      <!--
        GenealogyTree 是重组件，内部依赖 @antv/g6。
        使用 defineAsyncComponent 懒加载，避免 TreePage 的 chunk 在
        GenealogyTree（以及间接的 vendor-antv）加载完成前无法执行。
        这里额外提供一个紧凑的占位，避免异步加载期间页面白屏。
      -->
      <Suspense>
        <template #default>
          <GenealogyTree ref="treeRef" :clanId="clanId" />
        </template>
        <template #fallback>
          <div class="tree-async-fallback">
            <div class="fallback-spinner" />
            <p class="fallback-text">正在准备族谱编辑器…</p>
          </div>
        </template>
      </Suspense>

      <!-- 鸟瞰图（M2）：折凨态位于右下角，hover 1s 展开 -->
      <!-- 模板里 `treeRef` 会被 Vue 自动 unwrap，访问 ref.value 已 unwrap 的 undefined.value 会抛错；
           因此这里直接用 `treeRef?.xxx`，optional chaining 兑底 undefined。 -->
      <TreeMinimap
        ref="minimapRef"
        :position="minimapPos"
        :size="minimapSizeRef"
        :get-snapshot="() => treeRef?.getMinimapSnapshot?.() ?? null"
        :on-pan-to="(x: number, y: number) => treeRef?.panTo?.(x, y)"
      />

      <!-- 代际滑块（M3）：位于右下角，hover 浮出，详情面板打开时互斥隐藏 -->
      <TreeGenerationSlider
        :visibility="sliderVis"
        :total-generations="treeRef?.getTotalGenerations?.() ?? 1"
        :get-snapshot="() => treeRef?.getMinimapSnapshot?.() ?? null"
        :on-focus-node="(id: string) => treeRef?.focusNode?.(id)"
      />
    </div>

    <!-- Right: Detail Panel -->
    <transition name="slide-fade">
      <div v-if="showDetail" class="detail-panel">
        <div v-if="!genealogyStore.selectedNode" class="empty-detail">
          <el-empty description="点击节点查看详情" :image-size="120">
            <template #image>
              <el-icon :size="80" color="#C9A96E"><User /></el-icon>
            </template>
          </el-empty>
        </div>

        <div v-else class="detail-content">
          <!-- Person Header with Warm Gradient -->
          <div class="person-header" :class="{ 'is-deceased': !genealogyStore.selectedNode.is_living }">
            <div class="header-bg"></div>
            <div class="person-avatar-wrapper">
              <el-avatar :size="90" class="person-avatar" v-if="!genealogyStore.selectedNode.thumbnail_url">
                {{ getInitial(genealogyStore.selectedNode.full_name || '') }}
              </el-avatar>
              <el-avatar :size="90" class="person-avatar has-photo" v-else :src="genealogyStore.selectedNode.thumbnail_url" />
            </div>
            <h3 class="person-name">{{ genealogyStore.selectedNode.full_name || genealogyStore.selectedNode.label }}</h3>
            <div class="person-meta">
              <el-tag 
                :type="genealogyStore.selectedNode.gender === 'male' ? '' : 'danger'"
                size="large"
                effect="dark"
              >
                <el-icon><Male v-if="genealogyStore.selectedNode.gender === 'male'" /><Female v-else /></el-icon>
                {{ genealogyStore.selectedNode.gender === 'male' ? '男' : '女' }}
              </el-tag>
              <div class="lifespan" v-if="genealogyStore.selectedNode.birth_date">
                <el-icon><Calendar /></el-icon>
                <span>{{ formatYear(genealogyStore.selectedNode.birth_date) }}</span>
                <span v-if="genealogyStore.selectedNode.death_date"> - {{ formatYear(genealogyStore.selectedNode.death_date) }}</span>
                <span v-else-if="!genealogyStore.selectedNode.is_living"> - 已故</span>
              </div>
            </div>
          </div>

          <!-- Person Info Cards -->
          <div class="person-info-section">
            <h4 class="section-title">
              <el-icon><InfoFilled /></el-icon>
              基本信息
            </h4>
            <div class="info-cards">
              <div class="info-card">
                <div class="card-icon" style="background: #E3F2FD; color: #1976D2;">
                  <el-icon><Postcard /></el-icon>
                </div>
                <div class="card-content">
                  <div class="card-label">ID</div>
                  <div class="card-value">{{ genealogyStore.selectedNode.id }}</div>
                </div>
              </div>
              <div class="info-card">
                <div class="card-icon" :style="{ background: genealogyStore.selectedNode.is_living ? '#E8F5E9' : '#F5F5F5', color: genealogyStore.selectedNode.is_living ? '#4CAF50' : '#9E9E9E' }">
                  <el-icon><CircleCheckFilled v-if="genealogyStore.selectedNode.is_living" /><CircleCloseFilled v-else /></el-icon>
                </div>
                <div class="card-content">
                  <div class="card-label">在世状态</div>
                  <div class="card-value">
                    <el-tag 
                      :type="genealogyStore.selectedNode.is_living ? 'success' : 'info'" 
                      size="small"
                      effect="light"
                    >
                      {{ genealogyStore.selectedNode.is_living ? '在世' : '已故' }}
                    </el-tag>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Actions -->
          <div class="person-actions">
            <h4 class="section-title">
              <el-icon><Operation /></el-icon>
              操作
            </h4>
            <div class="action-buttons">
              <el-button type="primary" @click="editPerson" :icon="Edit" size="large">
                编辑信息
              </el-button>
              <el-button @click="addRelative" :icon="Plus" size="large">
                添加亲属
              </el-button>
              <el-button @click="generateVideo" :icon="VideoCamera" size="large">
                生成历史音像墙
              </el-button>
              <el-button @click="generateLineageVideo" :icon="VideoPlay" size="large">
                生成直系血缘视频
              </el-button>
              <el-button type="danger" @click="deletePerson" :icon="Delete" size="large" plain>
                删除人员
              </el-button>
            </div>
          </div>

          <!-- Related Media -->
          <div class="related-media">
            <h4 class="section-title">
              <el-icon><Picture /></el-icon>
              相关影像
            </h4>
            <div v-if="relatedMedia.length > 0" class="media-grid">
              <div 
                v-for="media in relatedMedia" 
                :key="media.id" 
                class="media-thumbnail"
                @click="viewMedia(media)"
              >
                <img :src="media.file_url" :alt="media.description" />
                <div class="media-overlay">
                  <el-icon :size="24"><ZoomIn /></el-icon>
                </div>
              </div>
            </div>
            <el-empty v-else :image-size="80" description="暂无相关影像" />
          </div>
        </div>

        <!-- Close Button -->
        <div class="panel-header-actions">
          <el-button
            class="close-panel-btn"
            :icon="Close"
            circle
            size="default"
            @click="closeDetail"
            title="关闭详情面板"
          />
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import { defineAsyncComponent } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  Edit,
  Plus,
  Delete,
  Close,
  User,
  Male,
  Female,
  Calendar,
  InfoFilled,
  Postcard,
  CircleCheckFilled,
  CircleCloseFilled,
  Operation,
  Picture,
  ZoomIn,
  VideoCamera,
  VideoPlay,
  Connection,
  ArrowLeft,
  HomeFilled,
} from '@element-plus/icons-vue';
// 异步加载 GenealogyTree 组件（含 @antv/g6 1MB+ 重库）：
// 避免在 TreePage chunk 解析时阻塞整条静态依赖链。
const GenealogyTree = defineAsyncComponent(
  () => import('@/components/GenealogyTree.vue'),
);
import { useGenealogyStore } from '@/stores/genealogy';
import { useTreeLayoutOrchestrator } from '@/composables/useTreeLayoutOrchestrator';
import { mediaApi } from '@/api/media';
import type { MediaArchive } from '@/types';
import TreeMinimap from '@/components/TreeMinimap.vue';
import TreeGenerationSlider from '@/components/TreeGenerationSlider.vue';

const route = useRoute();
const router = useRouter();
const genealogyStore = useGenealogyStore();
/**
 * 布局中央调度器（子文档《族谱树三视图布局优化 v1.1》§5）
 * - 提供 derived layout state（minimapPosition / minimapSize / sliderVisibility）
 * - 提供用户主动控制入口（showMinimap / showSlider / closeAux）
 * - 当前页面只调用了 layout.closeAux()；minimapPosition / sliderVisibility 将在 M2/M3
 *   创建 TreeMinimap.vue / TreeGenerationSlider.vue 后作为 props 传入
 */
const layout = useTreeLayoutOrchestrator();
const treeRef = ref();
const minimapRef = ref();
/**
 * 给 TreeMinimap 的两个响应式代理：模板里需要「值」而不是 ComputedRef，
 * computed 内部直接 .value 读取，避免模板侧 TS 把 ref 误判为对象。
 */
const minimapPos = computed(() => layout.minimapPosition.value);
const minimapSizeRef = computed(() => layout.minimapSize.value);
const sliderVis = computed(() => layout.sliderVisibility.value);
// 详情面板默认收起：避免 420px 详情面板在小屏下挤压树画布；
// 选节点时再展开（已由 watch 逻辑负责）
const showDetail = ref(false);
const relatedMedia = ref<MediaArchive[]>([]);

const clanId = computed(() => route.params.clanId as string);

/**
 * 顶部导航栏标题：优先展示本地缓存的家族名，其次回退到"家族族谱"
 * - 避免每次进入页面都要拉取家族元信息（/api/clans/:id）
 * - 缓存来源：LoginView 一键体验后会写入 localStorage['demo_clan_name']
 *   或 admin 进入后台时的 store（待后续接入）
 */
const pageTitle = computed(() => {
  const cached = localStorage.getItem('demo_clan_name');
  return cached ? `${cached} · 族谱树` : '族谱全景';
});

/** 返回上一页：能退则退，不能退则回首页 */
function goBack() {
  if (window.history.length > 1) {
    router.back();
  } else {
    router.push('/');
  }
}

/** 返回首页（营销首页 LandingPage） */
function goHome() {
  router.push('/');
}

// Get initial letter of name
function getInitial(name: string) {
  return name ? name.charAt(0) : '?';
}

// Format year from date string
function formatYear(dateStr: string) {
  return new Date(dateStr).getFullYear().toString();
}

// View media in dialog
function viewMedia(_media: MediaArchive) {
  ElMessage.info('查看影像功能开发中');
}

// Fetch related media
async function fetchRelatedMedia(personId: number) {
  try {
    const response = await mediaApi.getByPersonId(personId);
    relatedMedia.value = response;
  } catch (error) {
    console.error('Failed to fetch related media:', error);
  }
}

// Watch for selected node changes
watch(
  () => genealogyStore.selectedNode,
  (node) => {
    if (node) {
      showDetail.value = true;
      const personId = typeof node.id === 'string' ? parseInt(node.id) : node.id;
      fetchRelatedMedia(personId);
    } else {
      showDetail.value = false;
    }
  },
);

// 监听 GenealogyTree 画布变更后驱动 Minimap 和 GenerationSlider 增量刷新
watch(
  () => (treeRef.value as any)?.graphChangeVersion,
  () => {
    minimapRef.value?.refreshSnapshot?.();
  },
);

function closeDetail() {
  genealogyStore.selectNode(null);
  // 同步清理 orchestrator 的辅助视图状态，避免详情面板关闭后「主动模式」残留
  layout.closeAux();
}

// Focus on main lineage in the genealogy tree
function focusMainLineage() {
  treeRef.value?.focusMainLineage?.();
}

// Highlight family circle (3 generations)
function highlightFamilyCircle() {
  if (!genealogyStore.selectedNode) return
  ElMessage.info('三代亲属高亮功能开发中')
}

function editPerson() {
  ElMessage.info('编辑功能开发中');
}

function addRelative() {
  ElMessage.info('添加亲属功能开发中');
}

function generateVideo() {
  if (!genealogyStore.selectedNode) return;
  const personId = genealogyStore.selectedNode.id;
  // 跳转到视频创建页，并预填目标人物
  window.location.href = `/user-center/videos/create?personId=${personId}`;
}

function generateLineageVideo() {
  if (!genealogyStore.selectedNode) return;
  const personId = genealogyStore.selectedNode.id;
  // 跳转到直系血缘视频设置页
  window.location.href = `/user-center/lineage-video?personId=${personId}`;
}

async function deletePerson() {
  if (!genealogyStore.selectedNode) return;

  try {
    await ElMessageBox.confirm(
      `确定要删除"${genealogyStore.selectedNode.full_name}"吗？此操作不可恢复！`,
      '删除确认',
      {
        confirmButtonText: '确定删除',
        cancelButtonText: '取消',
        type: 'warning',
      },
    );

    // Call API to delete
    ElMessage.success('删除成功');
    genealogyStore.selectNode(null);
    treeRef.value?.refresh();
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error.message || '删除失败');
    }
  }
}

onMounted(() => {
  // Initialize
});
</script>

<style scoped>
/* ================================================================
 *  z-index 集中变量（子文档《族谱树三视图布局优化 v1.1》§4 修正 4）
 *  - 区间说明：
 *    - 50+ ：导航与全局浮层
 *    - 30-49：详情面板 / 编辑抽屉（覆盖画布，但低于导航）
 *    - 10-29：画布内辅助视图（工具栏 / 鸟瞰 / 滑块 / tooltip）
 *  - 后续在新加浮层时一律从本表选 z-index，不要另写魔法数字
 * ================================================================ */
.tree-page {
  --z-nav: 50;        /* 顶部导航 */
  --z-toolbar: 30;    /* 画布工具栏（GenealogyTree 内部） */
  --z-detail: 35;     /* 详情面板（侧栏，与画布分离，不争夺树互斥语义） */
  --z-slider: 20;     /* 代际滑块 */
  --z-minimap: 25;    /* 鸟瞰图 */
  --z-tooltip: 60;    /* 节点 tooltip（最高） */
  --z-progress: 40;   /* 加载进度条 */
  --z-drawer: 45;     /* 侧边编辑抽屉 */
}

.tree-page {
  display: flex;
  /* 用 vh 兜底：#app 可能为 0；显式 100vh 避免画布高度坍缩为 0 导致 G6 0×0 初始化 */
  height: 100vh;
  min-height: 100vh;
  position: relative;
  background: #FAF8F5;
}

.tree-canvas-container {
  flex: 1;
  /* 给绝对定位的 navbar 让出顶部空间，避免画布被遮挡 */
  padding-top: 48px;
  overflow: hidden;
  /* 显式占位高度，避免祖先 #app / .app-main 没有 height 时本容器坍缩为 0 */
  min-height: 0;
  position: relative;
}

/* 异步加载 GenealogyTree 期间的紧凑占位：避免 vendor-antv 慢加载时整页白屏 */
.tree-async-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: linear-gradient(135deg, #FAF8F5 0%, #F5F0E8 100%);
  color: #5D4037;
}
.tree-async-fallback .fallback-spinner {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 3px solid rgba(201, 169, 110, 0.2);
  border-top-color: #C9A96E;
  animation: tree-async-spin 0.9s linear infinite;
}
.tree-async-fallback .fallback-text {
  margin: 0;
  font-size: 14px;
  color: #8D6E63;
  letter-spacing: 0.5px;
}
@keyframes tree-async-spin {
  to { transform: rotate(360deg); }
}

/* Navigation Bar - Fixed Top */
.tree-navbar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 48px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 16px;
  background: rgba(255, 255, 255, 0.98);
  border-bottom: 1px solid rgba(201, 169, 110, 0.25);
  backdrop-filter: blur(12px);
  z-index: 50;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  flex-shrink: 0;
}

.navbar-left,
.navbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.navbar-title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: 4px;
  font-weight: 600;
  color: var(--color-text-primary, #2C3E50);
  font-size: 14px;
}

.navbar-title .title-icon {
  color: var(--color-accent, #C9A96E);
  font-size: 16px;
}

.navbar-title .title-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 320px;
}

.lineage-chip {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  color: var(--color-accent, #C9A96E);
  background: rgba(201, 169, 110, 0.1);
  border: 1px solid rgba(201, 169, 110, 0.25);
}

.lineage-chip .el-icon {
  font-size: 13px;
}

.navbar-actions {
  display: flex;
  gap: 8px;
}

/* Deceased person header - warm golden glow */
.person-header.is-deceased {
  background: linear-gradient(135deg, #5D4037 0%, #8D6E63 100%);
}

.person-header.is-deceased .person-avatar {
  border-color: #C9A96E;
  box-shadow: 0 0 0 3px rgba(201, 169, 110, 0.3), 0 4px 12px rgba(0, 0, 0, 0.2);
}

/* Detail Panel with Enhanced Styling */
.detail-panel {
  width: 420px;
  background: var(--color-bg-primary);
  border-left: 2px solid rgba(201, 169, 110, 0.3);
  overflow-y: auto;
  position: relative;
  box-shadow: -4px 0 20px rgba(0, 0, 0, 0.08);
}

/* Slide Fade Transition */
.slide-fade-enter-active {
  transition: all 0.3s ease-out;
}

.slide-fade-leave-active {
  transition: all 0.2s ease-in;
}

.slide-fade-enter-from {
  transform: translateX(100%);
  opacity: 0;
}

.slide-fade-leave-to {
  transform: translateX(100%);
  opacity: 0;
}

.empty-detail {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
  padding: 40px;
}

.detail-content {
  padding: 0;
}

/* Person Header with Gradient */
.person-header {
  position: relative;
  text-align: center;
  padding: 40px 24px 32px;
  background: linear-gradient(135deg, #5D4037 0%, #8D6E63 100%);
  color: white;
  overflow: hidden;
}

.header-bg {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-image: 
    radial-gradient(circle at 20% 50%, rgba(255, 255, 255, 0.1) 0%, transparent 50%),
    radial-gradient(circle at 80% 80%, rgba(255, 255, 255, 0.05) 0%, transparent 50%);
  pointer-events: none;
}

.person-avatar {
  position: relative;
  z-index: 1;
  background: white;
  color: #5D4037;
  font-size: 36px;
  font-weight: 600;
  margin-bottom: 16px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  border: 3px solid rgba(255, 255, 255, 0.3);
}

.person-name {
  position: relative;
  z-index: 1;
  font-size: 24px;
  font-weight: 700;
  color: white;
  margin: 0 0 12px 0;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.person-meta {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: center;
  font-size: 14px;
}

.person-meta .el-tag {
  padding: 8px 16px;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.lifespan {
  display: flex;
  align-items: center;
  gap: 6px;
  color: rgba(255, 255, 255, 0.9);
  font-weight: 500;
}

/* Info Section */
.person-info-section {
  padding: 24px;
  border-bottom: 1px solid var(--color-border);
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 16px 0;
}

.section-title .el-icon {
  color: var(--color-accent);
}

.info-cards {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.info-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: var(--color-bg-secondary);
  border-radius: 8px;
  border: 1px solid var(--color-border);
  transition: all 0.2s ease;
}

.info-card:hover {
  background: var(--color-bg-tertiary);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.card-icon {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  flex-shrink: 0;
}

.card-content {
  flex: 1;
}

.card-label {
  color: var(--color-text-muted);
  font-size: 12px;
  margin-bottom: 4px;
}

.card-value {
  color: var(--color-text-primary);
  font-size: 16px;
  font-weight: 500;
}

/* Actions Section */
.person-actions {
  padding: 24px;
  border-bottom: 1px solid var(--color-border);
}

.action-buttons {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.action-buttons .el-button {
  width: 100%;
  justify-content: center;
}

/* Related Media Section */
.related-media {
  padding: 24px;
}

.media-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.media-thumbnail {
  position: relative;
  aspect-ratio: 1;
  overflow: hidden;
  border-radius: 8px;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  transition: all 0.2s ease;
}

.media-thumbnail:hover {
  transform: translateY(-4px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
}

.media-thumbnail img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s ease;
}

.media-thumbnail:hover img {
  transform: scale(1.1);
}

.media-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s ease;
  color: white;
}

.media-thumbnail:hover .media-overlay {
  opacity: 1;
}

/* Panel Header Actions */
.panel-header-actions {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 10;
}

.close-panel-btn {
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(201, 169, 110, 0.3);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  transition: all 0.2s ease;
}

.close-panel-btn:hover {
  background: rgba(255, 255, 255, 1);
  border-color: #C9A96E;
  transform: scale(1.05);
}

/* Responsive Design */
/* 子文档《族谱树三视图布局优化 v1.1》§4 修正 5 响应式断点表
 * - 1200px 断点：代际滑块隐藏，详情面板变 360px
 * - 1024px 断点：鸟瞰图隐藏，详情面板变 320px（避免两个辅助视图同时存在）
 * - 768px 断点：详情面板改为底部抽屉（鸟瞰/代际已隐藏）
 * - 480px 断点：进一步压缩
 */
@media (max-width: 1200px) {
  .tree-page :deep(.tree-gen-slider) {
    display: none !important;
  }
  .detail-panel {
    width: 360px;
  }
}

@media (max-width: 1024px) {
  .tree-page :deep(.tree-minimap) {
    display: none !important;
  }
  .detail-panel {
    width: 320px;
  }
}

@media (max-width: 768px) {
  .tree-page {
    flex-direction: column;
    height: 100vh;
  }
  
  .tree-canvas-container {
    flex: 1;
    min-height: 40vh;
  }
  
  .detail-panel {
    width: 100%;
    max-height: 60vh;
    border-left: none;
    border-top: 2px solid rgba(201, 169, 110, 0.3);
    position: relative;
  }
  
  .panel-header-actions {
    top: 12px;
    right: 12px;
  }
  
  .close-panel-btn {
    width: 36px;
    height: 36px;
  }
  
  .media-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  
  .person-header {
    padding: 32px 16px 24px;
  }
  
  .person-avatar {
    width: 70px !important;
    height: 70px !important;
    font-size: 28px !important;
  }
  
  .person-name {
    font-size: 20px;
  }
  
  .person-info-section,
  .person-actions,
  .related-media {
    padding: 16px;
  }
  
  .action-buttons .el-button {
    padding: 10px 16px;
    font-size: 13px;
  }
}

@media (max-width: 480px) {
  .media-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }
  
  .person-meta {
    flex-direction: row;
    flex-wrap: wrap;
    justify-content: center;
  }
  
  .action-buttons .el-button {
    padding: 8px 12px;
    font-size: 12px;
  }
}
</style>
