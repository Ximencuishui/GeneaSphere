/**
 * 测试pdfjs-dist + canvas PDF转图片功能
 */

const fs = require('fs');
const path = require('path');

async function testPdfToImage() {
  console.log('=== PDF转图片功能测试 (pdfjs-dist + canvas) ===\n');

  const pdfPath = path.join(__dirname, '全国陈氏总谱.pdf');
  
  if (!fs.existsSync(pdfPath)) {
    console.log('❌ 未找到《全国陈氏总谱.pdf》\n');
    return;
  }

  const pdfBuffer = fs.readFileSync(pdfPath);
  console.log(`📄 PDF文件: ${(pdfBuffer.length / 1024 / 1024).toFixed(2)} MB\n`);

  try {
    // 1. 加载pdfjs-dist
    console.log('🔍 测试1: 加载pdfjs-dist...');
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    console.log('✅ pdfjs-dist 加载成功');
    console.log(`   版本: ${pdfjsLib.version}\n`);

    // 2. 配置worker
    const path = require('path');
    const workerPath = path.resolve(__dirname, '..', 'node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs');
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'file:///' + workerPath.replace(/\\/g, '/');
    console.log('✅ Worker配置完成\n');

    // 3. 加载PDF
    console.log('🔍 测试2: 加载PDF文档...');
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(pdfBuffer),
      useSystemFonts: true,
    });
    const pdf = await loadingTask.promise;
    console.log(`✅ PDF加载成功`);
    console.log(`   总页数: ${pdf.numPages} 页`);
    console.log(`   指纹: ${pdf.fingerprints?.[0] || 'N/A'}\n`);

    // 4. 加载canvas
    console.log('🔍 测试3: 加载canvas...');
    const canvasModule = await import('canvas');
    const { createCanvas } = canvasModule;
    console.log('✅ canvas 加载成功\n');

    // 5. 测试转换第一页
    console.log('🔍 测试4: 转换第1页为图片...');
    const page = await pdf.getPage(1);
    const scale = 2.0;
    const viewport = page.getViewport({ scale });

    console.log(`   页面尺寸: ${viewport.width} x ${viewport.height}px`);

    const canvas = createCanvas(viewport.width, viewport.height);
    const context = canvas.getContext('2d');

    // 白色背景
    context.fillStyle = '#FFFFFF';
    context.fillRect(0, 0, viewport.width, viewport.height);

    // 渲染
    const renderContext = {
      canvasContext: context,
      viewport,
      background: '#FFFFFF',
    };

    console.log('   正在渲染...');
    await page.render(renderContext).promise;

    // 转为PNG Buffer
    const imageBuffer = canvas.toBuffer('image/png');
    const imageSizeKB = (imageBuffer.length / 1024).toFixed(1);

    console.log(`✅ 第1页转换成功`);
    console.log(`   图片大小: ${imageSizeKB} KB\n`);

    // 6. 保存测试图片
    const outputDir = path.join(__dirname);
    const outputPath = path.join(outputDir, 'test-ocr-output.png');
    fs.writeFileSync(outputPath, imageBuffer);
    console.log(`💾 测试图片已保存: ${outputPath}\n`);

    // 7. 测试Tesseract.js识别
    console.log('🔍 测试5: OCR识别图片...');
    const { createWorker } = require('tesseract.js');
    const worker = await createWorker('chi_sim+eng', 1, {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          process.stdout.write(`\r   OCR进度: ${(m.progress * 100).toFixed(0)}%`);
        }
      },
    });

    const { data } = await worker.recognize(imageBuffer);
    console.log(`\n✅ OCR识别完成`);
    console.log(`   置信度: ${data.confidence.toFixed(1)}%`);
    console.log(`   文本长度: ${data.text.length} 字符`);
    console.log(`\n📝 识别文本预览（前200字）:`);
    console.log('   ' + data.text.substring(0, 200).replace(/\n/g, '\n   '));

    await worker.terminate();

    // 8. 清理
    fs.unlinkSync(outputPath);
    console.log('\n🧹 已清理测试文件\n');

    // 9. 总结
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 测试全部通过!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ pdfjs-dist: PDF加载正常');
    console.log('✅ canvas: PDF转图片正常');
    console.log('✅ Tesseract.js: OCR识别正常');
    console.log('\n🚀 OCR功能已完全就绪!');
    console.log('无需任何系统依赖！\n');

  } catch (error) {
    console.log(`\n❌ 测试失败: ${error.message}`);
    console.log(error.stack);
  }
}

testPdfToImage();
