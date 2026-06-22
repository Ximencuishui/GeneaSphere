/**
 * 测试 @napi-rs/canvas 渲染PDF页面
 */
const { createCanvas, Image, DOMMatrix } = require('@napi-rs/canvas');
const fs = require('fs');
const path = require('path');

// 设置全局DOM-like对象
globalThis.Image = Image;
globalThis.DOMMatrix = DOMMatrix;

async function main() {
  console.log('=== 测试 @napi-rs/canvas PDF渲染 ===\n');

  try {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    console.log('✅ pdfjs-dist loaded:', pdfjsLib.version);

    // 设置worker
    const workerPath = path.resolve(__dirname, '..', 'node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs');
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'file:///' + workerPath.replace(/\\/g, '/');
    console.log('✅ Worker configured');

    // 加载PDF
    const pdfBuffer = fs.readFileSync(path.join(__dirname, '全国陈氏总谱.pdf'));
    console.log('✅ PDF loaded:', (pdfBuffer.length / 1024 / 1024).toFixed(2), 'MB');

    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) }).promise;
    console.log('✅ Document parsed:', pdf.numPages, 'pages');

    // 渲染第2页
    const page = await pdf.getPage(2);
    console.log('✅ Page loaded');

    const viewport = page.getViewport({ scale: 2.0 });
    console.log('✅ Viewport:', viewport.width, 'x', viewport.height);

    const canvas = createCanvas(viewport.width, viewport.height);
    const context = canvas.getContext('2d');
    context.fillStyle = '#FFFFFF';
    context.fillRect(0, 0, viewport.width, viewport.height);

    console.log('⏳ Rendering page...');

    await page.render({
      canvasContext: context,
      viewport,
    }).promise;

    console.log('✅ Render complete');

    // 保存PNG
    const outputPath = path.join(__dirname, 'test-pdf-render.png');
    const imageBuffer = canvas.toBuffer('image/png');
    fs.writeFileSync(outputPath, imageBuffer);
    console.log('✅ Saved to:', outputPath);
    console.log('   Size:', (imageBuffer.length / 1024).toFixed(1), 'KB');

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.stack) {
      console.error(error.stack.split('\n').slice(0, 5).join('\n'));
    }
  }
}

async function testOcr() {
  const { createCanvas, Image, DOMMatrix } = require('@napi-rs/canvas');
  globalThis.Image = Image;
  globalThis.DOMMatrix = DOMMatrix;

  try {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const workerPath = path.resolve(__dirname, '..', 'node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs');
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'file:///' + workerPath.replace(/\\/g, '/');

    const pdfBuffer = fs.readFileSync(path.join(__dirname, '全国陈氏总谱.pdf'));
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) }).promise;

    console.log('\n=== 完整OCR流水线测试 ===');
    console.log('开始渲染PDF页面为图片...');

    // 只测试第2页作为样例
    const page = await pdf.getPage(2);
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = createCanvas(viewport.width, viewport.height);
    const context = canvas.getContext('2d');
    context.fillStyle = '#FFFFFF';
    context.fillRect(0, 0, viewport.width, viewport.height);
    await page.render({ canvasContext: context, viewport }).promise;

    const imageBuffer = canvas.toBuffer('image/png');
    console.log(`渲染完成: ${(imageBuffer.length / 1024).toFixed(1)} KB\n`);

    // OCR
    console.log('初始化Tesseract.js OCR引擎...');
    const { createWorker } = require('tesseract.js');
    const worker = await createWorker('chi_sim+eng', 1, {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          process.stdout.write('\r  OCR进度: ' + (m.progress * 100).toFixed(0) + '%');
        }
      },
    });

    console.log('\n开始OCR识别...');
    const { data } = await worker.recognize(imageBuffer);

    console.log('\n');
    console.log('=== OCR结果 ===');
    console.log('置信度:', data.confidence.toFixed(1) + '%');
    console.log('文本长度:', data.text.length, '字符');
    console.log('\n文本内容预览:');
    console.log('-------------------');
    console.log(data.text.substring(0, 500));
    console.log('-------------------');

    await worker.terminate();
    console.log('\n✅ OCR流水线测试完成!');

  } catch (error) {
    console.error('❌ OCR测试错误:', error.message);
    if (error.stack) {
      console.error(error.stack.split('\n').slice(0, 5).join('\n'));
    }
  }
}

// 先测试渲染，再测试OCR
main().then(() => testOcr());
