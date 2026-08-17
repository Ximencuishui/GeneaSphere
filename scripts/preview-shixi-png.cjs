/* eslint-disable */
/**
 * 世系表开本 PNG 预览图（不依赖数据库）
 * 渲染 HTML 预览页为 PNG,与 PDF 排版一致(竖排 + 双层边框 + 红色姓名 + 顶端连接线)。
 * 验收用:Read 工具可直接查看 PNG。
 */
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer-core');

const entries = [
  { generation: 0, full_name: '朱熹', birth_year: 1130, death_year: 1200, is_living: false, courtesy_name: '元晦', native_place: '婺源', burial_place: '建阳', spouses: [{ name: '刘氏', native_place: '建阳' }], children: [] },
  { generation: 0, full_name: '刘氏', birth_year: 1132, death_year: 1195, is_living: false, native_place: '建阳', burial_place: '建阳', spouses: [], children: [] },
  { generation: 1, full_name: '朱塾', birth_year: 1153, death_year: 1191, is_living: false, native_place: '婺源', burial_place: '建阳', spouses: [{ name: '林氏' }, { name: '郑氏' }], children: [] },
  { generation: 1, full_name: '朱埜', birth_year: 1156, death_year: 1212, is_living: false, native_place: '婺源', burial_place: '徽州', spouses: [{ name: '赵氏' }], children: [] },
  { generation: 1, full_name: '朱在', birth_year: 1169, death_year: 1239, is_living: false, native_place: '婺源', burial_place: '崇安', spouses: [{ name: '范氏' }], children: [] },
  { generation: 2, full_name: '朱鉴', birth_year: 1190, death_year: 1258, is_living: false, burial_place: '建阳', spouses: [{ name: '郑氏' }], children: [] },
  { generation: 2, full_name: '朱铨', birth_year: 1195, death_year: 1260, is_living: false, burial_place: '建阳', spouses: [{ name: '王氏' }], children: [] },
  { generation: 2, full_name: '朱潜', birth_year: 1200, death_year: 1270, is_living: false, burial_place: '徽州', spouses: [{ name: '孙氏' }], children: [] },
  { generation: 2, full_name: '朱鋆', birth_year: 1205, death_year: 1275, is_living: false, burial_place: '崇安', spouses: [{ name: '徐氏' }], children: [] },
  { generation: 3, full_name: '朱浚', birth_year: 1220, death_year: 1290, is_living: false, spouses: [{ name: '陈氏' }], children: [] },
  { generation: 3, full_name: '朱洪', birth_year: 1225, death_year: 1295, is_living: false, spouses: [{ name: '周氏' }], children: [] },
  { generation: 3, full_name: '朱沐', birth_year: 1230, death_year: 1300, is_living: false, spouses: [{ name: '吴氏' }], children: [] },
  { generation: 3, full_name: '朱深', birth_year: 1235, death_year: 1305, is_living: false, spouses: [{ name: '何氏' }], children: [] },
  { generation: 4, full_name: '朱桂', birth_year: 1252, death_year: 1320, is_living: false, spouses: [{ name: '郭氏' }], children: [] },
  { generation: 4, full_name: '朱桐', birth_year: 1258, death_year: 1325, is_living: false, spouses: [{ name: '马氏' }], children: [] },
  { generation: 4, full_name: '朱森', birth_year: 1263, death_year: 1330, is_living: false, spouses: [{ name: '黄氏' }], children: [] },
  { generation: 4, full_name: '朱柄', birth_year: 1268, death_year: 1335, is_living: false, spouses: [{ name: '罗氏' }], children: [] },
];

const SHIXI_CSS = `
  body{margin:0;padding:0;background:#ece4d2;font-family:'KaiTi','SimSun','Songti SC','Microsoft YaHei',serif;}
  .shixi-page{
    width:180mm; height:260mm;
    margin:20px auto;
    padding:16mm 12mm 14mm;
    box-sizing:border-box;
    position:relative;
    border:3px double #333;
    background:#fffdf6;
    writing-mode:vertical-rl;
    font-family:'KaiTi','SimSun','Songti SC','Microsoft YaHei',serif;
  }
  .shixi-page .shixi-page-dot{position:absolute; top:6mm; right:6mm; width:5mm; height:5mm; border:1.5px solid #333; border-radius:50%; background:#fffdf6;}
  .shixi-page .shixi-title{position:absolute; bottom:6mm; left:6mm; writing-mode:vertical-rl; font-family:'KaiTi','Songti SC',serif; color:#b22222; font-size:13pt; letter-spacing:6px; line-height:1.4;}
  .shixi-grid{display:flex; flex-direction:row-reverse; height:100%; gap:3mm; align-items:stretch;}
  .shixi-col{flex:1; position:relative; padding:14mm 3mm 4mm; border-left:1px solid #888; display:flex; flex-direction:column; align-items:center; writing-mode:vertical-rl;}
  .shixi-col-header{position:absolute; top:0; right:0; background:#d9d9d9; border:1px solid #333; writing-mode:horizontal-tb; font-family:'KaiTi','Songti SC',serif; color:#b22222; font-size:13pt; font-weight:bold; padding:4px 10px; letter-spacing:4px;}
  .shixi-col::before{content:''; position:absolute; top:-6px; left:50%; transform:translateX(-50%); width:10px; height:10px; border:2px solid #333; border-radius:50%; background:#fffdf6;}
  .shixi-col::after{content:''; position:absolute; top:-1px; left:50%; width:100%; height:0; border-top:1px solid #333;}
  .shixi-person{margin:6mm 0; text-align:center; max-width:30mm; writing-mode:vertical-rl; line-height:1.9;}
  .shixi-name{font-family:'KaiTi','Songti SC',serif; font-size:14pt; font-weight:bold; margin-bottom:4px; letter-spacing:2px; color:#b22222;}
  .shixi-line{font-size:9pt; color:#1a1a1a; margin:2px 0; line-height:1.8;}
  .shixi-bio{font-size:9pt; color:#1a1a1a; margin-top:6px; line-height:1.9; text-align:justify;}
  .preview-header{text-align:center;font-family:'KaiTi',serif;font-size:18px;color:#5d4037;padding:18px 0 8px;margin:0;background:#ece4d2;}
  .preview-sub{text-align:center;font-size:12px;color:#888;margin:0;background:#ece4d2;padding-bottom:18px;}
`;

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderPerson(e) {
  const lines = [];
  lines.push(`<div class="shixi-name">${esc(e.full_name)}</div>`);
  if (e.birth_year || e.death_year || e.is_living) {
    const b = e.birth_year ? `${e.birth_year}` : '?';
    const d = e.is_living ? '今' : e.death_year ? `${e.death_year}` : '?';
    lines.push(`<div class="shixi-line">${b}-${d}</div>`);
  }
  if (e.courtesy_name) lines.push(`<div class="shixi-line">字${esc(e.courtesy_name)}</div>`);
  if (e.native_place) lines.push(`<div class="shixi-line">籍${esc(e.native_place)}</div>`);
  if (e.burial_place) lines.push(`<div class="shixi-line">葬${esc(e.burial_place)}</div>`);
  if (e.spouses && e.spouses.length) {
    const s = e.spouses.map((sp) => `${esc(sp.name)}${sp.native_place ? `（${esc(sp.native_place)}）` : ''}`).join('、');
    lines.push(`<div class="shixi-line">配${s}</div>`);
  }
  return `<div class="shixi-person">${lines.join('')}</div>`;
}

function renderPage(gens, byGen, title) {
  const cols = gens.map((g) => {
    const list = (byGen.get(g) || []).map(renderPerson).join('');
    return `<div class="shixi-col"><div class="shixi-col-header">第${g + 1}世</div>${list}</div>`;
  }).join('');
  return `<section class="shixi-page">
    <div class="shixi-page-dot"></div>
    <div class="shixi-title">${title}</div>
    <div class="shixi-grid">${cols}</div>
  </section>`;
}

(async () => {
  const byGen = new Map();
  for (const e of entries) {
    if (!byGen.has(e.generation)) byGen.set(e.generation, []);
    byGen.get(e.generation).push(e);
  }
  const sortedGens = [...byGen.keys()].sort((a, b) => a - b);
  const minGen = sortedGens[0];
  const maxGen = sortedGens[sortedGens.length - 1];
  const title = `族谱第${minGen + 1}世至第${maxGen + 1}世世系表`;
  const pageHtml = renderPage(sortedGens, byGen, title);

  const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"/><style>${SHIXI_CSS}</style></head><body>
    <h1 class="preview-header">朱熹族谱（演示） · 世系表开本样张</h1>
    <p class="preview-sub">PR #1 传统中式开本验收 · 第 1 页,共 1 页</p>
    ${pageHtml}
  </body></html>`;

  const outDir = path.join(__dirname, 'temp');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const pngPath = path.join(outDir, 'shixi-sample.png');
  const htmlPath = path.join(outDir, 'shixi-sample.html');
  fs.writeFileSync(htmlPath, html, 'utf-8');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 900, height: 1200, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: 'load' });
    // 截 .shixi-page 元素(裁掉外边)
    const el = await page.$('.shixi-page');
    if (!el) throw new Error('shixi-page 元素未找到');
    await el.screenshot({ path: pngPath, omitBackground: false });
    console.log(`PNG 已生成: ${pngPath}`);
    const stat = fs.statSync(pngPath);
    console.log(`文件大小: ${(stat.size / 1024).toFixed(1)} KB`);
  } finally {
    await browser.close();
  }
})().catch((err) => {
  console.error('生成失败:', err);
  process.exit(1);
});
