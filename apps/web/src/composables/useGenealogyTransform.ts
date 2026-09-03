/**
 * useGenealogyTransform.ts — GenealogyTree → G6 数据递归转换 + 身份标签推导
 *
 * 包含内容（从 GenealogyTree.vue 抽取）：
 *  - toChineseNumber / formatChineseDate：中文日期/数字格式化（纯函数）
 *  - deriveIdentityLabel：身份标签推导（妻/妾/夫/第N子/女）
 *  - transformToG6Data：核心递归转换函数，附加 generationMap / 主脉标记 / 排行 / 过继类型
 *
 * 设计要点：
 *  - 工厂 useGenealogyTransform(store) 注入 genealogyStore；
 *    store 仅用于 transformToG6Data 内的 isInMainLineage 查询。
 *  - 不引入 Vue ref/computed，纯函数 + 递归结构，可独立单测。
 *  - 不引入 G6 渲染相关代码（避免与 useG6GraphInit 重复依赖）。
 */
import type { GenealogyNode } from '@/types';

/** 阿拉伯数字 → 中文数字（零-九） */
const DIGIT_TO_CHINESE = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'] as const;

/** 把数字或字符串里的每个阿拉伯数字字符转为对应中文数字（保留非数字字符）。 */
export function toChineseNumber(num: number | string): string {
  return String(num)
    .split('')
    .map((ch) => DIGIT_TO_CHINESE[Number(ch)] ?? ch)
    .join('');
}

/**
 * ISO 日期字符串 → 中文数字年月日
 * 例：1328-09-18 → 一三二八年九月十八日
 * 缺省部分不显示：1328-09 → 一三二八年九月
 */
export function formatChineseDate(isoDate?: string | null): string {
  if (!isoDate) return '';
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  let result = `${toChineseNumber(year)}年`;
  if (isoDate.length >= 7) result += `${toChineseNumber(month)}月`;
  if (isoDate.length >= 10) result += `${toChineseNumber(day)}日`;
  return result;
}

/**
 * 推导身份标签（妻/妾/夫/第N子/第N女等）
 * - 配偶节点：第一任女性为妻，其余女性为妾；男性配偶显示"夫"（入赘）
 * - 子女节点：按 birth_order + gender 显示"第N子/女"
 * - 无排行：显示"子/女"
 */
export function deriveIdentityLabel(
  node: GenealogyNode,
  opts: { isSpouse?: boolean; spouseOrder?: number; birthOrder?: number } = {},
): string {
  const { isSpouse, spouseOrder, birthOrder } = opts;
  if (isSpouse) {
    if (node.gender === 'female') {
      return spouseOrder === 1 ? '妻' : '妾';
    }
    return '夫';
  }
  if (birthOrder !== undefined && birthOrder > 0) {
    return `第${toChineseNumber(birthOrder)}${node.gender === 'male' ? '子' : '女'}`;
  }
  return node.gender === 'male' ? '子' : '女';
}

/**
 * 工厂：返回 transformToG6Data + 暴露工具函数。
 *
 * @param genealogyStore 提供 isInMainLineage(id) 查询主脉。
 *   在 GenealogyTree.vue 中即 useGenealogyStore() 返回值；
 *   这里不直接 import @/stores/genealogy 是为了让单测可以传入 mock。
 */
export function useGenealogyTransform(genealogyStore: {
  isInMainLineage: (id: string | number) => boolean;
}) {
  /**
   * 递归将 GenealogyNode 树转为 G6 节点结构：
   *   - id 强制 String 化（与 G6 model 对齐）
   *   - data.original 保留原节点引用，供节点 style 回调读取
   *   - data.generation 写入世代深度（供 TreePage 世代浮窗按 y 投影）
   *   - child_links 透出 birth_order / child_type / mother_id 到子节点 data
   *   - 主脉子节点居中：先找到 main_idx，splice 到中点位置
   *
   * 参数：
   *   - node 当前节点
   *   - generationMap 可选，把 (id → gen) 写入，供外部读取
   *   - gen 当前世代深度（递归累加）
   *   - parentNode 父节点（用于判断是否根节点）
   *   - opts 配偶节点专用：标记「妻/妾」身份
   */
  function transformToG6Data(
    node: GenealogyNode,
    generationMap?: Map<string, number>,
    gen: number = 0,
    parentNode?: GenealogyNode,
    opts: { isSpouse?: boolean; spouseOrder?: number } = {},
  ): any {
    if (generationMap) generationMap.set(String(node.id), gen);
    const isMainLineage = genealogyStore.isInMainLineage(node.id);

    // 兼容三种字段名：full_name（老约定）/ name（clan full 接口实际返回）/ label（其他）
    // demo 朱熹族谱 API 实际返回 name，没 full_name；之前一直空白是因为只读 full_name
    const displayName: string =
      (node as any).full_name || (node as any).name || (node as any).label || '';

    // [树谱卡片 2026-08-26] 推导身份标签：子女按排行，配偶按顺序；根节点无标签
    const isRootNode = !opts.isSpouse && !parentNode;
    const identityLabel = isRootNode
      ? ''
      : deriveIdentityLabel(node, {
          isSpouse: opts.isSpouse,
          spouseOrder: opts.spouseOrder,
        });

    const result: any = {
      id: String(node.id),
      label: displayName,
      data: {
        // [世代浮窗跟随画布 2026-08-20] 节点世代深度（根 = 0，配偶 = -1 不参与浮窗定位）。
        // 由 transformToG6Data 在 DFS 过程中直接写入；TreePage 通过 getMinimapSnapshot
        // 读取该字段，按画布 y 投影到左侧世代浮窗。
        generation: gen,
        gender: node.gender,
        is_living: node.is_living,
        birth_date: node.birth_date,
        death_date: node.death_date,
        birth_year: node.birth_date ? new Date(node.birth_date).getFullYear() : undefined,
        death_year: node.death_date ? new Date(node.death_date).getFullYear() : undefined,
        has_photo: (node as any).has_photo,
        thumbnail_url: (node as any).thumbnail_url || (node as any).avatar_url,
        avatar_url: (node as any).avatar_url,
        is_main_lineage: isMainLineage,
        title: node.title,
        identity_label: identityLabel,
        original: node,
      },
    };

    if (node.children && node.children.length > 0) {
      // [吊线图 2026-08-17] 从父节点 child_links 取每个子女的排行/过继类型，挂到子节点 data，
      // 供卡片排行展示与"过继虚线"（边样式读 d.target.data.child_type）使用。
      const linkByChild = new Map<string, any>();
      for (const l of (node.child_links || [])) linkByChild.set(String(l.child_id), l);

      const transformed = node.children.map((child) => {
        const g = transformToG6Data(child, generationMap, gen + 1, node);
        const link = linkByChild.get(String(child.id));
        if (link) {
          g.data.child_type = link.child_type;
          g.data.birth_order = link.birth_order;
          // [2026-08-28 P4 一妻多妾优化] 透出 mother_id 供 layoutEdges / 边样式读取
          // - layoutEdges：按母亲归属决定父子边牵引线起点 X
          // - 边样式：isConcubineChild + palette 区分妾之子
          g.data.mother_id = link.mother_id ? String(link.mother_id) : undefined;
          // [树谱卡片 2026-08-26] 用实际排行重新推导子女身份标签
          g.data.identity_label = deriveIdentityLabel(child, {
            birthOrder: link.birth_order ?? undefined,
          });
        }
        return g;
      });
      // 主脉子节点放中间，旁系对称分布两侧 → 布局时主脉自然居中
      const mainIdx = transformed.findIndex((c) => c.data?.is_main_lineage);
      if (mainIdx > 0) {
        const [mainChild] = transformed.splice(mainIdx, 1);
        const mid = Math.floor(transformed.length / 2);
        transformed.splice(mid, 0, mainChild);
      }
      result.children = transformed;
    }

    return result;
  }

  return {
    transformToG6Data,
    deriveIdentityLabel,
    toChineseNumber,
    formatChineseDate,
  };
}