/* eslint-disable */
// 移植自 cepu.service.ts: renderShixiPersonHtml + buildShixiTablePages 纯函数版
// 升级: 自动密集模式 + 单代人数过多时左右双列分页(共 N 页 / 第 X 列)

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderPerson(e) {
  const lines = [];
  lines.push(`<div class="shixi-name">${esc(e.full_name)}</div>`);
  if (e.birth_year || e.death_year) {
    const b = e.birth_year ? `${e.birth_year}` : '?';
    const d = e.death_year ? `${e.death_year}` : (e.is_living ? '今' : '?');
    lines.push(`<div class="shixi-line">${b}-${d}</div>`);
  }
  if (e.native_place) lines.push(`<div class="shixi-line">籍${esc(e.native_place)}</div>`);
  if (e.branch) lines.push(`<div class="shixi-line">房${esc(e.branch)}</div>`);
  return `<div class="shixi-person">${lines.join('')}</div>`;
}

/**
 * 渲染一页世系表
 * @param {number[]} gens 该页包含的世代号
 * @param {Map<number, Array>} byGen 完整按世代分组
 * @param {string} title 页面标题
 * @param {object} [opts] 渲染选项
 * @param {string} [opts.density] 'normal' | 'condense' | 'condense-strong'
 * @param {string} [opts.connector] 是否画顶端连接线 'on' | 'off'
 */
function renderPage(gens, byGen, title, opts = {}) {
  const density = opts.density || 'normal';
  const connector = opts.connector !== 'off';
  const classes = ['shixi-page'];
  if (density === 'condense') classes.push('condense');
  if (density === 'condense-strong') classes.push('condense-strong');
  if (!connector) classes.push('no-connector');
  const cols = gens.map((g) => {
    const list = (byGen.get(g) || []).map(renderPerson).join('');
    return `<div class="shixi-col"><div class="shixi-col-header">第${g}世</div>${list}</div>`;
  }).join('');
  return `<section class="${classes.join(' ')}">
    <div class="shixi-page-dot"></div>
    <div class="shixi-title">${title}</div>
    <div class="shixi-grid">${cols}</div>
  </section>`;
}

/**
 * 渲染"单代 + 左右双列"页(用于单代人数过多时)
 * 同一代拆为左右两列(右列 = 人 1~N/2,左列 = N/2+1~N),共 1 页
 */
function renderSplitColPage(gen, people, opts = {}) {
  const density = opts.density || 'condense-strong';
  const classes = ['shixi-page', density, 'split-page'];
  if (opts.connector === 'off') classes.push('no-connector');
  const half = Math.ceil(people.length / 2);
  const leftArr = people.slice(half);
  const rightArr = people.slice(0, half);
  const leftHtml = leftArr.map(renderPerson).join('');
  const rightHtml = rightArr.map(renderPerson).join('');
  const title = `族谱第${gen}世世系表(${people.length}人)`;
  return `<section class="${classes.join(' ')}">
    <div class="shixi-page-dot"></div>
    <div class="shixi-title">${title}</div>
    <div class="shixi-grid">
      <div class="shixi-col"><div class="shixi-col-header">第${gen}世·前半</div>${rightHtml}</div>
      <div class="shixi-col"><div class="shixi-col-header">第${gen}世·后半</div>${leftHtml}</div>
    </div>
  </section>`;
}

/**
 * 根据 chunk 的总人数选择密度模式
 * @param {number[]} chunkGens 当前页包含的世代号
 * @param {Map<number, Array>} byGen 完整按世代分组
 */
function pickDensity(chunkGens, byGen) {
  let maxPerGen = 0;
  for (const g of chunkGens) {
    const list = byGen.get(g) || [];
    if (list.length > maxPerGen) maxPerGen = list.length;
  }
  if (maxPerGen > 12) return 'condense-strong';
  if (maxPerGen > 6) return 'condense';
  return 'normal';
}

/**
 * 按"每页 N 世"分页 + 单代人数超过阈值时:
 * - ≤16 人: 启用 condense-strong
 * - >16 人: 启用左右双列 split-page(单页容量翻倍到 32)
 */
function buildShixiTablePages(entries, pageGen = 5, isFemaleOnly = false) {
  const byGen = new Map();
  for (const e of entries) {
    if (isFemaleOnly && e.gender !== 'female') continue;
    if (!byGen.has(e.generation)) byGen.set(e.generation, []);
    byGen.get(e.generation).push(e);
  }
  const sortedGens = [...byGen.keys()].sort((a, b) => a - b);
  for (const arr of byGen.values()) {
    arr.sort((a, b) => {
      if (a.gender !== b.gender) return a.gender === 'male' ? -1 : 1;
      if (a.branch !== b.branch) return (a.branch || '').localeCompare(b.branch || '');
      return a.birth_year - b.birth_year;
    });
  }
  const HARD_LIMIT = 16;
  const pages = [];
  for (let i = 0; i < sortedGens.length; i += pageGen) {
    const chunkGens = sortedGens.slice(i, i + pageGen);
    let maxPerGen = 0;
    for (const g of chunkGens) {
      const list = byGen.get(g) || [];
      if (list.length > maxPerGen) maxPerGen = list.length;
    }
    if (maxPerGen <= HARD_LIMIT) {
      // 正常一页
      const density = pickDensity(chunkGens, byGen);
      const title = chunkGens.length === 1
        ? `族谱第${chunkGens[0]}世世系表`
        : `族谱第${chunkGens[0]}世至第${chunkGens[chunkGens.length - 1]}世世系表`;
      pages.push(renderPage(chunkGens, byGen, title, { density }));
    } else {
      // 单代人数过多: 该代用左右双列,其它代用标准密度
      // 简化:整页只用该一代,左右双列
      for (const g of chunkGens) {
        const list = byGen.get(g) || [];
        if (list.length <= HARD_LIMIT) {
          const title = `族谱第${g}世世系表`;
          const density = pickDensity([g], byGen);
          pages.push(renderPage([g], new Map([[g, list]]), title, { density }));
        } else {
          pages.push(renderSplitColPage(g, list, { density: 'condense-strong' }));
        }
      }
    }
  }
  return pages;
}

module.exports = { buildShixiTablePages, renderPerson, renderPage, renderSplitColPage, esc, pickDensity };