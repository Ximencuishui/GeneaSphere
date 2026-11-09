/**
 * useOrthEdge — 自定义 G6 OrthEdge 类工厂
 *
 * [2026-09-03 拆分 P1] 从 useG6GraphInit.ts 抽出 OrthEdge 类 + ORTH_CORNER_RADIUS 常量，
 * 单独成模块，避免单文件 1889 行不可维护。
 *
 * 设计原则：
 *   - 纯类工厂 createOrthEdgeClass(deps) → 返回 Polyline 子类
 *   - Polyline 由 caller 在 dynamic import 后注入，保持 G6 模块按需加载链
 *   - ORTH_CORNER_RADIUS 常量（4px）随类一起导出，下游可单独引用
 *
 * 与原 useG6GraphInit.ts 内 OrthEdge 的等价性：
 *   - getEndpoints / getKeyPath 实现完全照搬（含圆角拐弯路径生成算法）
 *   - 行为与原内联类完全一致
 *
 * 引用关系：
 *   - 上游 useG6Runtime.ts 通过 import('@antv/g6/esm/elements/edges/polyline') 拿到
 *     Polyline 后调用本工厂，再 register('edge', 'orth', OrthEdgeClass)
 *   - 下游 layout-engine-pipeline 等模块可能引用 ORTH_CORNER_RADIUS 常量
 */

import { logEdgeDrawProbe } from '@/utils/tree-align-debug';

/** 默认正交边圆角半径（px），与 plan §C1 设定一致 */
export const ORTH_CORNER_RADIUS = 4;

const BRIDGE_RADIUS = 8;

/** 在直线段的交叉点拱一个小桥。桥接坐标必须落在这段线的内部。 */
function appendOrthLine(
  path: any[],
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  bridges: { x: number; y: number }[] | undefined,
) {
  const vertical = Math.abs(x1 - x2) < 0.5;
  const horizontal = Math.abs(y1 - y2) < 0.5;
  const hits = (bridges ?? []).filter((point) => {
    if (vertical) {
      if (Math.abs(point.x - x1) > 1) return false;
      const dir = Math.sign(y2 - y1) || 1;
      return (point.y - y1) * dir > BRIDGE_RADIUS && (y2 - point.y) * dir > BRIDGE_RADIUS;
    }
    if (horizontal) {
      if (Math.abs(point.y - y1) > 1) return false;
      const dir = Math.sign(x2 - x1) || 1;
      return (point.x - x1) * dir > BRIDGE_RADIUS && (x2 - point.x) * dir > BRIDGE_RADIUS;
    }
    return false;
  });
  if (hits.length === 0) {
    path.push(['L', x2, y2]);
    return;
  }
  if (vertical) {
    const dir = Math.sign(y2 - y1) || 1;
    hits.sort((p, q) => (p.y - q.y) * dir);
    let cursor = y1;
    for (const point of hits) {
      const yBefore = point.y - dir * BRIDGE_RADIUS;
      const yAfter = point.y + dir * BRIDGE_RADIUS;
      if ((yBefore - cursor) * dir < -0.5) continue;
      path.push(['L', x1, yBefore]);
      path.push(['Q', x1 + BRIDGE_RADIUS, point.y, x1, yAfter]);
      cursor = yAfter;
    }
    path.push(['L', x2, y2]);
    return;
  }
  const dir = Math.sign(x2 - x1) || 1;
  hits.sort((p, q) => (p.x - q.x) * dir);
  let cursor = x1;
  for (const point of hits) {
    const xBefore = point.x - dir * BRIDGE_RADIUS;
    const xAfter = point.x + dir * BRIDGE_RADIUS;
    if ((xBefore - cursor) * dir < -0.5) continue;
    path.push(['L', xBefore, y1]);
    path.push(['Q', point.x, y1 - BRIDGE_RADIUS, xAfter, y1]);
    cursor = xAfter;
  }
  path.push(['L', x2, y2]);
}

/**
 * 工厂参数。
 *
 * Polyline 是 G6 Polyline 类（caller 通过 dynamic import 提供）。
 * 返回 `any` 同 useGenealogyNode.ts：避免直接 `typeof Polyline` 静态类型噪音，
 * 运行行为与 typeof Polyline 完全一致。
 */
export interface OrthEdgeDeps {
  /** G6 Polyline class（caller 通过 dynamic import 提供） */
  Polyline: any;
}

export function createOrthEdgeClass(deps: OrthEdgeDeps): any {
  const { Polyline } = deps;

  // [P0-3 2026-09-03] OrthEdge 继承 G6 Polyline，父类对 getEndpoints / getKeyPath
  // 的签名约束很严格（Point[] tuple / PathArray），自定义实现返回 any / any[]。
  // 因为 deps.Polyline: any，TS 不会做静态签名校验，无需 @ts-expect-error 抑制。
  class OrthEdge extends Polyline {
    getEndpoints(attributes: any, optimize = true, controlPoints: any = []) {
      const orthPath = attributes.orthPath;
      if (orthPath?.points && orthPath.points.length >= 2) {
        const pts = orthPath.points;
        return [[pts[0].x, pts[0].y], [pts[pts.length - 1].x, pts[pts.length - 1].y]];
      }
    }

    getKeyPath(attributes: any) {
      const orthPath = attributes.orthPath;
      if (orthPath?.points && orthPath.points.length >= 2) {
        const pts = orthPath.points;
        logEdgeDrawProbe(this, pts);
        const radius = attributes.cornerRadius ?? ORTH_CORNER_RADIUS;
        // 古谱：直角折线。圆角和桥拱都会把垂丝图的横担画弯。
        if (orthPath.classic || radius < 0.5) {
          const straight: any[] = [['M', pts[0].x, pts[0].y]];
          for (let i = 1; i < pts.length; i++) straight.push(['L', pts[i].x, pts[i].y]);
          return straight;
        }
        const bridges = orthPath.bridges as { x: number; y: number }[] | undefined;
        const path: any[] = [['M', pts[0].x, pts[0].y]];
        let cursorX = pts[0].x;
        let cursorY = pts[0].y;
        const lineTo = (x: number, y: number) => {
          appendOrthLine(path, cursorX, cursorY, x, y, bridges);
          cursorX = x;
          cursorY = y;
        };

        // [2026-08-28 C1] 插入圆角拐弯：
        //   每 3 个连续点 (a, b, c) 检查是否构成拐弯（非共线），
        //   如是：从 a 走到 b 之前插入 L（到 b 靠近 a 侧），然后 Q（二次贝塞尔）绕到 b 靠近 c 侧
        //   ，再从那里直线走到 c。
        //   仅相邻点产生"折角"时才插入圆弧，避免退化点（2 点或共线点）产生额外零长度路径。
        for (let i = 1; i < pts.length; i++) {
          const prev = pts[i - 1];
          const curr = pts[i];
          const next = pts[i + 1];
          if (!next) {
            lineTo(curr.x, curr.y);
            continue;
          }
          // 检测拐弯：prev→curr 与 curr→next 不共线
          const inHoriz = curr.y === prev.y
          const inVert = curr.x === prev.x
          const outHoriz = next.y === curr.y
          const outVert = next.x === curr.x
          const isTurn = (inHoriz && outVert) || (inVert && outHoriz)
          if (!isTurn) {
            lineTo(curr.x, curr.y);
            continue;
          }
          // 计算圆角起止点（在 curr 两侧各退 radius）
          // 入边方向
          const inDx = Math.sign(curr.x - prev.x)
          const inDy = Math.sign(curr.y - prev.y)
          // 出边方向
          const outDx = Math.sign(next.x - curr.x)
          const outDy = Math.sign(next.y - curr.y)
          const startX = curr.x - inDx * radius
          const startY = curr.y - inDy * radius
          const endX = curr.x + outDx * radius
          const endY = curr.y + outDy * radius
          lineTo(startX, startY)
          // 二次贝塞尔曲线：控制点 curr，走向 endX/endY
          path.push(['Q', curr.x, curr.y, endX, endY])
          cursorX = endX;
          cursorY = endY;
        }
        return path;
      }
    }
  }

  return OrthEdge;
}