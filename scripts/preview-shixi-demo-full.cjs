/* eslint-disable */
/**
 * 朱熹族谱 1000 人 demo 数据 → 世系表开本 PDF
 * 数据源: scripts/demo-data-pure.cjs(剥离 Prisma,与 demo-seed 行为一致)
 * 渲染: scripts/shixi-render.cjs (与 cepu.service.ts 严格同构)
 * 浏览器: Edge headless (puppeteer-core)
 */
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer-core');
const { generateDemoEntries, TARGET_POPULATION } = require('./demo-data-pure.cjs');
const { buildShixiTablePages, esc } = require('./shixi-render.cjs');

// 与 cepu.service.ts 中 shixiTableCss() 严格一致(含 .condense / .condense-strong / .split-page)
const SHIXI_CSS = `
  .shixi-page{
    width:180mm; height:260mm;
    margin:0 auto 8mm;
    padding:16mm 12mm 14mm;
    box-sizing:border-box;
    position:relative;
    border:3px double #333;
    background:#fffdf6;
    writing-mode:vertical-rl;
    font-family:'KaiTi','SimSun','Songti SC','Microsoft YaHei',serif;
    page-break-after:always;
    break-after:page;
  }
  .shixi-page .shixi-page-dot{position:absolute; top:6mm; right:6mm; width:5mm; height:5mm; border:1.5px solid #333; border-radius:50%; background:#fffdf6;}
  .shixi-page .shixi-title{position:absolute; bottom:6mm; left:6mm; writing-mode:vertical-rl; font-family:'KaiTi','Songti SC',serif; color:#b22222; font-size:13pt; letter-spacing:6px; line-height:1.4;}
  .shixi-grid{display:flex; flex-direction:row-reverse; height:100%; gap:3mm; align-items:stretch;}
  .shixi-col{flex:1; position:relative; padding:14mm 3mm 4mm; border-left:1px solid #888; display:flex; flex-direction:column; align-items:center; writing-mode:vertical-rl; min-height:0;}
  .shixi-col:last-child{border-left:1px solid #888;}
  .shixi-col-header{position:absolute; top:0; right:0; background:#d9d9d9; border:1px solid #333; writing-mode:horizontal-tb; font-family:'KaiTi','Songti SC',serif; color:#b22222; font-size:13pt; font-weight:bold; padding:4px 10px; letter-spacing:4px;}
  .shixi-col::before{content:''; position:absolute; top:-6px; left:50%; transform:translateX(-50%); width:10px; height:10px; border:2px solid #333; border-radius:50%; background:#fffdf6;}
  .shixi-col::after{content:''; position:absolute; top:-1px; left:50%; width:100%; height:0; border-top:1px solid #333;}
  .shixi-person{margin:3mm 0; text-align:center; max-width:30mm; writing-mode:vertical-rl; line-height:1.7; flex-shrink:0;}
  .shixi-name{font-family:'KaiTi','Songti SC',serif; font-size:13pt; font-weight:bold; margin-bottom:3px; letter-spacing:2px; color:#b22222;}
  .shixi-line{font-size:8.5pt; color:#1a1a1a; margin:1px 0; line-height:1.6;}
  .shixi-bio{font-size:8.5pt; color:#1a1a1a; margin-top:4px; line-height:1.7; text-align:justify;}
  /* 中等密集:7-12 人/代 */
  .shixi-page.condense .shixi-person{margin:2mm 0; line-height:1.5;}
  .shixi-page.condense .shixi-name{font-size:11pt; margin-bottom:2px;}
  .shixi-page.condense .shixi-line, .shixi-page.condense .shixi-bio{font-size:8pt; line-height:1.5;}
  /* 强密集:>12 人/代 */
  .shixi-page.condense-strong .shixi-person{margin:1.5mm 0; line-height:1.3;}
  .shixi-page.condense-strong .shixi-name{font-size:10pt; margin-bottom:1px;}
  .shixi-page.condense-strong .shixi-line, .shixi-page.condense-strong .shixi-bio{font-size:7.5pt; line-height:1.3;}
  /* 不显示连接线 */
  .shixi-page.no-connector .shixi-col::before,
  .shixi-page.no-connector .shixi-col::after{display:none;}
  /* 封面 */
  .cover-page{width:180mm; height:260mm; margin:0 auto 8mm; padding:60mm 30mm; box-sizing:border-box; border:3px double #333; background:#fffdf6; font-family:'KaiTi','Songti SC',serif; writing-mode:horizontal-tb; page-break-after:always;}
  .cover-page h1{font-size:36pt; color:#b22222; text-align:center; margin:0 0 30mm; letter-spacing:8px;}
  .cover-page .sub{font-size:18pt; color:#333; text-align:center; margin:0 0 50mm; letter-spacing:4px;}
  .cover-page .meta{font-size:14pt; color:#666; text-align:center; margin:10mm 0; line-height:2.4;}
`;

// esc 由 shixi-render.cjs 提供

(async () => {
  console.log('生成朱熹族谱 demo 数据(目标 1000 人)...');
  const entries = generateDemoEntries();
  console.log(`数据生成完毕: ${entries.length} 人`);

  // 统计
  const byGen = new Map();
  for (const e of entries) {
    if (!byGen.has(e.generation)) byGen.set(e.generation, 0);
    byGen.set(e.generation, byGen.get(e.generation) + 1);
  }
  const gensArr = [...byGen.entries()].sort((a, b) => a[0] - b[0]);
  console.log('世代分布:', gensArr.map(([g, n]) => `第${g}世 ${n}人`).join(' / '));
  console.log(`共 ${gensArr.length} 代,${entries.length} 人`);

  // 男性版本(默认世系表只看男丁,符合传统族谱惯例)
  const pagesMale = buildShixiTablePages(entries, 5, false);
  console.log(`男性世系表页数: ${pagesMale.length}`);

  const totalPages = pagesMale.length;

  // 封面
  const cover = `<section class="cover-page">
    <h1>朱熹族谱</h1>
    <p class="sub">世系表开本</p>
    <p class="meta">始祖：朱 熹（1130-1200）</p>
    <p class="meta">男丁世系: ${entries.filter(e => e.gender === 'male').length} 位</p>
    <p class="meta">总人数: ${entries.length} 位</p>
    <p class="meta">共 ${gensArr.length} 代 · ${totalPages} 页</p>
    <p class="meta">GeneaSphere · 演示版</p>
  </section>`;

  const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"/><style>
    body{font-family:'KaiTi','SimSun','Microsoft YaHei',serif;color:#333;margin:0;padding:0;}
    ${SHIXI_CSS}
  </style></head><body>
    ${cover}
    ${pagesMale.join('\n')}
  </body></html>`;

  const outDir = path.join(__dirname, 'temp');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const htmlPath = path.join(outDir, 'shixi-demo-full.html');
  const pdfPath = path.join(outDir, 'shixi-demo-full.pdf');
  const pngPath = path.join(outDir, 'shixi-demo-full.png');
  fs.writeFileSync(htmlPath, html, 'utf-8');

  console.log('启动 Edge headless...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load', timeout: 60000 });
    await page.emulateMediaType('print');

    // 生成 PDF
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '12mm', right: '10mm', bottom: '16mm', left: '10mm' },
      displayHeaderFooter: true,
      headerTemplate: `<div style="font-size:9px;color:#888;width:100%;text-align:center;">朱熹族谱 · 世系表开本 · ${new Date().toLocaleDateString('zh-CN')}</div>`,
      footerTemplate: `<div style="font-size:9px;color:#888;width:100%;text-align:center;">第 <span class="pageNumber"></span> 页,共 <span class="totalPages"></span> 页</div>`,
    });
    fs.writeFileSync(pdfPath, Buffer.from(pdf));
    console.log(`PDF 已生成: ${pdfPath}`);
    console.log(`文件大小: ${(pdf.length / 1024).toFixed(1)} KB`);

    // 生成第一页 PNG(封面 + 首页)
    const box = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight }));
    await page.setViewport({ width: 900, height: Math.min(box.h, 2400), deviceScaleFactor: 2 });
    const el = await page.$('body');
    await el.screenshot({ path: pngPath });
    const stat = fs.statSync(pngPath);
    console.log(`预览 PNG 已生成: ${pngPath} (${(stat.size / 1024).toFixed(1)} KB)`);
  } finally {
    await browser.close();
  }
})().catch((err) => {
  console.error('生成失败:', err);
  process.exit(1);
});