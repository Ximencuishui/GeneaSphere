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
import type { CardDensity, TreeStyle, ViewMode } from '@/stores/genealogy';
import {
  CLASSIC_FONT_FAMILY,
  classicRankLabel,
  classicSpouseCaption,
  layoutClassicGlyphs,
} from '@/utils/traditional-column';
import { logNodeRenderProbe } from '@/utils/tree-align-debug';
import {
  CARD_PADDING_X,
  collectCornerMarks,
  collectDetailTags,
  estimateTextWidth,
  fitTextLines,
  formatDetailLine,
  formatLifeYears,
} from '@/utils/genealogy-card';
import { getLodLevel, isViewportCullActive } from '@/utils/viewport-cull';

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
  /** @antv/g-lite Image，卡片左侧头像 */
  GImage?: any;
  /** @antv/g-lite Circle，头像圆形裁切 */
  GCircle?: any;
  /** genealogy store 切片：render 时读 .viewMode / .cardDensity / .selectedNode */
  genealogyStore: {
    viewMode: ViewMode;
    cardDensity?: CardDensity;
    treeStyle?: TreeStyle;
    selectedNode?: { id: number | string } | null;
  };
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

      if ((deps.genealogyStore.treeStyle ?? 'modern') === 'traditional') {
        Object.assign(attributes, this.classicChrome(attributes));
        (this as any)._drawKeyShape(attributes, container);
        if (!(this as any).getShape('key')) return;
        const [width, height] = this.getSize(attributes);
        logNodeRenderProbe(this, attributes, dataFromModel, width);
        this.clearTraditionalShapes(container);
        this.clearCornerMarks(container);
        this.clearEdgeAnchors(container);
        this.drawClassicColumn(container, width, height, realD, dataFromModel);
        return;
      }

      // 1. key shape。浅底、1px 灰边、弱阴影，盖掉流程图式的纯色块。
      Object.assign(attributes, this.cardChrome(realD, attributes));
      // [P0-3 2026-09-03] _drawKeyShape 是 G6 BaseNode 的 private 方法，
      // TS 报 TS2341。这里通过 (this as any) 绕过类型检查（实际 G6 v5 内部
      // 仍暴露该方法供子类调用）。
      (this as any)._drawKeyShape(attributes, container);
      if (!(this as any).getShape('key')) return;
      this.clearClassicShapes(container);
      // 2. halo
      this.drawHaloShape(attributes, container);

      const [width, height] = this.getSize(attributes);
      logNodeRenderProbe(this, attributes, dataFromModel, width);
      const d = realD;
      this.ensureZoomRedraw();

      // 缩放低于 0.4：只留圆角色块和居中姓名。视口控制器在跨过阈值时才调用 render。
      if (getLodLevel() === 'minimal') {
        if (height < 70) {
          this.clearTraditionalShapes(container);
          this.clearCornerMarks(container);
          this.drawLabelShape(attributes, container);
        } else {
          this.drawLodMinimal(container, width, dataFromModel);
        }
        return;
      }

      // 3. 紧凑/横排小卡片保持原有 label + icon 渲染
      if (height < 70) {
        this.clearTraditionalShapes(container);
        this.drawLabelShape(attributes, container);
        this.drawIconShape(attributes, container);
        this.drawBadgeShapes(attributes, container);
        this.drawPortShapes(attributes, container);
        this.drawEdgeAnchors(container, width, height);
        this.drawCornerMarks(container, width, height, d);
        (this as any)._drawnZoom = this.readZoom();
        return;
      }

      // 肖像是竖卡：上圆头像，下姓名和生卒。不走横排谱牌，也不画 G6 小图标。
      if (deps.genealogyStore.viewMode === 'portrait') {
        this.drawPortraitContent(container, width, height, d, dataFromModel);
        this.drawIconShape(attributes, container);
        this.drawBadgeShapes(attributes, container);
        this.drawPortShapes(attributes, container);
        this.drawEdgeAnchors(container, width, height);
        this.drawCornerMarks(container, width, height, d);
        (this as any)._drawnZoom = this.readZoom();
        return;
      }

      // 3. 传统横排卡片：左侧头像 / 姓名 / 生卒年
      this.drawTraditionalContent(attributes, container, width, height, d, dataFromModel);
      this.drawIconShape(attributes, container);
      // 5. badges
      this.drawBadgeShapes(attributes, container);
      // 6. ports
      this.drawPortShapes(attributes, container);
      this.drawEdgeAnchors(container, width, height);
      this.drawCornerMarks(container, width, height, d);
      (this as any)._drawnZoom = this.readZoom();
    }

    /** 古谱没有卡片。近乎透明的命中层只为了能点中这一列字。 */
    private classicChrome(attributes: any) {
      const opacity = typeof attributes?.opacity === 'number' ? attributes.opacity : 1;
      return {
        fill: 'rgba(246, 241, 231, 0.01)',
        stroke: 'transparent',
        lineWidth: 0,
        radius: 0,
        shadowColor: 'transparent',
        shadowBlur: 0,
        shadowOffsetX: 0,
        shadowOffsetY: 0,
        opacity,
        cursor: 'pointer',
      };
    }

    private clearClassicShapes(container: any) {
      if (!deps.GText) return;
      for (let i = 0; i < 8; i++) {
        (this as any).upsert(`classic-r-${i}`, deps.GText, false, container);
        (this as any).upsert(`classic-n-${i}`, deps.GText, false, container);
        (this as any).upsert(`classic-s-${i}`, deps.GText, false, container);
      }
    }

    /**
     * 垂丝图一列：顶上排行或字辈，中间姓名，底下「配某氏」。
     * 连线锚在这一列的底边中点，所以字必须落在节点盒子里。
     */
    private drawClassicColumn(
      container: any,
      width: number,
      height: number,
      d: any,
      dataFromModel: any,
    ) {
      this.clearClassicShapes(container);
      if (!deps.GText) return;
      const fullDatum: any = dataFromModel || {};
      const name = String(fullDatum.label || fullDatum.original?.full_name || d?.name || '').trim();
      const rank = classicRankLabel(d?.birth_order) || String(d?.generation_word || '').trim();
      const spouse = classicSpouseCaption(d?.original?.spouses || d?.spouses);
      const minimal = getLodLevel() === 'minimal';
      const selectedId = deps.genealogyStore.selectedNode?.id;
      const selected = selectedId != null && String(selectedId) === String((this as any).id);
      const dimmed = typeof (this as any).parsedAttributes?.opacity === 'number'
        && (this as any).parsedAttributes.opacity < 0.95;
      const ink = selected ? '#8C1D18' : dimmed ? '#A39A90' : '#1A1612';
      const muted = dimmed ? '#C4BDB4' : '#6B6258';
      const glyphs = layoutClassicGlyphs({ name, rank, spouse, width, height, minimal });
      const fills = { rank: muted, name: ink, spouse: muted };
      const prefix = { rank: 'classic-r', name: 'classic-n', spouse: 'classic-s' };
      const written = { rank: 0, name: 0, spouse: 0 };
      for (const glyph of glyphs) {
        const index = written[glyph.role]++;
        (this as any).upsert(`${prefix[glyph.role]}-${index}`, deps.GText, {
          x: glyph.x,
          y: glyph.y,
          text: glyph.text,
          fontSize: glyph.fontSize,
          fontWeight: glyph.weight,
          fill: fills[glyph.role],
          fontFamily: CLASSIC_FONT_FAMILY,
          textAlign: 'center',
          textBaseline: 'middle',
          pointerEvents: 'none',
        }, container);
      }
    }

    /** 浅灰纸底，性别只用很淡的冷暖色区分。选中时描边略深。 */
    private cardChrome(d: any, attributes: any) {
      const opacity = typeof attributes?.opacity === 'number' ? attributes.opacity : 1;
      const dimmed = opacity < 0.95;
      const selectedId = deps.genealogyStore.selectedNode?.id;
      const isSelected = selectedId != null && String(selectedId) === String((this as any).id);
      const isMale = d?.gender === 'male';
      const main = !!d?.is_main_lineage;
      let fill = '#F7F5F2';
      if (!dimmed) {
        if (main) fill = '#FBF7EF';
        else if (isMale) fill = '#F4F7FB';
        else if (d?.gender === 'female') fill = '#FBF6F7';
      } else {
        fill = '#F3F1EE';
      }
      if (deps.genealogyStore.viewMode === 'portrait') {
        fill = dimmed ? '#F4F2EF' : '#FFFFFF';
      }
      return {
        fill,
        stroke: isSelected ? '#8C7344' : '#D0CBC3',
        lineWidth: isSelected ? 1.5 : 1,
        radius: 8,
        shadowColor: dimmed ? 'transparent' : 'rgba(42, 36, 28, 0.14)',
        shadowBlur: dimmed ? 0 : 8,
        shadowOffsetX: 0,
        shadowOffsetY: 2,
        opacity,
      };
    }

    /** 四边中点的连接点。线仍走原来的正交路径，圆点只标出依附位置。 */
    private drawEdgeAnchors(container: any, width: number, height: number) {
      const rectClass = (this as any).getShape('key')?.constructor || deps.Rect;
      if (!rectClass) return;
      const size = 5;
      const half = size / 2;
      const halfW = width / 2;
      const halfH = height / 2;
      const common = {
        width: size,
        height: size,
        radius: half,
        fill: '#C4BEB6',
        stroke: '#FFFFFF',
        lineWidth: 1,
        pointerEvents: 'none' as const,
      };
      const spots: Array<[string, number, number]> = [
        ['port-top', -half, -halfH - half],
        ['port-bottom', -half, halfH - half],
        ['port-left', -halfW - half, -half],
        ['port-right', halfW - half, -half],
      ];
      for (const [name, x, y] of spots) {
        (this as any).upsert(name, rectClass, { ...common, x, y }, container);
      }
    }

    /**
     * 没有挂视口控制器时，仍按缩放重画，生卒年才能跟着出现。
     * 控制器挂上之后由它在跨过 0.4 时重画视口内的卡片，这里不再监听。
     */
    private ensureZoomRedraw() {
      if (isViewportCullActive()) return;
      const self = this as any;
      if (self._zoomBound) return;
      const graph = self.context?.graph;
      if (!graph || typeof graph.on !== 'function') return;
      self._zoomBound = true;
      graph.on('aftertransform', () => {
        if (self.destroyed) return;
        const zoom = this.readZoom();
        if (self._drawnZoom === zoom || self._zoomRaf) return;
        self._zoomRaf = requestAnimationFrame(() => {
          self._zoomRaf = 0;
          if (self.destroyed) return;
          const nextZoom = this.readZoom();
          if (self._drawnZoom === nextZoom) return;
          this.render(this.parsedAttributes, this);
        });
      });
    }

    /** 极简卡片：清掉头像、生卒年、角标和连接点，姓名放到卡片中心。 */
    private drawLodMinimal(container: any, width: number, dataFromModel: any) {
      this.clearTraditionalShapes(container);
      this.clearCornerMarks(container);
      this.clearEdgeAnchors(container);
      const name: string = dataFromModel?.label || dataFromModel?.data?.name || dataFromModel?.original?.full_name || '';
      if (!deps.GText || !name) return;
      const maxTextWidth = Math.max(8, width - 16);
      (this as any).upsert('trad-name', deps.GText, {
        x: 0,
        y: 0,
        fontSize: 14,
        fontWeight: 700,
        fill: '#2C2416',
        fontFamily: 'Songti SC, STSong, SimSun, Noto Serif SC, serif',
        text: fitTextLines(name, maxTextWidth, 14, 1),
        textAlign: 'center',
        textBaseline: 'middle',
        wordWrap: true,
        wordWrapWidth: maxTextWidth,
        maxLines: 1,
        textOverflow: 'ellipsis',
        pointerEvents: 'none',
      }, container);
    }

    private clearCornerMarks(container: any) {
      const shapeClass = deps.GCircle || (this as any).getShape('key')?.constructor || deps.Rect;
      if (!shapeClass) return;
      for (let i = 0; i < 3; i++) {
        (this as any).upsert(`corner-mark-${i}`, shapeClass, false, container);
      }
    }

    private clearEdgeAnchors(container: any) {
      const rectClass = (this as any).getShape('key')?.constructor || deps.Rect;
      if (!rectClass) return;
      for (const name of ['port-top', 'port-bottom', 'port-left', 'port-right']) {
        (this as any).upsert(name, rectClass, false, container);
      }
    }

    private readZoom(): number {
      try {
        const zoom = (this as any).context?.graph?.getZoom?.();
        if (typeof zoom === 'number' && zoom > 0) return zoom;
      } catch {
        /* graph 尚未就绪 */
      }
      return 1;
    }

    private clearTraditionalShapes(container: any) {
      const rectClass = (this as any).getShape('key')?.constructor || deps.Rect;
      if (rectClass) {
        (this as any).upsert('trad-badge', rectClass, false, container);
        (this as any).upsert('trad-tag', rectClass, false, container);
      }
      for (const name of ['trad-surname', 'trad-meta', 'trad-name', 'trad-years', 'trad-tag-text', 'trad-relation', 'trad-chip-text-0', 'trad-chip-text-1']) {
        (this as any).upsert(name, deps.GText, false, container);
      }
      if (rectClass) {
        (this as any).upsert('trad-chip-0', rectClass, false, container);
        (this as any).upsert('trad-chip-1', rectClass, false, container);
      }
      if (deps.GImage) (this as any).upsert('trad-photo', deps.GImage, false, container);
    }

    /**
     * 自定义 render 已绘制所有文字，禁止默认 label shape 覆盖
     */
    onframe() {
      if ((deps.genealogyStore.treeStyle ?? 'modern') === 'traditional') return;
      this.drawBadgeShapes(this.parsedAttributes, this);
    }

    /**
     * 肖像卡。外框与 VIEW_MODE_SETTINGS.portrait 一致：100×140。
     * 头像是一寸照比例（25:35）的长方形图框，没有照片时也留灰色底框。
     * 坐标从卡片顶边往下量，再换成节点中心坐标系。
     * 每次先清掉旧的 Image / Text，避免和上一帧或横排谱牌叠在一起。
     */
    private drawPortraitContent(
      container: any,
      width: number,
      height: number,
      d: any,
      dataFromModel: any,
    ): void {
      this.clearTraditionalShapes(container);

      const PHOTO_W = 50;
      const PHOTO_H = 70;
      const PHOTO_TOP = 10;
      const NAME_TOP = 90;
      const YEARS_TOP = 115;
      const NAME_FONT = 14;
      const YEARS_FONT = 12;

      const top = -height / 2;
      const photoX = -PHOTO_W / 2;
      const photoY = top + PHOTO_TOP;
      const fullDatum: any = dataFromModel || {};
      const name: string = fullDatum.label || fullDatum.original?.full_name || d?.name || '';
      const photoUrl = d?.photo_url || d?.thumbnail_url || d?.avatar_url || '';
      const years = formatLifeYears(d?.birth_year, d?.death_year, d?.is_living);
      const maxTextWidth = Math.max(8, width - 12);
      const textStyle = {
        fontFamily: 'Songti SC, STSong, SimSun, Noto Serif SC, serif',
        pointerEvents: 'none' as const,
        textAlign: 'center' as const,
        textBaseline: 'top' as const,
      };

      const frameRect = (this as any).getShape('key')?.constructor || deps.Rect;
      if (frameRect) {
        (this as any).upsert('trad-badge', frameRect, {
          x: photoX,
          y: photoY,
          width: PHOTO_W,
          height: PHOTO_H,
          radius: 0,
          fill: '#E6E2DC',
          stroke: '#C8C2B8',
          lineWidth: 1,
          pointerEvents: 'none',
        }, container);
      }

      if (deps.GImage && photoUrl) {
        const inset = 1;
        const photo = (this as any).upsert('trad-photo', deps.GImage, {
          x: photoX + inset,
          y: photoY + inset,
          width: PHOTO_W - inset * 2,
          height: PHOTO_H - inset * 2,
          src: photoUrl,
          pointerEvents: 'none',
        }, container);
        // 上一版用圆形裁切。改成长方形后必须卸掉，否则头像仍是圆的。
        if (photo) {
          const mask = (photo as any)._roundMask;
          if (mask) {
            try { photo.removeChild(mask); } catch { /* 裁切圆已经不在树上 */ }
            (photo as any)._roundMask = null;
          }
          photo.style.clipPath = null;
        }
      } else if (deps.GImage) {
        (this as any).upsert('trad-photo', deps.GImage, false, container);
      }

      if (GText && name) {
        (this as any).upsert('trad-name', GText, {
          ...textStyle,
          x: 0,
          y: top + NAME_TOP,
          fontSize: NAME_FONT,
          fontWeight: 700,
          fill: '#2C2416',
          lineHeight: NAME_FONT,
          wordWrap: true,
          wordWrapWidth: maxTextWidth,
          maxLines: 1,
          textOverflow: 'ellipsis',
          text: fitTextLines(name, maxTextWidth, NAME_FONT, 1),
        }, container);
      } else if (GText) {
        (this as any).upsert('trad-name', GText, false, container);
      }

      if (GText && years) {
        (this as any).upsert('trad-years', GText, {
          ...textStyle,
          x: 0,
          y: top + YEARS_TOP,
          fontSize: YEARS_FONT,
          fontWeight: 400,
          fill: '#8A8178',
          lineHeight: YEARS_FONT,
          wordWrap: true,
          wordWrapWidth: maxTextWidth,
          maxLines: 1,
          textOverflow: 'ellipsis',
          text: fitTextLines(years, maxTextWidth, YEARS_FONT, 1),
        }, container);
      } else if (GText) {
        (this as any).upsert('trad-years', GText, false, container);
      }
    }

    /**
     * 谱牌：左侧圆形头像（无图时用姓氏），右侧姓名和生卒年。
     * 字号不再随 zoom 放大，否则生卒年会画出外框。
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
    ): void {
      void attributes;
      const halfH = height / 2;
      const isMale = d.gender === 'male';
      const isFemale = d.gender === 'female';
      const identity = d.identity_label || '';
      const birthOrder: number | undefined =
        typeof d.birth_order === 'number' && d.birth_order > 0 ? d.birth_order : undefined;
      const fullDatum: any = dataFromModel || {};
      const name: string = fullDatum.label || fullDatum.original?.full_name || d.name || '';
      const relation = d.relation || '';
      const childType = d.child_type || '';
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

      const zoom = this.readZoom();
      // 挂了视口控制器时，0.4 以上恢复全部内容；否则仍按 0.5 隐藏生卒年。
      const showDetail = isViewportCullActive() ? true : zoom >= 0.5;
      const subLabel = !showDetail || deps.genealogyStore.viewMode !== 'su'
        ? ''
        : relation === 'concubine'
          ? '妾'
          : childType === 'ADOPTED'
            ? '养'
            : childType === 'STEP'
              ? '继'
              : '';
      const yearsLine = showDetail
        ? formatLifeYears(d.birth_year, d.death_year, d.is_living)
        : '';
      const detailed = showDetail && deps.genealogyStore.cardDensity === 'detailed';
      const bottomText = detailed
        ? formatDetailLine({
            gender: d.gender,
            birthOrder,
            generationWord: d.generation_word,
            years: yearsLine,
          })
        : yearsLine;
      const detailTags = detailed ? collectDetailTags(d) : [];
      const meta = showDetail
        ? [rankText, identity, subLabel].filter((part, index, list) => part && list.indexOf(part) === index).join(' · ')
        : '';

      const padY = 7;
      const yearsFont = 10;
      const nameFont = width >= 110 ? 15 : 14;
      const metaFont = 9;
      const yearsCenterY = halfH - padY - yearsFont / 2;
      const slot = Math.min(40, Math.max(28, Math.round(Math.min(width * 0.34, height - 28))));
      const slotLeft = -width / 2 + CARD_PADDING_X;
      const slotTop = -slot / 2;
      const textLeft = slotLeft + slot + 8;
      const textRight = width / 2 - CARD_PADDING_X;
      const textMid = (textLeft + textRight) / 2;
      const maxTextWidth = Math.max(8, textRight - textLeft);
      const metaH = meta ? metaFont + 2 : 0;
      const lineH = nameFont + 2;
      const nameLines = detailed ? (height >= 110 ? 2 : 1) : (height >= 90 ? 2 : 1);
      const nameCenterY = showDetail ? (detailed ? -12 - metaH / 2 : -4 - metaH / 2) : 0;
      const surname = Array.from(name)[0] || '氏';
      const photoUrl = d.photo_url || d.thumbnail_url || d.avatar_url || '';
      const hasPhoto = !!photoUrl;
      const sealFill = d.is_main_lineage ? '#F3EAD7' : isMale ? '#E7EEF5' : isFemale ? '#F6E8ED' : '#EEEAE4';
      const sealText = d.is_main_lineage ? '#6E5830' : isMale ? '#3D5870' : isFemale ? '#7A4458' : '#5C564E';
      const graphicRect = (this as any).getShape('key')?.constructor || deps.Rect;
      const textStyle = {
        fontFamily: 'Songti SC, STSong, SimSun, Noto Serif SC, serif',
        pointerEvents: 'none' as const,
      };
      const clip = (lines: number) => ({
        wordWrap: true,
        wordWrapWidth: maxTextWidth,
        maxLines: lines,
        textOverflow: 'ellipsis' as const,
      });

      if (graphicRect) {
        (this as any).upsert('trad-badge', graphicRect, {
          x: slotLeft,
          y: slotTop,
          width: slot,
          height: slot,
          radius: slot / 2,
          fill: sealFill,
          stroke: '#E4DFD8',
          lineWidth: 1,
          pointerEvents: 'none',
        }, container);
      }
      if (deps.GImage && hasPhoto) {
        const photo = (this as any).upsert('trad-photo', deps.GImage, {
          x: slotLeft,
          y: slotTop,
          width: slot,
          height: slot,
          src: photoUrl,
          pointerEvents: 'none',
        }, container);
        // 裁切圆必须挂在图片下面，世界坐标才会跟着卡片走。
        // 单独 new 出来的圆停在画布原点，整张图会被裁没。
        if (photo && deps.GCircle) {
          // 裁切圆挂在图片上，但圆心按卡片坐标算。图片的 x/y 不会传给子节点。
          const cx = slotLeft + slot / 2;
          const cy = slotTop + slot / 2;
          let mask = (photo as any)._roundMask;
          if (!mask) {
            mask = new deps.GCircle({
              style: {
                cx,
                cy,
                r: slot / 2,
                visibility: 'hidden',
                pointerEvents: 'none',
              },
            });
            photo.appendChild(mask);
            photo.style.clipPath = mask;
            (photo as any)._roundMask = mask;
          } else {
            mask.style.cx = cx;
            mask.style.cy = cy;
            mask.style.r = slot / 2;
          }
        }
      } else if (deps.GImage) {
        (this as any).upsert('trad-photo', deps.GImage, false, container);
      }
      if (graphicRect) {
        (this as any).upsert('trad-tag', graphicRect, false, container);
      }

      if (GText && !hasPhoto) {
        (this as any).upsert('trad-surname', GText, {
          ...textStyle,
          x: slotLeft + slot / 2,
          y: slotTop + slot / 2,
          fontSize: Math.min(16, Math.round(slot * 0.42)),
          fontWeight: 700,
          fill: sealText,
          text: surname,
          textAlign: 'center',
          textBaseline: 'middle',
        }, container);
      } else if (GText) {
        (this as any).upsert('trad-surname', GText, false, container);
      }

      if (GText && meta) {
        (this as any).upsert('trad-meta', GText, {
          ...textStyle,
          ...clip(1),
          x: textMid,
          y: nameCenterY - (nameLines * lineH) / 2 - metaFont,
          fontSize: metaFont,
          fill: '#8A8178',
          text: fitTextLines(meta, maxTextWidth, metaFont, 1),
          textAlign: 'center',
          textBaseline: 'top',
        }, container);
      } else if (GText) {
        (this as any).upsert('trad-meta', GText, false, container);
      }
      if (GText) {
        (this as any).upsert('trad-tag-text', GText, false, container);
        (this as any).upsert('trad-relation', GText, false, container);
      }

      if (GText) {
        (this as any).upsert('trad-name', GText, {
          ...textStyle,
          ...clip(nameLines),
          x: textMid,
          y: showDetail ? nameCenterY : 0,
          fontSize: nameFont,
          fontWeight: 700,
          fill: '#2C2416',
          lineHeight: lineH,
          text: fitTextLines(name, maxTextWidth, nameFont, showDetail ? nameLines : 1),
          textAlign: 'center',
          textBaseline: 'middle',
        }, container);
      }

      this.drawDetailChips(container, graphicRect, detailTags, textLeft, maxTextWidth, textStyle);

      if (GText && bottomText) {
        (this as any).upsert('trad-years', GText, {
          ...textStyle,
          ...clip(1),
          x: textMid,
          y: yearsCenterY,
          fontSize: yearsFont,
          fontWeight: 400,
          fill: '#8A8178',
          text: fitTextLines(bottomText, maxTextWidth, yearsFont, 1),
          textAlign: 'center',
          textBaseline: 'middle',
        }, container);
      } else if (GText) {
        (this as any).upsert('trad-years', GText, false, container);
      }

      d.identity_label = identity;
      d.rank_text = rankText;
    }

    /** 详情模式姓名和生卒之间的小色块。没有标签时把上一帧的色块清掉。 */
    private drawDetailChips(
      container: any,
      graphicRect: any,
      tags: string[],
      textLeft: number,
      maxTextWidth: number,
      textStyle: Record<string, unknown>,
    ) {
      const chipFont = 9;
      const chipH = 14;
      let cursor = textLeft;
      const y = 4;
      for (let i = 0; i < 2; i++) {
        const tag = tags[i];
        const chipName = `trad-chip-${i}`;
        const textName = `trad-chip-text-${i}`;
        if (!tag || !graphicRect) {
          if (graphicRect) (this as any).upsert(chipName, graphicRect, false, container);
          if (GText) (this as any).upsert(textName, GText, false, container);
          continue;
        }
        const chipW = Math.min(maxTextWidth, Math.ceil(estimateTextWidth(tag, chipFont) + 8));
        if (cursor + chipW > textLeft + maxTextWidth && i > 0) {
          (this as any).upsert(chipName, graphicRect, false, container);
          if (GText) (this as any).upsert(textName, GText, false, container);
          continue;
        }
        const early = tag === '早夭';
        (this as any).upsert(chipName, graphicRect, {
          x: cursor,
          y,
          width: chipW,
          height: chipH,
          radius: 3,
          fill: early ? '#F3E4E4' : '#F3EAD7',
          stroke: early ? '#E4C8C8' : '#E4D7B8',
          lineWidth: 1,
          pointerEvents: 'none',
        }, container);
        if (GText) {
          (this as any).upsert(textName, GText, {
            ...textStyle,
            x: cursor + chipW / 2,
            y: y + chipH / 2,
            fontSize: chipFont,
            fill: early ? '#7A4458' : '#6E5830',
            text: tag,
            textAlign: 'center',
            textBaseline: 'middle',
            pointerEvents: 'none',
          }, container);
        }
        cursor += chipW + 4;
      }
    }

    /** 右上角 8×8 色点。鼠标悬停时由画布读 shape.__markTip。 */
    private drawCornerMarks(container: any, width: number, height: number, d: any) {
      const marks = collectCornerMarks(d);
      if (d) d.corner_tips = marks.map((mark) => mark.tip);
      const useCircle = !!deps.GCircle;
      const shapeClass = deps.GCircle || (this as any).getShape('key')?.constructor || deps.Rect;
      for (let i = 0; i < 3; i++) {
        const shapeName = `corner-mark-${i}`;
        const mark = marks[i];
        if (!mark || !shapeClass) {
          if (shapeClass) (this as any).upsert(shapeName, shapeClass, false, container);
          continue;
        }
        const r = 4;
        const cx = width / 2 - 10 - i * 12;
        const cy = -height / 2 + 10;
        const style = useCircle
          ? {
              cx,
              cy,
              r,
              fill: mark.color,
              stroke: '#FFFFFF',
              lineWidth: 1,
              cursor: 'pointer',
              zIndex: 6,
            }
          : {
              x: cx - r,
              y: cy - r,
              width: r * 2,
              height: r * 2,
              radius: r,
              fill: mark.color,
              stroke: '#FFFFFF',
              lineWidth: 1,
              cursor: 'pointer',
              zIndex: 6,
            };
        const shape = (this as any).upsert(shapeName, shapeClass, style, container);
        if (shape) {
          shape.name = shapeName;
          shape.__markTip = mark.tip;
        }
      }
    }
  }

  return GenealogyNode;
}