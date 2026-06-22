/**
 * 测试Tesseract.js OCR识别功能
 * 独立测试，不依赖PDF渲染
 */

const path = require('path');
const fs = require('fs');

async function testTesseractOnly() {
  console.log('=== Tesseract.js OCR独立测试 ===\n');

  try {
    // 1. 创建Worker
    console.log('🔍 创建Tesseract Worker (chi_sim+eng)...');
    const { createWorker } = require('tesseract.js');
    
    console.log('   正在下载/加载语言包，请稍候...');
    const worker = await createWorker('chi_sim+eng', 1, {
      logger: (m) => {
        if (m.status === 'loading language traineddata') {
          process.stdout.write(`\r   ⏳ 下载语言包: ${(m.progress * 100).toFixed(0)}%`);
        } else if (m.status === 'initializing api') {
          process.stdout.write(`\r   ⏳ 初始化API: ${(m.progress * 100).toFixed(0)}%`);
        } else if (m.status === 'recognizing text') {
          process.stdout.write(`\r   🔍 识别中: ${(m.progress * 100).toFixed(0)}%`);
        }
      },
    });
    console.log('\n✅ Worker创建成功\n');

    // 2. 生成测试图片（简单文本图像）
    console.log('🔍 生成测试图片...');
    const testImagePath = path.join(__dirname, 'test-ocr-input.png');
    
    // 使用canvas库创建测试图片
    const { createCanvas } = require('canvas');
    const canvas = createCanvas(400, 100);
    const ctx = canvas.getContext('2d');
    
    // 白色背景
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, 400, 100);
    
    // 黑色文字
    ctx.fillStyle = '#000000';
    ctx.font = '24px sans-serif';
    ctx.fillText('陈氏总谱 一世祖 陈公讳友谅', 20, 50);
    
    const imageBuffer = canvas.toBuffer('image/png');
    fs.writeFileSync(testImagePath, imageBuffer);
    console.log(`✅ 测试图片已生成: ${(imageBuffer.length / 1024).toFixed(1)} KB\n`);

    // 3. 执行OCR识别
    console.log('🔍 执行OCR识别...');
    const { data } = await worker.recognize(imageBuffer);
    
    console.log(`\n✅ OCR识别完成`);
    console.log(`   置信度: ${data.confidence.toFixed(1)}%`);
    console.log(`   文本长度: ${data.text.length} 字符`);
    console.log(`\n📝 识别结果:`);
    console.log(`   "${data.text.trim()}"`);
    console.log(`\n   词语数: ${data.words?.length || 0}`);
    
    // 清理
    fs.unlinkSync(testImagePath);
    await worker.terminate();
    
    console.log('\n✅ Tesseract.js OCR功能正常!');
    
  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    if (error.stack) {
      const lines = error.stack.split('\n');
      console.error(lines.slice(0, 5).join('\n'));
    }
    console.log('\n💡 可能的问题:');
    console.log('   1. 网络连接问题，无法下载语言包');
    console.log('   2. TESSDATA_PREFIX环境变量未设置');
    console.log('   3. 防火墙阻止了网络请求');
  }
}

testTesseractOnly();
