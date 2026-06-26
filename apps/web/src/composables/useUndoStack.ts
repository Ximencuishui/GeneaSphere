import { ref, computed } from 'vue';

/**
 * 通用撤销栈 composable
 *
 * 设计要点：
 * 1. 操作完成时调 pushUndo(label, undoFn, redoFn?)，label 用于 UI 提示，
 *    undoFn 执行真正的反向操作（删除刚建的 / 恢复刚改的 / 反向移动子树）
 * 2. 栈容量默认 10 条（FIFO 裁剪），跨页面不持久化
 * 3. 与 ElMessage 集成：每个 undo 都通过 ElMessage 提示「可撤销」，
 *    用户点撤销按钮才真正执行 undoFn
 * 4. 失败安全：undoFn 抛错时清空该条目并提示，避免脏数据
 * 5. 不阻断正常流程：undo 失败时仍可继续操作
 * 6. **过期清理 (P2-J)**：每条 entry 带 expiresAt；push / 撤销前清理已过期项，
 *    避免用户离开页面后回来看见可「撤销 1 周前操作」的鬼影按钮
 * 7. **evict 订阅 (P2-K)**：条目被裁剪 / 移除 / 清空时通知订阅者，
 *    外部关联数据（如 entryOptsMap）能同步清理，无内存泄漏
 *
 * 注意：服务端目前不支持事务化回滚到具体时点，undoFn 必须调用已有的
 * 反向 API（如 DELETE /api/tree/person/:id、PATCH move-subtree 等）。
 * 服务端日后若加审计日志 / soft delete 即可升级为纯服务端 undo。
 */
export interface UndoEntry {
  id: string;
  label: string;
  /** 反向操作；返回 Promise */
  undo: () => Promise<void>;
  /** 正向重做（可选，用于 Ctrl+Shift+Z / Redo）。未实现则不提供 */
  redo?: () => Promise<void>;
  /** 推送时间，用于 FIFO 裁剪与 UI 显示 */
  ts: number;
  /**
   * 过期时间戳（= ts + ENTRY_TTL_MS）。过期条目不能再被 undo，
   * 在下次 push / undo / 主动调用 cleanupExpired() 时被剔除。
   */
  expiresAt: number;
}

const MAX_STACK = 10;
/**
 * 单条撤销条目在栈中的存活时间。超过此时间的条目在下次清理时自动移除。
 * 撤销按钮 UI 窗口（5s）由 useUndoableTree 控制；这里控制的是「栈本身」，
 * 防止用户跨页面或长时间挂机时栈内存持续增长。
 */
const ENTRY_TTL_MS = 5 * 60 * 1000; // 5 分钟

const stack = ref<UndoEntry[]>([]);
let nextId = 1;

/** evict 订阅者：条目被裁剪 / 移除 / 清空时收到通知 */
type EvictedHandler = (entry: UndoEntry) => void;
const evictedHandlers: EvictedHandler[] = [];

/**
 * 注册条目驱逐回调（典型场景：useUndoableTree 的 entryOptsMap 同步清理）。
 * 返回反注册函数。
 */
export function onEntryEvicted(handler: EvictedHandler): () => void {
  evictedHandlers.push(handler);
  return () => {
    const idx = evictedHandlers.indexOf(handler);
    if (idx >= 0) evictedHandlers.splice(idx, 1);
  };
}

function fireEvicted(entry: UndoEntry): void {
  for (const h of evictedHandlers) {
    try {
      h(entry);
    } catch (e) {
      // 单个 handler 失败不影响其他订阅者
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.error('[useUndoStack] evict handler threw', e);
      }
    }
  }
}

export function useUndoStack() {
  const canUndo = computed(() => stack.value.length > 0);
  const lastEntry = computed(() =>
    stack.value.length > 0 ? stack.value[stack.value.length - 1] : null,
  );

  /**
   * 清理已过期条目；返回被清理的条目列表。
   * - 典型调用点：pushUndo 之前、undoLast 之前、外部按需触发
   * - 过期判定：Date.now() > entry.expiresAt
   */
  function cleanupExpired(): UndoEntry[] {
    const now = Date.now();
    const remaining: UndoEntry[] = [];
    const evicted: UndoEntry[] = [];
    for (const e of stack.value) {
      if (e.expiresAt <= now) evicted.push(e);
      else remaining.push(e);
    }
    if (evicted.length > 0) stack.value = remaining;
    for (const e of evicted) fireEvicted(e);
    return evicted;
  }

  /**
   * 推入一条可撤销操作
   * @param label 操作描述（如「移动子树」「创建人物」），UI 显示用
   * @param undo 反向操作函数
   * @param redo 正向重做函数（可选）
   * @returns 该条目 id，可用于提前移除（例如操作失败要回滚）
   */
  function pushUndo(
    label: string,
    undo: () => Promise<void>,
    redo?: () => Promise<void>,
  ): string {
    // 先清理过期项，腾出位置
    cleanupExpired();

    const now = Date.now();
    const entry: UndoEntry = {
      id: `undo-${nextId++}`,
      label,
      undo,
      redo,
      ts: now,
      expiresAt: now + ENTRY_TTL_MS,
    };
    stack.value.push(entry);
    // FIFO 裁剪
    while (stack.value.length > MAX_STACK) {
      const removed = stack.value.shift();
      if (removed) fireEvicted(removed);
    }
    return entry.id;
  }

  /**
   * 撤销最近一条
   * @returns 是否成功执行
   */
  async function undoLast(): Promise<boolean> {
    // 撤销前先清理过期项，避免「撤销 1 周前操作」误触发
    cleanupExpired();

    const entry = stack.value.pop();
    if (!entry) return false;
    // 已被消费（不论成功失败），从订阅角度视作 evict
    fireEvicted(entry);
    try {
      await entry.undo();
      return true;
    } catch (e) {
      // undo 失败：把条目放回栈尾（保留重试机会），但刷新 expiresAt
      entry.expiresAt = Date.now() + ENTRY_TTL_MS;
      stack.value.push(entry);
      throw e;
    }
  }

  /** 通过 id 移除某条（用于操作失败时主动清理） */
  function removeById(id: string): void {
    const idx = stack.value.findIndex((e) => e.id === id);
    if (idx >= 0) {
      const [removed] = stack.value.splice(idx, 1);
      if (removed) fireEvicted(removed);
    }
  }

  /** 清空栈（典型场景：登出 / 切换家族） */
  function clear(): void {
    const all = stack.value.slice();
    stack.value = [];
    for (const e of all) fireEvicted(e);
  }

  return {
    stack,
    canUndo,
    lastEntry,
    pushUndo,
    undoLast,
    removeById,
    clear,
    cleanupExpired,
  };
}
