/**
 * elkjs-layout.worker.ts - elkjs Web Worker 入口
 *
 * [W3 2026-09-01] LayoutEngine v6 第三阶段：elkjs 异步布局的 worker 进程入口。
 *   ELK 库的 workerUrl 参数会指向此文件，elkjs 内部自动管理 worker 生命周期。
 *
 * 通信契约（elkjs 内部定义）：
 * - elkjs 主线程 postMessage(graph: ElkNode) → worker
 * - worker 调用 elk.layout(graph) → 返回 ElkNode（异步）
 * - worker postMessage(result: ElkNode) → 主线程
 *
 * @vitest/web-worker：在测试环境中，此 worker 被替换为同线程 stub，
 *   无需真实多线程，保留 elkjs API 调用契约不变。
 *
 * 见 docs/dagre-vs-elkjs-selection.md。
 */

import ELK from 'elkjs/lib/elk.bundled.js';

// worker 端 ELK 实例（无需 workerUrl，会自然运行在当前 worker 上下文）
//   注意：ELK 构造器不接受 logging 参数（仅 layout() 的 ElkLayoutArguments 接受）。
//   logging 关闭由 elk.layout() 调用时的第二个参数控制。
const elk = new ELK();

self.onmessage = (e: MessageEvent) => {
  const graph = e.data;
  elk
    .layout(graph)
    .then((result: unknown) => {
      (self as unknown as Worker).postMessage(result);
    })
    .catch((err: unknown) => {
      // elkjs 在 worker 端出错时主线程无法 try/catch，
      // 用 postMessage 把错误回传（elkjs 内部约定）
      (self as unknown as Worker).postMessage({
        __elkWorkerError: true,
        error: String(err),
      });
    });
};