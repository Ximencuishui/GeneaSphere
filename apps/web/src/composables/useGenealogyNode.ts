/**
 * useGenealogyNode — 自定义 G6 GenealogyNode 类工厂
 *
 * [2026-09-03 拆分 P1] 从 useG6GraphInit.ts 抽出 GenealogyNode 类（render / onframe /
 *   drawTraditionalContent 三个方法），避免单文件 1889 行不可维护。
 *
 * 设计原则：
 *   - 纯类工厂 createGenealogyNodeClass(deps) → 返回 Rect 子类
 *   - Rect / GText 由 caller 在动态 import 后注入，保持 G6 子路径按需加载
 *   - genealogyStore / viewModeConfig 切片通过 deps 传入，render 时按需读取响应式值
 *   - 每次调用产生独立 class（与 G6 register 调用对齐，register 一次绑一个 class）
 *
 * 与原 useG6GraphInit.ts 内 GenealogyNode 的等价性：
 *   - 行为完全一致（drawTraditionalContent 内容照搬，含身份标签 / 排行 / 姓名 / 生卒年 / 称谓）
 *   - 仅 deps 来源从 useG6GraphInit 的 deps 切到本工厂的 deps
 */
import type { ComputedRef } from 'vue';
import type { ViewMode } from '@/stores/genealogy';

/**
 * 工厂参数。
 *
 * 注意：Rect / GText 是 G6 / @antv/g-lite 导出的类构造器（值）。
 *   - Rect：必须由 caller 通过 dynamic import 拉入，避免顶层静态依赖破坏
 *     `loadG6Runtime()` 的按需加载链
 *   - GText：来自 @antv/g-lite；同 Rect 处理
 *
 * genealogyStore 是 Pinia store / reactive 对象，每次 render 时读取
 * `.viewMode` 拿最新值；viewModeConfig 是 ComputedRef，.value 也按需读取。
 */
export interface GenealogyNodeDeps {
  /** G6 Rect class（caller 通过 dynamic import 提供） */
  Rect: any;
  /** @antv/g-lite Text shape class（caller 通过 dynamic import 提供） */
  GText: any;
  /** genealogy store 切片：render 时读 .viewMode 获取当前视图模式 */
  genealogyStore: { viewMode: ViewMode };
  /** 视图模式参数表（来自 useViewModeConfig），render 时读 .value */
  viewModeConfig: ComputedRef<Record<ViewMode, any>>;
}

/**
 * 创建 GenealogyNode（extends Rect）类，供 caller 通过
 * `register('node', 'rect', createGenealogyNodeClass(deps))` 注册到 G6。
 *
 * 返回类型用 `any`：避免直接 `typeof Rect` 因为 Rect 是动态加载的类，
 * 在静态类型上下文里难以表达「Rect 子类」。运行行为与 `typeof Rect` 完全一致。
 */
export function createGenealogyNodeClass(deps: GenealogyNodeDeps): any {
  const { Rect, GText } = deps;

  class GenealogyNode extends Rect {
    render(attributes = this.parsedAttributes, container = this) {
      // [树谱卡片 2026-08-27 P1 修复] G6 v5 不会把 datum.data 透传到 element.attributes
      // （element.js:208 getElementComputedStyle 只读 datum.style），所以 attributes.data 始终 undefined。
      // 这里用 this.context.model.getElementDataById(this.id) 兜底从 graph model 拿原始数据。
      let dataFromModel: any = null;
      try {
        dataFromModel = (this as any).context?.model?.getElementDataById(this.id);
      } catch (_) {
        // context / model 可能尚未就绪，回退到 attributes.data
      }
      const attrsAny = attributes as any;
      const realD = dataFromModel?.data || attrsAny.data || {};

      // 1. key shape (background)
      // [P0-3 2026-09-03] _drawKeyShape 是 G6 BaseNode 的 private 方法，
      // TS 报 TS2341。这里通过 (this as any) 绕过类型检查（实际 G6 v5 内部
      // 仍暴露该方法供子类调用）。
      (this as any)._drawKeyShape(attributes, container);
      if (!(this as any).getShape('key')) return;
      // 2. halo
      this.drawHaloShape(attributes, container);

      const [width, height] = this.getSize(attributes);
      const d = realD;

      // 3. 紧凑/横排小卡片保持原有 label + icon 渲染
      if (height < 70) {
        this.drawLabelShape(attributes, container);
        this.drawIconShape(attributes, container);
        this.drawBadgeShapes(attributes, container);
        this.drawPortShapes(attributes, container);
        return;
      }

      // 3. 传统竖排卡片：身份标签 / 生卒日期 / 姓名 / 称谓
      // [P0-3 2026-09-03] 把 dataFromModel 作为第 6 个参数传入，避免在
      // drawTraditionalContent 闭包内引用 render 的局部变量（TS 报 undefined）。
      this.drawTraditionalContent(attributes, container, width, height, d, dataFromModel);
      // 4. icon（缩略图）渲染在文字上方
      this.drawIconShape(attributes, container);
      // 5. badges
      this.drawBadgeShapes(attributes, container);
      // 6. ports
      this.drawPortShapes(attributes, container);
    }

    /**
     * 自定义 render 已绘制所有文字，禁止默认 label shape 覆盖
     */
    onframe() {
      this.drawBadgeShapes(this.parsedAttributes, this);
    }

    /**
     * [树谱卡片 2026-08-27] 传统横排卡片渲染（PRD §2.1.6）
     * - 字段：身份标识（顶部彩色条）+ 排行（如「第3」）+ 姓名（横排大字）+ 生卒年（横排小字）
     * - 传记/葬地/功名/字号不在卡片展示（册谱世录卷承载）
     * - 原实现竖排姓名 + 竖排生卒年 + 下方称谓，阅读不连贯；改为横排为主后像传统谱牌。
     */
    private drawTraditionalContent(
      attributes: any,
      container: any,
      width: number,
      height: number,
      d: any,
      // [P0-3 2026-09-03] dataFromModel 从 render 传入，避免 TS 报
      // "Cannot find name 'dataFromModel'"（原本是 render 内的闭包变量）。
      dataFromModel: any,
    ) {
      const halfW = width / 2;
      const halfH = height / 2;
      const isMale = d.gender === 'male';
      const identity = d.identity_label || '';
      // [树谱卡片 2026-08-27] 排行来自 child_links.birth_order，transformToG6Data 已透出
      const birthOrder: number | undefined =
        typeof d.birth_order === 'number' && d.birth_order > 0 ? d.birth_order : undefined;
      // [树谱卡片 2026-08-27] 横排卡片使用四位年份（1328）避免「一三二八年九月十八日」过长；
      // transformToG6Data 已把 birth_year/death_year 写入 data，直接读取。
      const birth = d.birth_year ? String(d.birth_year) : '';
      const death = d.is_living ? '' : (d.death_year ? String(d.death_year) : '');
      // [树谱卡片 2026-08-27 P1 修复] G6 v5 不会把 datum.data/datum.label 透传到 element.attributes，
      // attributes.label 是 G6 内部的 boolean 标志（true/false）也不是 datum.label。
      // 这里从 model 拿完整 datum，name 才能从 datum.label（即 spouse.name / person.name）取到。
      const fullDatum: any = dataFromModel || {};
      const nameFromDatum: string = fullDatum.label || fullDatum.original?.full_name || '';
      const name = nameFromDatum;
      // [苏式 2026-08-19] 称谓（妻/子/继/养/妾/出继）来自 spouse.relation / child_links.child_type
      const relation = d.relation || '';
      const childType = d.child_type || '';
      // [苏式 / 浙式] 排行字段
      // 苏式：继 / 养 / 妾之子 → 「继X」「养X」「妾X」，前缀直接显示在排行后
      // 浙式：排行「第N」+ 原名（女标「女」），强调谱牒编修顺序
      const rankSuffix = isMale ? '' : '女';
      // 调用方决定是否绘制排行（苏式 / 浙式 / 吊线图 才需要）
      // 这里统一算出，renderByXxx 自己取舍
      const rankPrefix = (() => {
        if (deps.genealogyStore.viewMode === 'su' && childType === 'BIOLOGICAL') return '';
        if (deps.genealogyStore.viewMode === 'su' && childType === 'ADOPTED') return '养';
        if (deps.genealogyStore.viewMode === 'su' && childType === 'STEP') return '继';
        if (deps.genealogyStore.viewMode === 'su' && relation === 'concubine') return '妾';
        return '';
      })();
      const rankText = (() => {
        if (deps.genealogyStore.viewMode === 'su' && (birthOrder || rankPrefix)) {
          return `${rankPrefix}${birthOrder ?? ''}`;
        }
        if (deps.genealogyStore.viewMode === 'zhe' && birthOrder) {
          return `第${birthOrder}`;
        }
        if (deps.genealogyStore.viewMode === 'xianshi' && birthOrder) {
          return `第${birthOrder}`;
        }
        return '';
      })();

      // 计算字号（容器宽决定姓名能放多大）
      const config = deps.viewModeConfig.value[deps.genealogyStore.viewMode];
      const nameFontSize = Math.max(10, Math.min(18, Math.floor(width / 6)));
      const subFontSize = Math.max(8, Math.floor(nameFontSize * 0.7));
      const tagFontSize = Math.max(8, Math.floor(nameFontSize * 0.6));
      const yearsLine = birth && death ? `${birth} - ${death}` : birth ? `${birth} - ` : '';
      const tagW = Math.max(20, width * 0.32);
      const tagH = tagFontSize + 4;
      // 标签条：顶端彩色块（PRD §2.1.6 顶部色带）
      const tagX = -halfW;
      const tagY = -halfH;
      const contentTop = tagY + tagH + 2;

      // 标签条（顶部彩色 + 排行 / 身份文字）
      const tagFill = (() => {
        if (deps.genealogyStore.viewMode === 'xianshi') return d.palette || '#9E9E9E';
        if (d.is_main_lineage) return '#C9A96E';
        return isMale ? '#1976D2' : '#C2185B';
      })();
      // [G-lite 2026-08-27] 用 addShape 画 rect + text
      if (GText && (this as any).context?.canvas) {
        try {
          (this as any).context.canvas.addShape?.('rect', {
            style: {
              x: tagX,
              y: tagY,
              width: tagW,
              height: tagH,
              fill: tagFill,
              radius: 4,
            },
          });
          (this as any).context.canvas.addShape?.('text', {
            style: {
              x: tagX + tagW / 2,
              y: tagY + tagH / 2 + tagFontSize * 0.35,
              fontSize: tagFontSize,
              fill: '#FFFFFF',
              text: identity || rankText,
              textAlign: 'center',
              textBaseline: 'middle',
            },
          });
        } catch (_) { /* G6 context not ready */ }
      }

      // 姓名（横排大字）
      if (GText) {
        try {
          (this as any).context?.canvas?.addShape?.('text', {
            style: {
              x: 0,
              y: contentTop + (height - tagH) * 0.35,
              fontSize: nameFontSize,
              fontWeight: 600,
              fill: '#2C3E50',
              text: name + (rankSuffix && rankText ? rankText : ''),
              textAlign: 'center',
              textBaseline: 'middle',
            },
          });
        } catch (_) { /* G6 context not ready */ }
      }

      // 生卒年（横排小字）
      if (GText && yearsLine) {
        try {
          (this as any).context?.canvas?.addShape?.('text', {
            style: {
              x: 0,
              y: contentTop + (height - tagH) * 0.7,
              fontSize: subFontSize,
              fill: '#7F8C8D',
              text: yearsLine,
              textAlign: 'center',
              textBaseline: 'middle',
            },
          });
        } catch (_) { /* G6 context not ready */ }
      }

      // 称谓（苏式专属：竖排小字）
      if (GText && deps.genealogyStore.viewMode === 'su' && (relation || childType)) {
        const subLabel = relation === 'concubine' ? '妾' :
          childType === 'ADOPTED' ? '养' :
          childType === 'STEP' ? '继' : '';
        if (subLabel) {
          try {
            (this as any).context?.canvas?.addShape?.('text', {
              style: {
                x: halfW - subFontSize,
                y: -halfH + subFontSize + 2,
                fontSize: subFontSize,
                fill: '#9E9E9E',
                text: subLabel,
                textAlign: 'right',
                textBaseline: 'top',
              },
            });
          } catch (_) { /* G6 context not ready */ }
        }
      }

      // 把横排布局同步回 d，供 G6 默认 label 路径兜底使用
      d.identity_label = identity;
      d.rank_text = rankText;
    }
  }

  return GenealogyNode;
}