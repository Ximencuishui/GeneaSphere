/**
 * Puppeteer 渲染脚本
 * 由 worker.py 调用，用于 HTML → PDF/PNG 渲染
 *
 * 使用方式:
 *   node puppeteer_render.js --url <url|file://path> --output <file> --format pdf|png
 *
 * 前提: 需要在当前目录或全局安装了 puppeteer
 *   npm install puppeteer
 */

const puppeteer = require('puppeteer');

async function main() {
  const args = process.argv.slice(2);
  const url = getArg(args, '--url');
  const output = getArg(args, '--output');
  const format = getArg(args, '--format', 'png');

  if (!url || !output) {
    console.error('用法: node puppeteer_render.js --url <url> --output <file> [--format pdf|png]');
    process.exit(1);
  }

  console.log(`渲染: ${url} → ${output} (${format})`);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    // 如果是 file:// 协议，直接用 goto
    // 否则用网络请求
    await page.goto(url, {
      waitUntil: 'networkidle0',
      timeout: 60000,
    });

    if (format === 'pdf') {
      await page.pdf({
        path: output,
        format: 'A4',
        printBackground: true,
        margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' },
      });
    } else {
      await page.screenshot({
        path: output,
        fullPage: true,
        type: 'png',
      });
    }

    console.log(`渲染完成: ${output}`);
  } finally {
    await browser.close();
  }
}

function getArg(args, name, defaultValue) {
  const idx = args.indexOf(name);
  if (idx === -1) return defaultValue;
  return args[idx + 1] || defaultValue;
}

main().catch((err) => {
  console.error('渲染失败:', err.message);
  process.exit(1);
});
