/**
 * layout-errors.ts - 布局引擎错误类型定义
 *
 * [v6.x 强壮性 A2 + A5 + A6] 统一布局引擎错误出口
 *
 * 目标：
 * 1. 把 LayoutEngine 内部边界异常（根节点缺失、环路、参数非法等）
 *    暴露为有错误码的结构化异常，避免 `throw new Error('...')` 的字符串不可解析。
 * 2. 上游调用方（GenealogyTree.vue / 多家族 SaaS 路由）可以根据 `code`
 *    字段做差异化 UI 提示（弹窗 / toast / 兜底渲染）。
 * 3. 不破坏向后兼容：所有 LayoutEngineError 都是 Error 子类，`instanceof Error` 仍然成立。
 *
 * 错误码命名规范：
 * - `LAYOUT_*` 前缀表示 LayoutEngine 主动抛错
 * - `INVALID_*` 前缀表示输入参数校验失败
 * - `ENGINE_*` 前缀表示底层引擎（dagre / elkjs / compactBox）失败
 */

/**
 * 布局引擎错误码（强类型枚举）
 */
export type LayoutErrorCode =
  | 'LAYOUT_NO_ROOT_NODE'        // A5：根节点缺失（所有节点都是 spouse / 虚拟节点）
  | 'LAYOUT_CYCLE_DETECTED'      // A6：父子边存在环路（A → B → C → A）
  | 'LAYOUT_EMPTY_GRAPH'         // A5 衍生：节点数为 0
  | 'LAYOUT_ENGINE_THREW'        // A2：dagre / elkjs / compactBox 内部抛错且 fallback 耗尽
  | 'INVALID_CONFIG'             // C2：LayoutConfig 数值参数非法
  | 'INVALID_INPUT'              // 输入数据缺字段（id 缺失、宽高非数等）
  | 'INVALID_NODE_ROLE';         // A3：nodeRole 字段值不在白名单内

/**
 * 布局引擎结构化异常类
 *
 * 用法：
 * ```ts
 * throw new LayoutEngineError('LAYOUT_CYCLE_DETECTED', 'parent-child cycle: A → B → C → A', {
 *   cyclePath: ['A', 'B', 'C', 'A'],
 * });
 * ```
 */
export class LayoutEngineError extends Error {
  public readonly code: LayoutErrorCode;
  public readonly details?: Record<string, unknown>;
  /** 错误发生时间（毫秒） */
  public readonly timestamp: number;

  constructor(
    code: LayoutErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'LayoutEngineError';
    this.code = code;
    this.details = details;
    this.timestamp = Date.now();

    // 修复 prototype chain（TypeScript 编译到 ES5 时需要）
    Object.setPrototypeOf(this, LayoutEngineError.prototype);
  }

  /**
   * 序列化为可记录到日志/上报系统的对象
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
      timestamp: this.timestamp,
      stack: this.stack,
    };
  }

  /**
   * 用户可读的错误描述（含错误码 + 友好提示）
   */
  toUserMessage(): string {
    const codePrefix = `[${this.code}]`;
    switch (this.code) {
      case 'LAYOUT_NO_ROOT_NODE':
        return `${codePrefix} 未找到根节点。可能是数据中全部节点都是配偶节点，或父子关系存在环路。`;
      case 'LAYOUT_CYCLE_DETECTED': {
        const path = Array.isArray(this.details?.cyclePath)
          ? (this.details!.cyclePath as string[]).join(' → ')
          : '?';
        return `${codePrefix} 检测到父子关系环路：${path}。请检查数据录入。`;
      }
      case 'LAYOUT_EMPTY_GRAPH':
        return `${codePrefix} 输入为空（0 个节点）。请检查数据源。`;
      case 'LAYOUT_ENGINE_THREW':
        return `${codePrefix} 布局引擎内部抛错：${this.message}`;
      case 'INVALID_CONFIG':
        return `${codePrefix} 布局配置非法：${this.details?.field ?? '?'} = ${this.details?.value}（${this.details?.reason}）`;
      case 'INVALID_INPUT':
        return `${codePrefix} 输入数据非法：${this.message}`;
      case 'INVALID_NODE_ROLE':
        return `${codePrefix} 节点角色非法：${this.details?.nodeId ?? '?'} = ${this.details?.nodeRole}`;
      default:
        return `${codePrefix} ${this.message}`;
    }
  }
}

/**
 * 类型守卫：判断一个 unknown 错误是否为 LayoutEngineError
 */
export function isLayoutEngineError(e: unknown): e is LayoutEngineError {
  return e instanceof LayoutEngineError;
}
