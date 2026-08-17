/* eslint-disable */
/**
 * 多页世系表开本样张(12 世 → 3 页)
 * 验证翻页后标题切换、世代衔接。
 */
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer-core');

// 12 世 mock 数据(简化版,每世 3 个男性,共 36 人)
const surnames = ['朱熹','朱塾','朱埜','朱在','朱鉴','朱铨','朱潜','朱鋆','朱浚','朱洪','朱沐','朱深','朱桂','朱桐','朱森','朱柄'];
const ziBei = ['熹','塾','埜','在','鉴','铨','潜','鋆','浚','洪','沐','深'];
const nameChars = ['康','宁','安','平','泰','昌','盛','荣','华','耀','明','德','仁','义','礼','智','信','忠','孝'];
const spouseSurnames = ['刘','陈','张','王','李','赵'];
const birthplace = ['婺源','徽州','建阳','崇安','武夷山'];

function pick(arr, i) { return arr[i % arr.length]; }

const entries = [];
for (let g = 0; g < 12; g++) {
  const born = 1130 + g * 30;
  // 第一世: 朱熹 + 刘氏
  if (g === 0) {
    entries.push({ generation: g, full_name: '朱熹', birth_year: 1130, death_year: 1200, courtesy_name: '元晦', native_place: '婺源', burial_place: '建阳', spouses: [{ name: '刘氏' }] });
    entries.push({ generation: g, full_name: '刘氏', birth_year: 1132, death_year: 1195, native_place: '建阳', burial_place: '建阳', spouses: [] });
  }
  for (let i = 0; i < 3; i++) {
    const idx = g * 3 + i + (g === 0 ? 2 : 0);
    const name = idx < surnames.length ? surnames[idx] : `${pick(ziBei, idx)}${pick(nameChars, idx)}`;
    entries.push({
      generation: g,
      full_name: name,
      birth_year: born + i * 5,
      death_year: born + i * 5 + 70,
      native_place: pick(birthplace, idx),
      burial_place: pick(birthplace, idx + 1),
      courtesy_name: pick(nameChars, idx + 3),
      spouses: [{ name: `${pick(spouseSurnames, idx)}氏` }],
    });
  }
}

const SHIXI_CSS = `
  body{margin:0;padding:0;background:#ece4d2;font-family:'KaiTi','SimSun','Songti SC','Microsoft YaHei',serif;}
  .shixi-page{
    width:180mm; height:260mm;
    margin:18px auto;
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
  .preview-header{text-align:center;font-family:'KaiTi',serif;font-size:18px;color:#5d4037;padding:18px 0 8px;margin:0;background:#ece4d2;}
  .preview-sub{text-align:center;font-size:12px;color:#888;margin:0;background:#ece4d2;padding-bottom:18px;}
`;

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function renderPerson(e) {
  const lines = [];
  lines.push(`<div class="shixi-name">${esc(e.full_name)}</div>`);
  if (e.birth_year || e.death_year) {
    lines.push(`<div class="shixi-line">${e.birth_year}-${e.death_year}</div>`);
  }
  if (e.courtesy_name) lines.push(`<div class="shixi-line">字${esc(e.courtesy_name)}</div>`);
  if (e.native_place) lines.push(`<div class="shixi-line">籍${esc(e.native_place)}</div>`);
  if (e.burial_place) lines.push(`<div class="shixi-line">葬${esc(e.burial_place)}</div>`);
  if (e.spouses && e.spouses.length) {
    lines.push(`<div class="shixi-line">配${e.spouses.map((sp) => esc(sp.name)).join('、')}</div>`);
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
  // 按 generation 分组
  const byGen = new Map();
  for (const e of entries) {
    if (!byGen.has(e.generation)) byGen.set(e.generation, []);
    byGen.get(e.generation).push(e);
  }
  const sortedGens = [...byGen.keys()].sort((a, b) => a - b);
  const PAGE_GEN = 4; // 每页 4 世
  const totalPages = Math.ceil(sortedGens.length / PAGE_GEN);
  const pages = [];
  for (let p = 0; p < totalPages; p++) {
    const chunk = sortedGens.slice(p * PAGE_GEN, (p + 1) * PAGE_GEN);
    const title = `族谱第${chunk[0] + 1}世至第${chunk[chunk.length - 1] + 1}世世系表`;
    pages.push(renderPage(chunk, byGen, title));
  }

  const pageNote = pages.map((_, i) => `<span>第 ${i + 1} 页,共 ${totalPages} 页</span>`).join(' · ');

  const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"/><style>${SHIXI_CSS}</style></head><body>
    <h1 class="preview-header">朱熹族谱（演示） · 多页世系表开本</h1>
    <p class="preview-sub">每页 ${PAGE_GEN} 世,共 ${totalPages} 页 · ${pageNote}</p>
    ${pages.join('\n')}
  </body></html>`;

  const outDir = path.join(__dirname, 'temp');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const pngPath = path.join(outDir, 'shixi-multi-page.png');
  const htmlPath = path.join(outDir, 'shixi-multi-page.html');
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
    const el = await page.$('body');
    const box = await el.boundingBox();
    await page.setViewport({ width: 900, height: Math.ceil(box.height) + 40, deviceScaleFactor: 2 });
    await page.screenshot({ path: pngPath, fullPage: true });
    console.log(`多页 PNG 已生成: ${pngPath}`);
    const stat = fs.statSync(pngPath);
    console.log(`文件大小: ${(stat.size / 1024).toFixed(1)} KB`);
  } finally {
    await browser.close();
  }
})().catch((err) => {
  console.error('生成失败:', err);
  process.exit(1);
});