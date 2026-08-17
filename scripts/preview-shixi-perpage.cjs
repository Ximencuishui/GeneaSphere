/* eslint-disable */
/**
 * 逐页 PNG: 从 PDF 中提取每一页渲染为独立 PNG
 * 验收高密度世代页(第 16-20 世)的拥挤度
 */
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer-core');
const { generateDemoEntries } = require('./demo-data-pure.cjs');

const SHIXI_CSS = require('./shixi-css.cjs');
const { buildShixiTablePages } = require('./shixi-render.cjs');

(async () => {
  const entries = generateDemoEntries();
  const pages = buildShixiTablePages(entries, 5, false);

  const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"/><style>
    body{font-family:'KaiTi','SimSun','Microsoft YaHei',serif;color:#333;margin:0;padding:0;background:#ece4d2;}
    ${SHIXI_CSS}
  </style></head><body>
    ${pages.join('\n')}
  </body></html>`;

  const outDir = path.join(__dirname, 'temp');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 900, height: 1300, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: 'load', timeout: 60000 });

    const pageEls = await page.$$('.shixi-page');
    console.log(`检测到 ${pageEls.length} 个世系表页面`);

    for (let i = 0; i < pageEls.length; i++) {
      const pngPath = path.join(outDir, `shixi-demo-page-${i + 1}.png`);
      await pageEls[i].screenshot({ path: pngPath });
      const stat = fs.statSync(pngPath);
      console.log(`第 ${i + 1} 页 PNG 已生成: ${pngPath} (${(stat.size / 1024).toFixed(1)} KB)`);
    }
  } finally {
    await browser.close();
  }
})().catch((err) => {
  console.error('生成失败:', err);
  process.exit(1);
});