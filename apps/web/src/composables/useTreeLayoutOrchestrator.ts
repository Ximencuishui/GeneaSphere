import { ref, computed, watch } from 'vue';
import { useGenealogyStore } from '@/stores/genealogy';

/**
 * 族谱树布局中央调度 composable
 *
 * 背景（子文档《族谱树三视图布局优化 v1.1》§5）：
 * v1.0 阶段三个新组件（鸟瞰图 / 代际滑块 / 风格皮肤）各自维护状态，会出现
 * 「详情面板打开时鸟瞰图没动」「滑块与详情面板同时显示」等问题。本 composable
 * 提供单一可信源（selectedNode + 三个用户主动控制位），集中计算派生布局状态。
 *
 * 设计简化点（与子文档 §5.1 差异）：
 * - 不引入 `PanelState` 抽象，因为详情面板状态由 TreePage 自己的 `showDetail`
 *   ref 维护，这里只读 `selectedNode` 即可判断「详情面板是否处于开启意图」
 * - 鸟瞰图 / 滑块各自维护 hover / 折叠 UI 状态，orchestrator 只控制外部传入的
 *   position / size / visibility，避免组件内部状态被外部入侵
 *
 * 互斥规则（子文档 §5.3 互斥关系矩阵）：
 * - selectedNode 非空 → minimapPosition = top-right + 缩小尺寸；sliderVisibility = hidden
 * - 用户主动点鸟瞰 / 代际按钮 → 详情面板被关闭（如有）→ 进入对应模式
 *
 * 接入点（子文档 §5.2）：
 * - TreePage.vue：<script setup> 顶部 `const layout = useTreeLayoutOrchestrator()`，
 *   把 layout.minimapPosition / layout.sliderVisibility 传给对应子组件
 * - TreeMinimap.vue：通过 defineProps 接收 position / size 决定样式 class
 * - TreeGenerationSlider.vue：通过 defineProps 接收 visibility 决定 v-show
 * - genealogy store 不需扩展
 */

export type MinimapPosition = 'bottom-right' | 'top-right' | 'hidden';
export type SliderVisibility = 'visible' | 'hidden';
export type ActiveMode = 'closed' | 'minimap' | 'slider';

export interface MinimapSize {
  w: number;
  h: number;
}

/** 鸟瞰图 / 滑块 默认尺寸常量（响应式断点会在 TreePage 媒体查询里覆盖） */
const DEFAULT_MINIMAP_SIZE: MinimapSize = { w: 200, h: 150 };
const NARROW_MINIMAP_SIZE: MinimapSize = { w: 160, h: 120 };

export function useTreeLayoutOrchestrator() {
  const genealogy = useGenealogyStore();

  /** 用户主动激活的辅助视图模式（详情面板不参与此状态——由 selectedNode 推导） */
  const activeMode = ref<ActiveMode>('closed');

  /** 详情面板是否处于「应当开启」的意图态（selectedNode 非空即意图开启） */
  const isDetailIntended = computed(() => genealogy.selectedNode != null);

  /**
   * 鸟瞰图位置：
   * - 详情面板开启 → 迁移到画布内部右上角（避免遮挡详情面板）
   * - 否则 → 默认右下角
   * - 用户主动 close → hidden（持久化到 localStorage）
   */
  const minimapPosition = computed<MinimapPosition>(() => {
    if (activeMode.value === 'closed' && isDetailIntended.value) return 'top-right';
    if (activeMode.value === 'minimap') return 'bottom-right';
    if (isDetailIntended.value) return 'top-right';
    return 'bottom-right';
  });

  /**
   * 代际滑块可见性：详情面板开启时隐藏（互斥）
   */
  const sliderVisibility = computed<SliderVisibility>(() => {
    return isDetailIntended.value ? 'hidden' : 'visible';
  });

  /**
   * 鸟瞰图尺寸：详情面板开启时缩小
   */
  const minimapSize = computed<MinimapSize>(() => {
    return isDetailIntended.value ? NARROW_MINIMAP_SIZE : DEFAULT_MINIMAP_SIZE;
  });

  /**
   * 用户主动点鸟瞰按钮：进入 minimap 模式
   * - 详情面板开启时拒绝（互斥）：让用户先关闭详情面板
   */
  function showMinimap(): boolean {
    if (isDetailIntended.value) return false;
    activeMode.value = 'minimap';
    return true;
  }

  /**
   * 用户主动点代际按钮：进入 slider 模式
   * - 详情面板开启时拒绝（互斥）
   */
  function showSlider(): boolean {
    if (isDetailIntended.value) return false;
    activeMode.value = 'slider';
    return true;
  }

  /**
   * 关闭辅助视图（用户点 × 或关闭详情面板）
   */
  function closeAux(): void {
    activeMode.value = 'closed';
  }

  /**
   * 当用户点选节点 / 取消选中时，自动让鸟瞰 / 滑块退出"用户主动"模式，
   * 因为详情面板一旦打开，鸟瞰会被迫迁移、滑块会被迫隐藏，"主动模式"
   * 已无意义。等到详情面板关闭后再恢复（默认 closed 状态）
   */
  watch(
    () => genealogy.selectedNode,
    (node) => {
      if (node) {
        // 详情面板意图开启：清掉用户主动模式，让 minimapPosition 计算式主导
        activeMode.value = 'closed';
      }
    },
  );

  return {
    activeMode,
    isDetailIntended,
    minimapPosition,
    minimapSize,
    sliderVisibility,
    showMinimap,
    showSlider,
    closeAux,
  };
}

export default useTreeLayoutOrchestrator;