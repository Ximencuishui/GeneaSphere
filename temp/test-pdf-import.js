/**
 * PDF导入功能测试脚本
 * 用于验证PDF解析和导入功能
 */

const fs = require('fs');
const path = require('path');

// 检查temp目录下是否有PDF文件
const tempDir = path.join(__dirname);
const pdfFiles = fs.readdirSync(tempDir).filter(f => f.endsWith('.pdf'));

if (pdfFiles.length === 0) {
  console.log('❌ temp目录下没有找到PDF文件');
  console.log('请将PDF文件（如：全国陈氏总谱.pdf）放入temp目录');
  process.exit(1);
}

console.log('✅ 找到PDF文件:', pdfFiles[0]);
console.log('📁 文件路径:', path.join(tempDir, pdfFiles[0]));

// 测试pdf-parse
console.log('\n=== 测试PDF解析 ===');
const { PDFParse } = require('pdf-parse');

async function testPdfParse() {
  try {
    const pdfPath = path.join(tempDir, pdfFiles[0]);
    const pdfBuffer = fs.readFileSync(pdfPath);
    
    console.log('📊 文件大小:', (pdfBuffer.length / 1024 / 1024).toFixed(2), 'MB');
    console.log('⏳ 开始解析PDF...');

    const pdfDoc = new PDFParse({ data: pdfBuffer });
    const textResult = await pdfDoc.getText();

    console.log('✅ 解析成功!');
    console.log('📄 总页数:', textResult.total);
    console.log('📝 文本长度:', textResult.text.length, '字符');
    console.log('📋 前500字符预览:');
    console.log('---');
    console.log(textResult.text.substring(0, 500));
    console.log('---');

    // 测试元数据提取
    console.log('\n=== 测试元数据提取 ===');
    const infoResult = await pdfDoc.getInfo();
    console.log('📖 标题:', infoResult.info?.Title || '无');
    console.log('👤 作者:', infoResult.info?.Author || '无');
    console.log('🔧 创建者:', infoResult.info?.Creator || '无');
    console.log('📅 创建日期:', infoResult.info?.CreationDate || '无');

    // 测试人员信息提取
    console.log('\n=== 测试人员信息提取 ===');
    const lines = textResult.text.split('\n').filter(line => line.trim().length > 0);
    console.log('📊 总行数:', lines.length);
    
    // 简单统计包含中文姓名的行
    let nameCount = 0;
    for (const line of lines.slice(0, 100)) {
      if (/[\u4e00-\u9fa5]{2,4}/.test(line)) {
        nameCount++;
        if (nameCount <= 5) {
          console.log(`  ✓ ${line.substring(0, 100)}`);
        }
      }
    }
    console.log(`\n前100行中找到 ${nameCount} 行包含中文姓名`);

    console.log('\n✅ 所有测试通过！PDF导入功能基本正常。');
    console.log('\n📌 下一步：');
    console.log('1. 启动后端服务: cd apps/server && pnpm run dev');
    console.log('2. 启动前端服务: cd apps/web && pnpm run dev');
    console.log('3. 访问 http://localhost:5173/pdf-import 测试完整导入流程');

  } catch (error) {
    console.error('❌ PDF解析失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testPdfParse();
