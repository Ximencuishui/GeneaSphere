/**
 * 测试GraphicsMagick是否正常工作
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('=== GraphicsMagick功能测试 ===\n');

try {
  // 1. 测试gm命令
  console.log('🔍 测试1: 检查gm命令...');
  const gmVersion = execSync('gm -version', { encoding: 'utf-8' });
  console.log('✅ gm命令可用');
  console.log(`   版本: ${gmVersion.split('\n')[0]}\n`);

  // 2. 测试PDF转图片
  const pdfPath = path.join(__dirname, '全国陈氏总谱.pdf');
  
  if (!fs.existsSync(pdfPath)) {
    console.log('⚠️  未找到测试PDF文件');
    console.log(`   期望路径: ${pdfPath}\n`);
    return;
  }

  console.log('🔍 测试2: PDF转图片...');
  const outputPath = path.join(__dirname, 'test-gm-output.png');
  
  try {
    // 转换PDF第一页为PNG图片
    execSync(`gm convert "${pdfPath}[0]" -density 300 "${outputPath}"`, {
      stdio: 'pipe'
    });

    if (fs.existsSync(outputPath)) {
      const stats = fs.statSync(outputPath);
      console.log('✅ PDF转图片成功');
      console.log(`   输出文件: ${outputPath}`);
      console.log(`   文件大小: ${(stats.size / 1024).toFixed(2)} KB\n`);

      // 清理测试文件
      fs.unlinkSync(outputPath);
      console.log('🧹 已清理测试文件\n');
    }
  } catch (error) {
    console.log('❌ PDF转图片失败');
    console.log(`   错误: ${error.message}\n`);
  }

  // 3. 测试pdf2pic集成
  console.log('🔍 测试3: pdf2pic库测试...');
  try {
    const { fromBuffer } = require('pdf2pic');
    const pdfBuffer = fs.readFileSync(pdfPath);
    
    console.log('✅ pdf2pic库可用');
    console.log('   正在测试PDF转换...\n');

    const converter = fromBuffer(pdfBuffer, {
      density: 300,
      saveFilename: 'test',
      savePath: __dirname,
      format: 'png',
      width: 2480,
      height: 3508,
    });

    // 转换第一页
    converter(1).then((result) => {
      if (result && result.path) {
        console.log('✅ pdf2pic转换成功');
        console.log(`   输出: ${result.path}\n`);

        // 清理
        if (fs.existsSync(result.path)) {
          fs.unlinkSync(result.path);
          console.log('🧹 已清理测试文件\n');
        }

        // 4. 最终总结
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🎉 GraphicsMagick安装验证通过！');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('\n✅ gm命令: 可用');
        console.log('✅ PDF转图片: 正常');
        console.log('✅ pdf2pic集成: 正常');
        console.log('\n🚀 OCR功能已就绪！');
        console.log('\n下一步:');
        console.log('   1. 启动后端: cd apps/server && pnpm run dev');
        console.log('   2. 访问: http://localhost:5173/pdf-import');
        console.log('   3. 上传《全国陈氏总谱.pdf》测试OCR导入');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      }
    }).catch(err => {
      console.log('❌ pdf2pic转换失败');
      console.log(`   错误: ${err.message}\n`);
    });

  } catch (error) {
    console.log('❌ pdf2pic测试失败');
    console.log(`   错误: ${error.message}\n`);
  }

} catch (error) {
  console.log('❌ gm命令不可用');
  console.log(`   错误: ${error.message}\n`);
  console.log('💡 解决方案:');
  console.log('   1. 确认已添加到PATH: G:\\GraphicsMagick-1.3.47-windows');
  console.log('   2. 完全关闭PowerShell后重新打开');
  console.log('   3. 或执行: $env:Path += ";G:\\GraphicsMagick-1.3.47-windows"');
  console.log('   4. 然后再次运行此测试\n');
}
