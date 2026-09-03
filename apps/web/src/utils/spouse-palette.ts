/**
 * spouse-palette.ts — 吊线图妻子分支着色工具
 *
 * [2026-08-19 吊线图调色板] 同一父亲的多位妻子应能直观区分各自子女分支。
 * 实现策略：每位妻子按 person_id 用 djb2 哈希取色，同一妻子永远是同一颜色；
 * 该色再统一传到「妻子节点描边」与「妻子→子女」边上。
 *
 * - 仅 xianshi 模式启用：其他 5 种视图（compact / detailed / portrait / su / zhe）
 *   永远不向 data.palette 写入颜色，原有 stroke / lineDash 逻辑不受影响。
 * - 选用 8 色低饱和「传统卷轴」色系（朱砂/黛绿/松烟/赭石/紫袍/青瓷/檀褐/郁金），
 *   与既有主枝金 #C9A96E、配偶粉 #E91E63 区分度高，且在浅米背景上对比充分。
 *
 * 设计要点：
 * - 模块顶层 const/function，无 Vue 依赖，纯函数式，可独立单测。
 * - 不引入 @/types/index 依赖以避免循环引用；personId 接受 string | number。
 */

/**
 * 妻子分支调色板（8 色传统卷轴色系）。
 * 顺序固定，hashPersonId(personId) % 8 决定每位妻子取哪个色。
 */
export const WIFE_PALETTE: readonly string[] = [
  '#C0392B', // 朱砂红
  '#27AE60', // 黛绿
  '#2980B9', // 松烟蓝
  '#D68910', // 赭石
  '#7D3C98', // 紫袍
  '#138D75', // 青瓷
  '#6E2C00', // 檀褐
  '#B9770E', // 郁金
] as const;

/**
 * djb2 字符串哈希 → 非负 32 位整数。
 * 同一 person_id 永远映射到同一调色板索引。
 */
export function hashPersonId(id: string | number): number {
  const s = String(id);
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** 取妻子对应调色板色（同一 person_id 永远返回同一颜色） */
export function getWifePaletteColor(personId: string | number): string {
  return WIFE_PALETTE[hashPersonId(personId) % WIFE_PALETTE.length];
}

/**
 * 把 hex 颜色转成低透明度 rgba 字符串，用于边阴影 / 光晕。
 * 例：paletteShadow('#C0392B', 0.18) → 'rgba(192, 57, 43, 0.18)'
 * 入参非法时回退到黑色半透明（不抛错，避免 G6 style 函数中断）。
 */
export function paletteShadow(hex: string, alpha: number): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return `rgba(0,0,0,${alpha})`;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}