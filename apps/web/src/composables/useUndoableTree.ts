import { h } from 'vue';
import { ElButton, ElMessage, ElMessageBox, ElNotification } from 'element-plus';
import { treeApi } from '@/api/tree';
import type { GenealogyNode } from '@/types';
import { onEntryEvicted, useUndoStack } from '@/composables/useUndoStack';

/**
 * 把族谱树写操作包成「可撤销」动作的统一门面。
 *
 * 设计目标：
 * 1. 调用方写业务逻辑不感知撤销栈——只需传入「正向 + 反向」两个回调
 * 2. 操作成功后立即弹「成功 + 撤销」toast，用户点撤销按钮才执行反向
 * 3. 反向操作失败时把条目弹回栈尾并提示，但不抛错到调用方
 *
 * 用法：
 *   await withUndo({
 *     label: '创建人物',
 *     do: async () => {
 *       const resp = await treeApi.createPerson(...);
 *       const newId = resp.data.id;
 *       return {
 *         undo: async () => { await treeApi.deletePerson(newId); },
 *         // redo 可选
 *       };
 *     },
 *   });
 *
 *   // 撤销移动子树（记得记下原 parent 与新 parent）：
 *   await withUndo({
 *     label: `移动子树 ${name} 到 ${newParentName}`,
 *     do: async () => {
 *       await treeApi.moveSubTree(subtreeRootId, newParentId);
 *       return {
 *         undo: async () => {
 *           await treeApi.moveSubTree(subtreeRootId, originalParentId);
 *         },
 *       };
 *     },
 *   });
 */

export interface WithUndoOptions {
  /** 操作描述（中文），UI 显示用 */
  label: string;
  /** 执行正向操作；返回 undo/redo 钩子 */
  do: () => Promise<{
    undo: () => Promise<void>;
    redo?: () => Promise<void>;
  }>;
  /**
   * 撤销后是否自动 reload 画布（默认 true）
   * - 创建/删除 人物：true（画布结构变化）
   * - 移动子树：true（节点父子关系变化）
   * - 编辑字段：false（store 已同步，无需刷新）
   */
  reloadOnUndo?: boolean;
  /** 重载函数：默认 reload 页面，可注入更细粒度的局部刷新 */
  reload?: () => void | Promise<void>;
}

const { pushUndo } = useUndoStack();

export async function withUndo(opts: WithUndoOptions): Promise<void> {
  try {
    const hooks = await opts.do();
    const id = pushUndo(opts.label, hooks.undo, hooks.redo);
    // ElMessage 是轻量 toast，仅用作即时反馈；
    // 真正的「取消」入口是 ElNotification 里的「撤销」按钮 / 5s 内的 Ctrl+Z。
    ElMessage({
      type: 'success',
      message: `${opts.label}成功`,
      duration: 2000,
      showClose: true,
    });
    bindUndoToast(id, opts);
  } catch (e: any) {
    const msg = e?.response?.data?.message || e?.message || String(e);
    ElMessage.error(`${opts.label}失败：${msg}`);
    throw e;
  }
}

/**
 * 弹一个带「撤销」按钮的 ElNotification。
 * - 点击撤销按钮 → 立即调用 undoLast()
 * - 5s 内按 Ctrl+Z / Cmd+Z → 同样调用 undoLast()
 * - 关闭通知 / 超时 → 不撤销，仅清除响应窗口
 *
 * 实现说明：ElNotification 不支持自定义 action 按钮，
 * 但其 message 字段接受 VNode / string，因此可用 h() 渲染一个 ElButton。
 *
 * 关键设计：全局 keydown 监听器只安装一次，不能捕获每次 withUndo 的 opts；
 * 因此用 entryOptsMap（id → opts）关联条目的撤销配置。
 * 触发撤销时从 stack 取最新条目 id，再从 map 取对应 opts。
 */
let lastUndoEntryId: string | null = null;
let lastUndoTime = 0;
const KEYDOWN_LISTENER_INSTALLED = '__undoKeydownInstalled__';
const UNDO_WINDOW_MS = 5000;
const UNDO_STYLE_ID = '__undoNotifyStyle__';

/** 关联栈条目 id → 完整撤销配置（reload / reloadOnUndo / label） */
const entryOptsMap = new Map<string, WithUndoOptions>();

/**
 * (P2-K) 订阅栈条目驱逐事件：
 * - 栈超长 FIFO 裁剪 / 主动 removeById / clear() 过期清理
 * - 都会触发 evict，同步清理 entryOptsMap 中对应条目，避免 map 内存泄漏
 *
 * 一次性模块级订阅；useUndoStack 是 SPA 内单例，evictHandlers 数组也是模块单例。
 */
onEntryEvicted((entry) => {
  entryOptsMap.delete(entry.id);
});

function getOptsForEntry(id: string | null): WithUndoOptions | undefined {
  if (!id) return undefined;
  return entryOptsMap.get(id);
}

/**
 * 注入一次全局样式（Element Plus 通知渲染在 body 下，scoped CSS 不可达）
 */
function injectUndoStyleOnce() {
  if (document.getElementById(UNDO_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = UNDO_STYLE_ID;
  style.textContent = `
    .undo-notify { display: flex; align-items: center; gap: 12px; }
    .undo-notify__label { color: #606266; font-size: 13px; }
    .undo-notify__btn { padding: 2px 6px; }
  `;
  document.head.appendChild(style);
}

function bindUndoToast(id: string, opts: WithUndoOptions) {
  // 关闭上一次的通知，避免连续操作时通知堆叠
  try {
    (ElNotification as any).closeAll?.();
  } catch {
    /* noop */
  }

  lastUndoEntryId = id;
  lastUndoTime = Date.now();
  entryOptsMap.set(id, opts);
  injectUndoStyleOnce();

  // 弹一个右下角的通知，带「撤销」按钮，点击触发 undoLast
  ElNotification({
    title: '操作成功',
    message: h('div', { class: 'undo-notify' }, [
      h('span', { class: 'undo-notify__label' }, `${opts.label}成功`),
      h(
        ElButton,
        {
          type: 'primary',
          size: 'small',
          link: true,
          class: 'undo-notify__btn',
          onClick: async () => {
            await triggerUndoFromStack();
          },
        },
        { default: () => '撤销 (Ctrl+Z)' },
      ),
    ]),
    type: 'success',
    duration: UNDO_WINDOW_MS / 1000,
    position: 'bottom-right',
    showClose: true,
  });

  // 全局 keydown 监听器只装一次；内部从 stack + map 取最新条目
  if ((window as any)[KEYDOWN_LISTENER_INSTALLED]) return;
  (window as any)[KEYDOWN_LISTENER_INSTALLED] = true;
  window.addEventListener('keydown', async (e) => {
    const isUndo = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey;
    if (!isUndo) return;
    if (!lastUndoEntryId || Date.now() - lastUndoTime > UNDO_WINDOW_MS) return;
    e.preventDefault();
    await triggerUndoFromStack();
  });
}

/**
 * 从栈顶弹出最新条目并执行其 undo。
 * 撤销完成后根据条目关联的 opts 决定是否 reload 画布。
 */
async function triggerUndoFromStack(): Promise<void> {
  const { undoLast, lastEntry } = useUndoStack();
  const entryId = lastEntry.value?.id ?? null;
  const opts = getOptsForEntry(entryId);
  if (!opts || !entryId) {
    // 条目已被清空（手动 clear 或 race），忽略
    lastUndoEntryId = null;
    return;
  }

  try {
    const ok = await undoLast();
    if (!ok) return;
    ElMessage.success(`已撤销：${opts.label}`);
    // 清理 opts map 中已消费条目，避免内存泄漏
    entryOptsMap.delete(entryId);
    if (opts.reloadOnUndo !== false) {
      const reload = opts.reload ?? (() => window.location.reload());
      await reload();
    }
  } catch (e: any) {
    const msg = e?.response?.data?.message || e?.message || String(e);
    ElMessage.error(`撤销失败：${msg}`);
    // undo 失败时 undoLast 内部已把条目弹回栈尾，opts 保留在 map
  }
  lastUndoEntryId = null;
}

/**
 * 高阶封装：包一层 treeApi.moveSubTree 并自带撤销支持
 * - 调用方提供 oldParentId / newParentId / subtreeRootId / 名字
 */
export async function moveSubTreeWithUndo(args: {
  subtreeRootId: string;
  oldParentId: string;
  newParentId: string;
  displayName: string;
  reload: () => void | Promise<void>;
}): Promise<void> {
  await withUndo({
    label: `移动子树「${args.displayName}」`,
    do: async () => {
      await treeApi.moveSubTree(args.subtreeRootId, args.newParentId);
      return {
        undo: async () => {
          await treeApi.moveSubTree(args.subtreeRootId, args.oldParentId);
        },
        redo: async () => {
          await treeApi.moveSubTree(args.subtreeRootId, args.newParentId);
        },
      };
    },
    reload: args.reload,
  });
}

/**
 * 高阶封装：包一层 treeApi.createPerson 并自带撤销
 *
 * 失败防护：
 *  - 后端响应体未包含 data.id（接口异常）时主动抛错，阻止把空 id 推入撤销栈，
 *    避免后续「撤销删除」用空 id 调用 deletePerson 把未鉴权的默认行删掉
 */
export async function createPersonWithUndo(args: {
  data: Parameters<typeof treeApi.createPerson>[0];
  reload: () => void | Promise<void>;
}): Promise<{ id: string }> {
  let createdId: string | null = null;
  await withUndo({
    label: `创建人物「${args.data.full_name}」`,
    do: async () => {
      const resp: any = await treeApi.createPerson(args.data);
      const extracted = String(resp?.data?.id ?? resp?.id ?? '');
      if (!extracted) {
        throw new Error('创建人物成功但响应缺少 id，无法注册撤销');
      }
      createdId = extracted;
      return {
        undo: async () => {
          if (createdId) await treeApi.deletePerson(createdId);
        },
      };
    },
    reload: args.reload,
  });
  return { id: createdId ?? '' };
}

/**
 * 高阶封装：包一层 treeApi.createMarriage 并自带撤销
 *
 * 失败防护：同 createPersonWithUndo，响应缺 id 时拒绝注册撤销。
 */
export async function createMarriageWithUndo(args: {
  data: Parameters<typeof treeApi.createMarriage>[0];
  displayName: string;
  reload: () => void | Promise<void>;
}): Promise<{ id: string }> {
  let createdId: string | null = null;
  await withUndo({
    label: `创建婚姻「${args.displayName}」`,
    do: async () => {
      const resp: any = await treeApi.createMarriage(args.data);
      const extracted = String(resp?.data?.id ?? resp?.id ?? '');
      if (!extracted) {
        throw new Error('创建婚姻成功但响应缺少 id，无法注册撤销');
      }
      createdId = extracted;
      return {
        undo: async () => {
          if (createdId) await treeApi.deleteMarriage(createdId);
        },
      };
    },
    reload: args.reload,
  });
  return { id: createdId ?? '' };
}

/**
 * 更新人物信息：保存前先 fetch 当前值，undo 时回写
 */
export async function updatePersonWithUndo(args: {
  personId: string;
  updates: Parameters<typeof treeApi.updatePerson>[1];
  currentValues: Parameters<typeof treeApi.updatePerson>[1];
  reload?: () => void | Promise<void>;
}): Promise<void> {
  await withUndo({
    label: '更新人物信息',
    do: async () => {
      await treeApi.updatePerson(args.personId, args.updates);
      return {
        undo: async () => {
          await treeApi.updatePerson(args.personId, args.currentValues);
        },
      };
    },
    reloadOnUndo: false,
    reload: args.reload,
  });
}

/**
 * 软删除人物：undo 时调 restorePerson 反向恢复
 * （后端 softDeletePerson 实际是设置 deleted_at + 清空 PersonAncestry，
 *  restorePerson 会取消 deleted_at 并通过 FamilyChild 重建闭包表）
 */
export async function deletePersonWithUndo(args: {
  personId: string;
  displayName: string;
  reload: () => void | Promise<void>;
}): Promise<void> {
  await withUndo({
    label: `删除人物「${args.displayName}」`,
    do: async () => {
      await treeApi.deletePerson(args.personId);
      return {
        undo: async () => {
          await treeApi.restorePerson(args.personId);
        },
        redo: async () => {
          await treeApi.deletePerson(args.personId);
        },
      };
    },
    reload: args.reload,
  });
}

/**
 * 删除婚姻：undo 时无原生 restoreFamilyUnit（FamilyUnit 无 deleted_at），
 * 因此只能记录 payload 并提示用户重新创建——通过 pushUndo 的 onError 重试路径
 * 实现「不可撤销时把条目留在栈尾」的友好回退。
 */
export async function deleteMarriageWithUndo(args: {
  familyId: string;
  displayName: string;
  /** 重新创建婚姻所需的原始 payload，用于反悔 */
  recreatePayload?: Parameters<typeof treeApi.createMarriage>[0];
  reload: () => void | Promise<void>;
}): Promise<void> {
  await withUndo({
    label: `删除婚姻「${args.displayName}」`,
    do: async () => {
      await treeApi.deleteMarriage(args.familyId);
      return {
        undo: async () => {
          if (args.recreatePayload) {
            await treeApi.createMarriage(args.recreatePayload);
          } else {
            // 没有 payload：抛错让上层把条目留在栈尾
            throw new Error('缺少重新创建婚姻所需参数，需手动重建');
          }
        },
      };
    },
    reload: args.reload,
  });
}