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
        左侧世代流水标签列（M4）：纵向排列 1..N 世，hover/active 状态高亮。
        - 绝对定位叠在画布左缘，不挤压画布可用区
        - 总代际数 = treeRef.getTotalGenerations()，随 graphChangeVersion 变化重算
        - 点击某代际 → 在该代际 y 最小节点上调用 focusNode（与右下角滑块口径一致）
      -->
      <div
        v-if="generationSlots.length > 0"
        class="tree-gen-rail"
        :class="{ 'rail--hidden': showDetail, 'rail--absolute': hasViewportSnapshot }"
      >
        <div class="rail__title">世代</div>
        <div class="rail__list">
          <button
            v-for="g in generationSlots"
            :key="g.gen"
            type="button"
            class="rail__item"
            :class="{
              'rail__item--active': activeGen === g.gen,
              'rail__item--offscreen': !g.inViewport,
            }"
            :style="g.screenY != null ? { top: g.screenY + 'px' } : undefined"
            :title="`第 ${g.gen} 世 · ${g.count} 人`"
            @click="focusGeneration(g.gen)"
          >
            <span class="rail__num">{{ g.gen }}</span>
            <span class="rail__sep" aria-hidden="true" />
            <span class="rail__hint">世</span>
          </button>
        </div>
      </div>

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
              <!-- [树↔册谱联动 2026-08-17] 跳转册谱并定位该人物世录 -->
              <el-button @click="jumpToCepu" :icon="Tickets" size="large">
                查看册谱
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

    <!-- 人物编辑抽屉：编辑信息/添加亲属/删除人员 -->
    <PersonEditDrawer
      v-if="editTarget"
      :person-id="editTarget.id"
      :person="editTarget.node"
      :can-edit="canEdit"
      @close="closeEditDrawer"
      @updated="onPersonUpdated"
      @navigate="onPersonNavigate"
      @create-marriage="onCreateMarriage"
      @mutated="onPersonMutated"
    />

    <!-- 添加亲属对话框 -->
    <el-dialog
      v-model="addRelativeDialogVisible"
      title="添加亲属"
      width="520px"
      :close-on-click-modal="false"
    >
      <el-form
        ref="addRelativeFormRef"
        :model="addRelativeForm"
        :rules="addRelativeRules"
        label-width="100px"
      >
        <el-form-item label="关系" prop="relation">
          <el-select
            v-model="addRelativeForm.relation"
            placeholder="请选择关系类型"
            style="width: 100%;"
          >
            <el-option label="父亲" value="father" />
            <el-option label="母亲" value="mother" />
            <el-option label="配偶" value="spouse" />
            <el-option label="儿子" value="son" />
            <el-option label="女儿" value="daughter" />
            <el-option label="兄弟" value="brother" />
            <el-option label="姐妹" value="sister" />
          </el-select>
        </el-form-item>
        <el-form-item label="姓名" prop="full_name">
          <el-input
            v-model="addRelativeForm.full_name"
            placeholder="新亲属姓名"
            maxlength="50"
            show-word-limit
          />
        </el-form-item>
        <el-form-item label="性别" prop="gender">
          <el-radio-group v-model="addRelativeForm.gender">
            <el-radio value="male">男</el-radio>
            <el-radio value="female">女</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="出生日期">
          <el-date-picker
            v-model="addRelativeForm.birth_date"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="可选"
            style="width: 100%;"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="addRelativeDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="addRelativeSubmitting"
          @click="submitAddRelative"
        >
          保存
        </el-button>
      </template>
    </el-dialog>

    <!-- 影像预览：复用组件库 ImagePreview（Teleport 到 body） -->
    <ImagePreview
      v-model="mediaPreviewVisible"
      :src="mediaPreviewSrc"
      :name="mediaPreviewName"
    />

    <!-- 三代亲属高亮状态提示 -->
    <transition name="el-fade-in">
      <div v-if="highlightActive" class="family-circle-banner">
        <el-icon><User /></el-icon>
        <span>已高亮上下三代共 {{ highlightCount }} 位亲属</span>
        <el-button size="small" text @click="clearFamilyCircleHighlight">清除高亮</el-button>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch, nextTick } from 'vue';
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
  Tickets,
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
import { treeApi } from '@/api/tree';
import type { MediaArchive } from '@/types';
import TreeMinimap from '@/components/TreeMinimap.vue';
import TreeGenerationSlider from '@/components/TreeGenerationSlider.vue';
import PersonEditDrawer from '@/components/PersonEditDrawer.vue';
import ImagePreview from '@/components/ImagePreview.vue';
import type { FormInstance, FormRules } from 'element-plus';

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

// =========== 人物编辑 / 添加亲属 / 删除 / 预览 / 高亮 状态 ===========

/** 打开 PersonEditDrawer 的目标人物；null 表示关闭抽屉 */
const editTarget = ref<{ id: string; node: any } | null>(null);
/** 是否允许编辑。MVP 默认不开放，家族 OWNER/ADMIN 可见 TBD。安全原则：默认拒绝。 */
const canEdit = ref(true);

/** 添加亲属表单状态 */
const addRelativeDialogVisible = ref(false);
const addRelativeSubmitting = ref(false);
const addRelativeFormRef = ref<FormInstance | null>(null);
const addRelativeForm = ref({
  relation: '' as 'father' | 'mother' | 'spouse' | 'son' | 'daughter' | 'brother' | 'sister' | '',
  full_name: '',
  gender: 'male' as 'male' | 'female',
  birth_date: '' as string,
});
const addRelativeRules: FormRules = {
  relation: [{ required: true, message: '请选择关系类型', trigger: 'change' }],
  full_name: [
    { required: true, message: '请输入姓名', trigger: 'blur' },
    { min: 1, max: 50, message: '姓名长度 1-50 字符', trigger: 'blur' },
  ],
  gender: [{ required: true, message: '请选择性别', trigger: 'change' }],
};

/** 媒体预览状态（复用 ImagePreview） */
const mediaPreviewVisible = ref(false);
const mediaPreviewSrc = ref('');
const mediaPreviewName = ref('');

/** 三代亲属高亮状态 */
const highlightActive = ref(false);
const highlightCount = ref(0);
const highlightNodeIds = ref<Set<string>>(new Set());

// =========== 左侧世代 rail（M4）==========

/** 当前聚焦的代际（1-based；null = 未选中） */
const activeGen = ref<number | null>(null);

/** 单个世代 rail item 的高度（像素）；用于越界判断 */
const RAIL_ITEM_HEIGHT = 40;

/**
 * 代际索引：从 genealogyStore.treeData 做 DFS 算出每节点的 generation（深度+1），
 * 然后按代际聚合计数 + 记录每个代际的首个节点 id（用于点击聚焦）。
 *
 * 与 GenealogyTree.getTotalGenerations 口径一致（根节点为第 1 代）。
 * 响应 genealogyStore.treeData 变化。
 */
interface GenerationEntry {
  gen: number;
  count: number;
  /** 该代际首个节点 id（DFS 前序；用于点击聚焦的退化方案） */
  firstNodeId: string | null;
  /**
   * 相对画布容器顶部的像素 y。由 generationSlots 在 snapshot 基础上算出。
   * - 值为 number 时：动态定位该 item 的 top
   * - 值为 null 时：snapshot 尚未就绪，template 退化为默认间距定位
   */
  screenY: number | null;
  /** 屏幕 y 是否在画布可视区（用于淡出越界世代） */
  inViewport: boolean;
}

/**
 * 兜底代际索引：仅在 G6 snapshot 尚未就绪时使用，避免初次渲染浮窗空白。
 * - 仍基于 genealogyStore.treeData DFS，与老 generationIndex 等价
 */
function computeFallbackIndex(): GenerationEntry[] {
  const tree = genealogyStore.treeData as any;
  if (!tree) return [];
  const buckets = new Map<number, { count: number; firstNodeId: string | null }>();
  const visit = (node: any, depth: number) => {
    if (!node) return;
    const gen = depth + 1; // 根 = 第 1 世
    const cur = buckets.get(gen);
    if (!cur) {
      buckets.set(gen, { count: 1, firstNodeId: String(node.id) });
    } else {
      cur.count++;
    }
    if (Array.isArray(node.children)) {
      for (const c of node.children) visit(c, depth + 1);
    }
  };
  visit(tree, 0);
  const arr: GenerationEntry[] = [];
  const maxGen = Math.max(...buckets.keys());
  for (let g = 1; g <= maxGen; g++) {
    const b = buckets.get(g);
    arr.push({
      gen: g,
      count: b?.count ?? 0,
      firstNodeId: b?.firstNodeId ?? null,
      screenY: null,
      inViewport: true,
    });
  }
  return arr;
}

/**
 * 世代浮窗渲染列表（M4+：跟随画布）。
 *
 * 数据流：
 * 1. 读 treeRef.graphChangeVersion（ref.value）触发响应式；
 * 2. 调 treeRef.getMinimapSnapshot() 拉取当前节点 + viewport 快照；
 * 3. 按 n.gen 分组聚合，每代际取画布 y 最小值（与 focusGeneration 选代表节点口径一致）；
 * 4. 用 G6 v5 视口变换 `screenY = (canvasY - cy) * zoom + vh/2` 换算成画布容器像素 y；
 * 5. 越界 item 标记 inViewport=false（template 加 rail__item--offscreen 淡化）。
 *
 * 兜底：snapshot 为空时退回 DFS 索引（screenY=null → 默认 flex 流式布局）。
 */
const generationSlots = computed<GenerationEntry[]>(() => {
  // 显式读取 graphChangeVersion 的 .value，使本 computed 能响应画布变更。
  const tree = treeRef.value as any;
  const version = tree?.graphChangeVersion?.value ?? 0;
  void version; // 仅用于依赖追踪

  const snap = typeof tree?.getMinimapSnapshot === 'function'
    ? tree.getMinimapSnapshot()
    : null;

  // 快照为空（画布尚未就绪）→ 兜底
  if (!snap || !Array.isArray(snap.nodes) || snap.nodes.length === 0) {
    return computeFallbackIndex();
  }

  const { cy, zoom, vh } = snap.viewport;
  // 防御性：zoom 为 0 时按 1 处理（极端边缘情况）
  const safeZoom = zoom && Number.isFinite(zoom) ? zoom : 1;

  // 按 gen 分组，聚合该代际节点的画布 y（取最小值 → 与 focusGeneration 代表节点同源）
  const buckets = new Map<number, { count: number; minCanvasY: number; firstNodeId: string | null }>();
  for (const n of snap.nodes as Array<{ id: string; y: number; gen?: number }>) {
    // 配偶节点 generation=-1 → 跳过，不参与浮窗定位
    const gen = typeof n.gen === 'number' && n.gen >= 0 ? n.gen + 1 : null;
    if (gen == null) continue;
    const cur = buckets.get(gen);
    if (!cur) {
      buckets.set(gen, { count: 1, minCanvasY: n.y, firstNodeId: n.id });
    } else {
      cur.count++;
      if (n.y < cur.minCanvasY) {
        cur.minCanvasY = n.y;
        cur.firstNodeId = n.id;
      }
    }
  }

  if (buckets.size === 0) return computeFallbackIndex();

  const arr: GenerationEntry[] = [];
  const maxGen = Math.max(...buckets.keys());
  for (let g = 1; g <= maxGen; g++) {
    const b = buckets.get(g);
    if (!b) {
      // 缺失代际：仍占位（与旧行为一致），但 screenY = null → flex 流式布局
      arr.push({ gen: g, count: 0, firstNodeId: null, screenY: null, inViewport: true });
      continue;
    }
    // G6 v5 视口变换：screenY = (canvasY - cy) * zoom + vh/2
    const screenY = (b.minCanvasY - cy) * safeZoom + vh / 2;
    const inViewport = screenY > -RAIL_ITEM_HEIGHT && screenY < vh + RAIL_ITEM_HEIGHT;
    arr.push({
      gen: g,
      count: b.count,
      firstNodeId: b.firstNodeId,
      screenY,
      inViewport,
    });
  }
  return arr;
});

/**
 * 是否已从画布拿到 viewport 快照。
 * - 为 true 时浮窗使用 absolute 定位（世代跟随画布）
 * - 为 false 时退回到默认 flex 流式布局（依次排列）
 * 模板中根据该值给 .tree-gen-rail 追加 `rail--absolute` 类，CSS 才启用 absolute 样式。
 */
const hasViewportSnapshot = computed<boolean>(() => {
  const tree = treeRef.value as any;
  const version = tree?.graphChangeVersion?.value ?? 0;
  void version;
  if (typeof tree?.getMinimapSnapshot !== 'function') return false;
  const snap = tree.getMinimapSnapshot();
  return !!(snap && Array.isArray(snap.nodes) && snap.nodes.length > 0);
});

/**
 * 聚焦某代际：复用 TreeGenerationSlider 同口径（取该代际 y 最小节点 → focusNode）
 * - 优先用 getMinimapSnapshot 计算 y 最小节点（与右下角滑块一致）
 * - 退化用 generationIndex 中预存的 firstNodeId
 * - 都拿不到 → ElMessage 提示
 */
function focusGeneration(gen: number) {
  const tree = treeRef.value as any;
  if (!tree) {
    ElMessage.info('画布尚未就绪');
    return;
  }
  activeGen.value = gen;
  // [世代浮窗跟随画布 2026-08-20] 优先用 generationSlots 中预存的代表节点 id
  // （已在 computed 中按画布 y 最小值挑出，避免重复扫描 snapshot）。
  const slot = generationSlots.value.find((e) => e.gen === gen);
  let targetId: string | null = slot?.firstNodeId ?? null;
  // 退化路径：snapshot 尚未就绪或该代际无代表节点时，再读一次实时快照算一次
  if (!targetId) {
    const snap = typeof tree.getMinimapSnapshot === 'function' ? tree.getMinimapSnapshot() : null;
    if (snap && Array.isArray(snap.nodes) && snap.nodes.length) {
      const ys = snap.nodes.map((n: any) => n.y).sort((a: number, b: number) => a - b);
      const minY = ys[0];
      const maxY = ys[ys.length - 1];
      const totalGen = Math.max(1, generationSlots.value.length);
      const range = Math.max(1, maxY - minY);
      const targetY = minY + (gen - 0.5) * (range / totalGen);
      let bestDist = Infinity;
      for (const n of snap.nodes) {
        const d = Math.abs(n.y - targetY);
        if (d < bestDist) {
          bestDist = d;
          targetId = n.id;
        }
      }
    }
  }
  if (!targetId) {
    // 最后退化：从 DFS 兑底索引里取首个节点 id
    const fallback = computeFallbackIndex().find((e) => e.gen === gen);
    targetId = fallback?.firstNodeId ?? null;
  }
  if (targetId && typeof tree.focusNode === 'function') {
    tree.focusNode(targetId);
  } else {
    ElMessage.info(`第 ${gen} 世暂无节点`);
  }
}

/** 选中节点时清掉 rail 的 active 高亮，避免误导 */
watch(
  () => genealogyStore.selectedNode,
  (node) => {
    if (node) activeGen.value = null;
  },
);

// Get initial letter of name
function getInitial(name: string) {
  return name ? name.charAt(0) : '?';
}

// Format year from date string
function formatYear(dateStr: string) {
  return new Date(dateStr).getFullYear().toString();
}

// View media in dialog — 复用 ImagePreview 组件
function viewMedia(media: MediaArchive) {
  if (!media?.file_url) {
    ElMessage.warning('该影像暂无可访问的 URL');
    return;
  }
  mediaPreviewSrc.value = media.file_url;
  mediaPreviewName.value =
    (media as any).description || (media as any).file_name || '影像';
  mediaPreviewVisible.value = true;
}

// Fetch related media
async function fetchRelatedMedia(personId: number) {
  try {
    const response = await mediaApi.getByPersonId(personId);
    relatedMedia.value = response;
  } catch (error) {
    console.error('Failed to fetch related media:', error);
    relatedMedia.value = [];
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
      // 关闭详情时同时清理高亮与抽屉，避免遗留状态
      clearFamilyCircleHighlight();
      if (editTarget.value) closeEditDrawer();
    }
  },
);

// 监听 GenealogyTree 画布变更后驱动 Minimap 和 GenerationSlider 增量刷新
// [世代浮窗跟随画布 2026-08-20] 修正 getter：必须读 .value。
// 旧写法 `() => treeRef.value?.graphChangeVersion` 拿到的值是 ref 对象本身，
// 引用不会变化，watch 实际不生效。改为读 ref.value 后才能响应 afterrender / aftertransform。
watch(
  () => (treeRef.value as any)?.graphChangeVersion?.value,
  () => {
    minimapRef.value?.refreshSnapshot?.();
  },
);

function closeDetail() {
  genealogyStore.selectNode(null);
  // 同步清理 orchestrator 的辅助视图状态，避免详情面板关闭后「主动模式」残留
  layout.closeAux();
  clearFamilyCircleHighlight();
  if (editTarget.value) closeEditDrawer();
}

// Focus on main lineage in the genealogy tree
function focusMainLineage() {
  treeRef.value?.focusMainLineage?.();
}

// =========== 三代亲属高亮：基于当前图数据计算上下三代并高亮 ===========

/**
 * 在 genealogyStore.treeData 上遍历，收集选中节点上下 3 代内所有亲属的 id。
 * - 上三代：父 / 父的父 / 父的母 / 母 / 母的父 / 母的母
 * - 下三代：子 / 子的子 / 子的女 / 女 / 女的子 / 女的女
 * - 旁系平辈：同父、同母的兄弟姊妹（本算法只按 BFS 深度限制取 3 代）
 * - 通过 genealogyStore.setTreeData 已将 node 标 flatten 为 children 数组
 */
function collectFamilyCircleIds(rootId: string | number, maxDepth = 3): Set<string> {
  const ids = new Set<string>();
  const target = String(rootId);
  const tree = genealogyStore.treeData;
  if (!tree) return ids;

  // 先建立 id -> node 映射
  const byId = new Map<string, any>();
  const visit = (n: any) => {
    if (!n) return;
    byId.set(String(n.id), n);
    if (Array.isArray(n.children)) n.children.forEach(visit);
  };
  visit(tree);

  // 向上：父 / 母（BFS 向上，最多 maxDepth）
  const queue: Array<{ id: string; depth: number }> = [{ id: target, depth: 0 }];
  const seen = new Set<string>([target]);
  ids.add(target);
  while (queue.length) {
    const { id, depth } = queue.shift()!;
    if (depth >= maxDepth) continue;
    const node = byId.get(id);
    if (!node) continue;
    // 父/母
    const parents: any[] = (node.parents as any[]) || [];
    for (const p of parents) {
      const pid = String(p.id ?? p);
      if (!seen.has(pid)) {
        seen.add(pid);
        ids.add(pid);
        queue.push({ id: pid, depth: depth + 1 });
      }
    }
    // 配偶（同辈，不增加深度）
    const spouses: any[] = (node.spouses as any[]) || [];
    for (const s of spouses) {
      const sid = String(s.id ?? s);
      if (!seen.has(sid)) {
        seen.add(sid);
        ids.add(sid);
      }
    }
    // 子
    const children: any[] = (node.children as any[]) || [];
    for (const c of children) {
      const cid = String(c.id);
      if (!seen.has(cid)) {
        seen.add(cid);
        ids.add(cid);
        queue.push({ id: cid, depth: depth + 1 });
      }
    }
  }
  return ids;
}

/**
 * 触发高亮：写入 G6 节点状态样式，并在 GenealogyTree 暴露的 setHighlight 上调用
 * - 这里采用「直接操作 genealogyStore.selectedNode 周边标记 + 调用 treeRef.setHighlight」
 *   的方式，因为 GenealogyTree 已经定义了 highlightNodeIds ref。
 */
function highlightFamilyCircle() {
  if (!genealogyStore.selectedNode) {
    ElMessage.warning('请先选中一位人物');
    return;
  }
  const ids = collectFamilyCircleIds(genealogyStore.selectedNode.id, 3);
  if (ids.size === 0) {
    ElMessage.info('当前树数据中未找到上下三代亲属');
    return;
  }
  highlightNodeIds.value = ids;
  highlightCount.value = ids.size;
  highlightActive.value = true;
  // 推送到 GenealogyTree：依赖其内部 highlightNodeIds（已在 defineExpose 不暴露但通过事件桥接）。
  // 这里直接通过 props 触发不现实，因此让 GenealogyTree 监听 highlightNodeIds（见后文）。
  // 临时方案：调用 setHighlight 方法（若 GenealogyTree 已暴露）
  const tree = treeRef.value as any;
  if (tree && typeof tree.setHighlight === 'function') {
    tree.setHighlight(Array.from(ids));
  } else if (tree && typeof tree.focusNode === 'function') {
    // 退化：聚焦到选中节点，让用户从选中位置查看
    tree.focusNode(String(genealogyStore.selectedNode.id));
  }
  ElMessage.success(`已高亮 ${ids.size} 位亲属，请查看画布`);
}

function clearFamilyCircleHighlight() {
  highlightNodeIds.value = new Set();
  highlightCount.value = 0;
  highlightActive.value = false;
  const tree = treeRef.value as any;
  if (tree && typeof tree.setHighlight === 'function') {
    tree.setHighlight([]);
  }
}

// =========== 编辑 / 添加 / 删除人物 ===========

/** 打开编辑抽屉（顶部编辑按钮、详情面板中编辑按钮、节点双击） */
function editPerson() {
  const node = genealogyStore.selectedNode;
  if (!node) {
    ElMessage.warning('请先选中一位人物');
    return;
  }
  editTarget.value = { id: String(node.id), node };
}

function closeEditDrawer() {
  editTarget.value = null;
}

function onPersonUpdated(person: any) {
  // 更新 store 中的选中节点，使详情面板与画布同步
  if (person) genealogyStore.selectNode(person);
  // 触发画布增量刷新（如果 GenealogyTree 暴露了 refresh）
  treeRef.value?.refresh?.();
  closeEditDrawer();
  ElMessage.success('已保存');
}

function onPersonNavigate(personId: string | number) {
  // 抽屉中点击父母/配偶/子女时，跳转并高亮
  const tree = treeRef.value as any;
  if (tree && typeof tree.focusNode === 'function') {
    tree.focusNode(String(personId));
  }
  // 同时选中该节点（更新 store）
  const node = (genealogyStore.treeData as any)?.children
    ? findNodeById(genealogyStore.treeData, String(personId))
    : null;
  if (node) genealogyStore.selectNode(node);
}

/** [树↔册谱联动 2026-08-17] 树谱 → 册谱：跳转并定位该人物世录条目 */
function jumpToCepu() {
  const node = genealogyStore.selectedNode;
  if (!node) {
    ElMessage.warning('请先选中一位人物');
    return;
  }
  const clanId = route.params.clanId as string;
  router.push({ path: `/cepu/${clanId}`, query: { person: String(node.id) } });
}

/** [树↔册谱联动 2026-08-17] 册谱 → 树谱：?focus=personId 高亮并居中该节点 */
watch(
  () => route.query.focus,
  (focus) => {
    if (!focus) return;
    nextTick(() => {
      onPersonNavigate(String(focus));
      // 闪烁高亮 2 秒（复用三代亲属高亮通道）
      const tree = treeRef.value as any;
      if (tree && typeof tree.setHighlight === 'function') {
        tree.setHighlight([String(focus)]);
        setTimeout(() => tree.setHighlight([]), 2000);
      }
    });
  },
);

function onCreateMarriage(_withPersonId: string | number) {
  ElMessage.info('请在画布中选择另一个人物后，编辑其详情创建婚姻');
}

function onPersonMutated() {
  // 人物或婚姻被删除后，刷新画布与详情
  treeRef.value?.refresh?.();
  fetchRelatedMedia(Number(genealogyStore.selectedNode?.id || 0));
}

function findNodeById(root: any, id: string): any | null {
  if (!root) return null;
  if (String(root.id) === id) return root;
  if (Array.isArray(root.children)) {
    for (const c of root.children) {
      const found = findNodeById(c, id);
      if (found) return found;
    }
  }
  return null;
}

/** 打开添加亲属对话框 */
function addRelative() {
  if (!genealogyStore.selectedNode) {
    ElMessage.warning('请先选中一位人物');
    return;
  }
  addRelativeForm.value = {
    relation: '',
    full_name: '',
    gender: 'male',
    birth_date: '',
  };
  addRelativeDialogVisible.value = true;
}

/**
 * 提交添加亲属：
 * - 父亲/母亲：创建新人物后 PATCH /api/tree/person/{parentId}，把 parent_id 指向选中人物
 * - 配偶：通过 /api/tree/marriage 创建一个 FamilyUnit（双方均已在树中）
 * - 儿子/女儿：创建新人物，parent_id 指向选中人物
 * - 兄弟/姐妹：创建新人物，parent_id 指向选中人物的父
 */
async function submitAddRelative() {
  if (!addRelativeFormRef.value) return;
  const valid = await addRelativeFormRef.value.validate().catch(() => false);
  if (!valid) return;
  const selected = genealogyStore.selectedNode;
  if (!selected) return;
  const relation = addRelativeForm.value.relation;
  const newName = addRelativeForm.value.full_name.trim();
  const newGender = addRelativeForm.value.gender;
  const newBirth = addRelativeForm.value.birth_date || undefined;
  const targetClanId = clanId.value || String((selected as any).clan_id || '');

  addRelativeSubmitting.value = true;
  try {
    if (relation === 'spouse') {
      // 1) 先创建新人物
      const created = (await treeApi.createPerson({
        clan_id: targetClanId,
        full_name: newName,
        gender: newGender,
        birth_date: newBirth,
        is_living: true,
      })) as any;
      const newId = String(created?.id || created?.data?.id);
      if (!newId) throw new Error('创建人物失败：未返回 id');
      // 2) 创建婚姻
      let husbandId: string;
      let wifeId: string;
      if ((selected as any).gender === 'male') {
        husbandId = String(selected.id);
        wifeId = newId;
      } else {
        husbandId = newId;
        wifeId = String(selected.id);
      }
      await treeApi.createMarriage({
        clan_id: targetClanId,
        husband_id: husbandId,
        wife_id: wifeId,
        is_current: true,
      });
      ElMessage.success('已添加配偶');
    } else if (relation === 'father' || relation === 'mother') {
      // 新建一个父/母，性别根据关系推断或使用表单值
      const parentGender: 'male' | 'female' =
        relation === 'father' ? 'male' : 'female';
      // 如果用户输入与关系冲突，以关系为准
      if (newGender !== parentGender) {
        ElMessage.warning(`已将性别按关系调整为${parentGender === 'male' ? '男' : '女'}`);
      }
      const created = (await treeApi.createPerson({
        clan_id: targetClanId,
        full_name: newName,
        gender: parentGender,
        birth_date: newBirth,
        is_living: false,
      })) as any;
      const parentId = String(created?.id || created?.data?.id);
      if (!parentId) throw new Error('创建父/母失败：未返回 id');
      // 选中人物的父亲/母亲字段：当前 tree/person PATCH 支持 parents
      await (treeApi as any).updatePerson?.(String(selected.id), {
        parents: [parentId],
      });
      ElMessage.success('已添加父/母');
    } else if (relation === 'son' || relation === 'daughter') {
      const childGender: 'male' | 'female' =
        relation === 'son' ? 'male' : 'female';
      if (newGender !== childGender) {
        ElMessage.warning(`已将性别按关系调整为${childGender === 'male' ? '男' : '女'}`);
      }
      await treeApi.createPerson({
        clan_id: targetClanId,
        full_name: newName,
        gender: childGender,
        birth_date: newBirth,
        is_living: true,
        parent_id: String(selected.id),
      });
      ElMessage.success('已添加子女');
    } else {
      // 兄弟/姐妹：先找选中人物的父，没有父则提示先添加父亲
      const father: any = ((selected as any).parents || []).find(
        (p: any) => (p.gender || '') === 'male',
      );
      if (!father) {
        ElMessage.warning('请先为当前人物添加父亲，再添加兄弟/姐妹');
        return;
      }
      const siblingGender: 'male' | 'female' =
        relation === 'brother' ? 'male' : 'female';
      if (newGender !== siblingGender) {
        ElMessage.warning(`已将性别按关系调整为${siblingGender === 'male' ? '男' : '女'}`);
      }
      await treeApi.createPerson({
        clan_id: targetClanId,
        full_name: newName,
        gender: siblingGender,
        birth_date: newBirth,
        is_living: true,
        parent_id: String(father.id),
      });
      ElMessage.success('已添加兄弟/姐妹');
    }
    addRelativeDialogVisible.value = false;
    treeRef.value?.refresh?.();
  } catch (err: any) {
    const msg = err?.response?.data?.message || err?.message || '添加亲属失败';
    ElMessage.error(msg);
  } finally {
    addRelativeSubmitting.value = false;
  }
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
  const node = genealogyStore.selectedNode;
  if (!node) return;
  try {
    await ElMessageBox.confirm(
      `确定要删除"${(node as any).full_name || node.label || ''}"吗？此操作不可恢复！`,
      '删除确认',
      {
        confirmButtonText: '确定删除',
        cancelButtonText: '取消',
        type: 'warning',
      },
    );
  } catch {
    return;
  }
  // 走真实 API：使用 treeApi.deletePerson 软删除
  const personId = String(node.id);
  try {
    await treeApi.deletePerson(personId);
    ElMessage.success('删除成功');
    genealogyStore.selectNode(null);
    treeRef.value?.refresh?.();
  } catch (err: any) {
    const msg =
      err?.response?.data?.message || err?.message || '删除失败，请稍后重试';
    ElMessage.error(msg);
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

/* ================================================================
 * 左侧世代流水标签列（M4：tree-gen-rail）
 * - 绝对定位叠在画布左缘，不挤压画布可用区
 * - 纵向列表，1-based 代际号 + 计数
 * - z-index 取 15：低于画布 toolbar（z-toolbar=30），避免遮挡 G6 节点交互
 * - 与现有 z-index 表保持一致（区间 10-29 留给画布内辅助视图）
 * ================================================================ */
.tree-gen-rail {
  position: absolute;
  top: 60px; /* 48 navbar + 12 gap */
  left: 12px;
  bottom: 80px; /* 给 minimap/slider 让出底部 */
  width: 72px;
  z-index: 15;
  display: flex;
  flex-direction: column;
  background: rgba(255, 252, 248, 0.94);
  border: 1px solid rgba(201, 169, 110, 0.28);
  border-radius: 10px;
  box-shadow: 0 2px 10px rgba(93, 64, 55, 0.08);
  backdrop-filter: blur(8px);
  overflow: hidden;
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.tree-gen-rail.rail--hidden {
  opacity: 0;
  pointer-events: none;
  transform: translateX(-8px);
}

.rail__title {
  padding: 8px 0 6px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 4px;
  color: #8D6E63;
  text-align: center;
  background: linear-gradient(180deg, rgba(201, 169, 110, 0.12), transparent);
  border-bottom: 1px solid rgba(201, 169, 110, 0.18);
  flex-shrink: 0;
}

.rail__list {
  flex: 1;
  /* [世代浮窗跟随画布 2026-08-20] 给 absolute 定位的 item 提供定位基准。
   * - 默认仍可滚动（snapshot 未就绪时保留滚动浏览能力）
   * - 在 .rail--absolute 模式下改为 overflow:hidden + mask-image 柔和越界项 */
  position: relative;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 4px 0;
  /* 自定义滚动条：与画布色调一致 */
  scrollbar-width: thin;
  scrollbar-color: rgba(201, 169, 110, 0.35) transparent;
}
.rail__list::-webkit-scrollbar {
  width: 4px;
}
.rail__list::-webkit-scrollbar-thumb {
  background: rgba(201, 169, 110, 0.35);
  border-radius: 2px;
}
.rail__list::-webkit-scrollbar-track {
  background: transparent;
}

/* [世代浮窗跟随画布 2026-08-20] 画布 snapshot 就绪后启用 absolute 定位：
 * - 隐藏滚动条（不要用户手动滚动代替画布平移）
 * - 顶部底部加 mask-image 渐变，让越出可见区的世代 item 柔和消失
 * - 【关键】用负 top/bottom 抵消父 .tree-gen-rail 的 absolute 偏移（top:60 / bottom:80），
 *   让 .rail__list 的 y 范围与 G6 viewport 一致（navbar 下方 48 ~ 100vh），
 *   这样 item 的 top = screenY 可直接与 G6 画布节点对齐 */
.tree-gen-rail.rail--absolute .rail__list {
  position: absolute;
  top: -60px;
  left: 0;
  right: 0;
  bottom: -80px;
  overflow: hidden;
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.tree-gen-rail.rail--absolute .rail__list::-webkit-scrollbar {
  display: none;
}
.tree-gen-rail.rail--absolute .rail__list {
  /* 上下各 32px 柔和渐隐区域（对应 RAIL_ITEM_HEIGHT 附近） */
  -webkit-mask-image: linear-gradient(
    to bottom,
    transparent 0,
    #000 32px,
    #000 calc(100% - 32px),
    transparent 100%
  );
  mask-image: linear-gradient(
    to bottom,
    transparent 0,
    #000 32px,
    #000 calc(100% - 32px),
    transparent 100%
  );
}

.rail__item {
  appearance: none;
  background: transparent;
  border: none;
  width: 100%;
  padding: 6px 0;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 2px;
  cursor: pointer;
  font-family: inherit;
  color: #5D4037;
  position: relative;
  transition: background 0.15s ease, color 0.15s ease,
    /* [世代浮窗跟随画布 2026-08-20] 画布平移/缩放时 item top 变化，加 0.18s 补间动画，
     * 让世代标签轻微跟随画布动作，避免生硬跳跃 */
    top 0.18s ease, opacity 0.2s ease;
}
/* [世代浮窗跟随画布 2026-08-20] absolute 模式下：item 以 top 动态定位、垂直居中 */
.tree-gen-rail.rail--absolute .rail__item {
  position: absolute;
  left: 50%;
  width: calc(100% - 8px);
  transform: translate(-50%, -50%);
}
.rail__item:hover {
  background: rgba(201, 169, 110, 0.10);
}
/* [世代浮窗跟随画布 2026-08-20] absolute 模式下 active 高亮条需重新定位，
 * 覆盖上面默认的 top:6px bottom:6px（依赖父容器全高） */
.tree-gen-rail.rail--absolute .rail__item--active {
  background: linear-gradient(90deg, rgba(201, 169, 110, 0.22), rgba(201, 169, 110, 0.06));
  box-shadow: 0 0 0 1px rgba(201, 169, 110, 0.4);
}
.rail__item--active {
  background: linear-gradient(90deg, rgba(201, 169, 110, 0.18), rgba(201, 169, 110, 0.05));
}
.rail__item--active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 6px;
  bottom: 6px;
  width: 3px;
  background: #C9A96E;
  border-radius: 0 2px 2px 0;
}
/* [世代浮窗跟随画布 2026-08-20] absolute 模式下，item 本身已脱离 flex 流式父，
 * ::before 的 top/bottom 高度需要按内容自适应：改成 inset 自动撑满 item 高度 */
.tree-gen-rail.rail--absolute .rail__item--active::before {
  top: 4px;
  bottom: 4px;
}

/* [世代浮窗跟随画布 2026-08-20] 越界项：不接收点击，透明度降低但仍占位（与画布节点可见性对应） */
.rail__item--offscreen {
  opacity: 0.22;
  pointer-events: none;
  filter: grayscale(0.4);
}

.rail__num {
  font-size: 16px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: #5D4037;
  line-height: 1;
}
.rail__item--active .rail__num {
  color: #C9A96E;
}

.rail__sep {
  width: 1px;
  height: 12px;
  background: rgba(201, 169, 110, 0.35);
}

.rail__hint {
  font-size: 11px;
  color: #8D6E63;
  letter-spacing: 1px;
  line-height: 1;
}
.rail__item--active .rail__hint {
  color: #C9A96E;
  font-weight: 600;
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

/* 三代亲属高亮提示 banner */
.family-circle-banner {
  position: fixed;
  top: 64px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: linear-gradient(135deg, #FFF3C4 0%, #FFE082 100%);
  color: #5D4037;
  border-radius: 999px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  z-index: var(--z-tooltip, 60);
  font-size: 14px;
  font-weight: 500;
  border: 1px solid rgba(201, 169, 110, 0.3);
}

.family-circle-banner .el-icon {
  color: #C9A96E;
  font-size: 16px;
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
  /* [M4] 左侧世代 rail 宽度压缩（代际滑块在此断点已隐藏，让位给 rail） */
  .tree-gen-rail {
    width: 60px;
  }
}

@media (max-width: 1024px) {
  .tree-page :deep(.tree-minimap) {
    display: none !important;
  }
  .detail-panel {
    width: 320px;
  }
  /* [M4] 进一步压缩 */
  .tree-gen-rail {
    width: 52px;
    top: 56px;
  }
  .rail__num {
    font-size: 14px;
  }
  .rail__hint {
    font-size: 10px;
  }
  /* [世代浮窗跟随画布 2026-08-20] 1024px 断点 .tree-gen-rail top 改为 56，
   * .rail__list 的 negative top 同步调为 -56，保持与 G6 viewport 对齐 */
  .tree-gen-rail.rail--absolute .rail__list {
    top: -56px;
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

  /* [M4] 移动端：详情面板为底部抽屉，rail 转为顶部横向 mini 条
   * - 宽度撑满，高度压为单行；纵向列表改为水平滚动
   * - 保留全部代际入口，不与 navbar 争高（仅在 navbar 下方贴边）
   */
  .tree-gen-rail {
    width: auto;
    max-width: calc(100% - 24px);
    top: 56px;
    bottom: auto;
    left: 12px;
    right: 12px;
    flex-direction: row;
    height: 36px;
  }
  /* [世代浮窗跟随画布 2026-08-20] 移动端：横向 mini 条不需要 absolute 定位，
   * 重置 .rail__list 为 static 并去掉负偏移，恢复正常 flex 流式布局 */
  .tree-gen-rail.rail--absolute .rail__list {
    position: static;
    top: auto;
    bottom: auto;
    left: auto;
    right: auto;
    overflow-x: auto;
    overflow-y: hidden;
  }
  .tree-gen-rail.rail--absolute .rail__item {
    position: static;
    width: auto;
    transform: none;
  }
  .rail__title {
    padding: 0 8px;
    border-bottom: none;
    border-right: 1px solid rgba(201, 169, 110, 0.18);
    background: transparent;
    display: flex;
    align-items: center;
    letter-spacing: 2px;
  }
  .rail__list {
    flex-direction: row;
    padding: 0 4px;
    gap: 0;
  }
  .rail__item {
    flex-direction: row;
    padding: 4px 8px;
    gap: 4px;
    width: auto;
  }
  .rail__item--active::before {
    left: 4px;
    right: 4px;
    top: auto;
    bottom: 0;
    width: auto;
    height: 2px;
  }
  .rail__num {
    font-size: 13px;
  }
  .rail__hint {
    font-size: 10px;
  }
  .rail__sep {
    width: 1px;
    height: 10px;
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

  /* [M4] 超窄屏：rail 进一步压缩字号 */
  .rail__title {
    font-size: 11px;
  }
  .rail__num {
    font-size: 12px;
  }
  .rail__hint {
    font-size: 9px;
  }
}
</style>
