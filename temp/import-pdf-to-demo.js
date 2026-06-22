/**
 * PDF族谱真实导入脚本
 * 使用演示账号将《全国陈氏总谱.pdf》导入到演示家族数据库
 */

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { PDFParse } = require('pdf-parse');

const prisma = new PrismaClient();

// 配置
const PDF_FILE = path.join(__dirname, '全国陈氏总谱.pdf');
const DEMO_CLAN_NAME = '李氏宗族（演示）';

/**
 * 解析辈分数字
 */
function parseGeneration(genStr) {
  const chineseNumbers = {
    '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
    '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
    '百': 100, '千': 1000, '万': 10000
  };

  if (/^\d+$/.test(genStr)) {
    return parseInt(genStr, 10);
  }

  return chineseNumbers[genStr] || 0;
}

/**
 * 从文本中提取日期
 */
function extractDate(text, keywords) {
  for (const keyword of keywords) {
    const index = text.indexOf(keyword);
    if (index === -1) continue;

    const afterKeyword = text.substring(index + keyword.length);

    // 匹配公历日期格式
    const dateMatch = afterKeyword.match(/(\d{4})[-年](\d{1,2})[-月](\d{1,2})[日]?/);
    if (dateMatch) {
      const year = parseInt(dateMatch[1], 10);
      const month = parseInt(dateMatch[2], 10).toString().padStart(2, '0');
      const day = parseInt(dateMatch[3], 10).toString().padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    // 匹配年份
    const yearMatch = afterKeyword.match(/(\d{4})年/);
    if (yearMatch) {
      return `${yearMatch[1]}-01-01`;
    }
  }

  return null;
}

/**
 * 解析单行文本，提取人员信息
 */
function parseLine(line, rowNumber) {
  const trimmedLine = line.trim();

  // 提取姓名（中文姓名，2-4个字符）
  const nameMatch = trimmedLine.match(/([\u4e00-\u9fa5]{2,4})/);
  if (!nameMatch) {
    return null;
  }

  const fullName = nameMatch[1];
  let confidence = 50;

  // 提取性别
  let gender = 'male'; // 默认male
  if (trimmedLine.includes('男') || trimmedLine.includes('公') || trimmedLine.includes('氏')) {
    gender = 'male';
    confidence += 15;
  } else if (trimmedLine.includes('女') || trimmedLine.includes('夫人') || trimmedLine.includes('孺人')) {
    gender = 'female';
    confidence += 15;
  }

  // 提取辈分
  let generation = null;
  const generationMatch = trimmedLine.match(/第([一二三四五六七八九十百千万\d]+)世/);
  if (generationMatch) {
    generation = parseGeneration(generationMatch[1]);
    confidence += 15;
  }

  // 提取日期
  const birthDate = extractDate(trimmedLine, ['生', '生于', '诞']);
  const deathDate = extractDate(trimmedLine, ['卒', '殁', '逝世', '终']);

  if (birthDate) confidence += 10;
  if (deathDate) confidence += 10;

  return {
    rowNumber,
    fullName,
    gender,
    generation,
    birthDate,
    deathDate,
    isLiving: !deathDate,
    confidenceScore: Math.min(confidence, 100),
    originalText: trimmedLine.substring(0, 200),
  };
}

/**
 * 从PDF文本中提取所有人员信息
 */
function extractPersonInfo(text) {
  const records = [];
  const lines = text.split('\n').filter(line => line.trim().length > 0);

  let rowNumber = 0;

  for (const line of lines) {
    const record = parseLine(line, ++rowNumber);
    if (record && record.confidenceScore >= 50) { // 只导入置信度>=50的记录
      records.push(record);
    }
  }

  return records;
}

/**
 * 主函数：执行PDF导入
 */
async function main() {
  console.log('=== PDF族谱真实导入脚本 ===\n');

  try {
    // 1. 检查PDF文件
    if (!fs.existsSync(PDF_FILE)) {
      console.error('❌ PDF文件不存在:', PDF_FILE);
      process.exit(1);
    }

    console.log('📄 PDF文件:', path.basename(PDF_FILE));
    console.log('📊 文件大小:', (fs.statSync(PDF_FILE).size / 1024 / 1024).toFixed(2), 'MB');

    // 2. 查找演示家族
    console.log('\n🔍 查找演示家族...');
    const demoClan = await prisma.clan.findFirst({
      where: { name: DEMO_CLAN_NAME },
    });

    if (!demoClan) {
      console.error('❌ 演示家族不存在:', DEMO_CLAN_NAME);
      console.log('提示: 请先启动后端服务，演示家族会自动创建');
      process.exit(1);
    }

    console.log('✅ 找到演示家族:', demoClan.name);
    console.log('🆔 家族ID:', demoClan.id);

    // 3. 解析PDF
    console.log('\n📖 解析PDF文件...');
    const pdfBuffer = fs.readFileSync(PDF_FILE);
    const pdfDoc = new PDFParse({ data: pdfBuffer });
    const textResult = await pdfDoc.getText();

    console.log('✅ PDF解析成功');
    console.log('📄 总页数:', textResult.total);
    console.log('📝 文本长度:', textResult.text.length, '字符');

    // 4. 提取人员信息
    console.log('\n🔍 提取人员信息...');
    const records = extractPersonInfo(textResult.text);

    console.log('✅ 提取到', records.length, '条人员记录');
    
    if (records.length === 0) {
      console.log('\n⚠️  未提取到有效的人员记录');
      console.log('可能原因:');
      console.log('1. PDF是扫描件，需要使用OCR识别');
      console.log('2. PDF格式不符合常见族谱格式');
      console.log('3. PDF中人员信息不规整');
      
      // 显示前10行文本供调试
      console.log('\n📋 PDF前10行文本:');
      const lines = textResult.text.split('\n').filter(l => l.trim().length > 0).slice(0, 10);
      lines.forEach((line, i) => {
        console.log(`  ${i + 1}. ${line.substring(0, 100)}`);
      });
      
      process.exit(0);
    }

    // 显示提取的样本
    console.log('\n📋 提取的样本数据（前5条）:');
    records.slice(0, 5).forEach((record, i) => {
      console.log(`  ${i + 1}. ${record.fullName} | ${record.gender === 'male' ? '男' : '女'} | 置信度: ${record.confidenceScore}%`);
      if (record.generation) console.log(`     辈分: 第${record.generation}世`);
      if (record.birthDate) console.log(`     出生: ${record.birthDate}`);
      if (record.deathDate) console.log(`     逝世: ${record.deathDate}`);
    });

    // 5. 导入数据库
    console.log('\n💾 开始导入数据库...');
    
    let successCount = 0;
    let failureCount = 0;
    const errors = [];

    // 先统计现有人员数量
    const existingCount = await prisma.person.count({
      where: { clan_id: demoClan.id },
    });
    console.log('📊 家族现有人员:', existingCount, '人');

    // 批量导入
    for (const record of records) {
      try {
        await prisma.person.create({
          data: {
            clan_id: demoClan.id,
            full_name: record.fullName,
            gender: record.gender,
            birth_date: record.birthDate ? new Date(record.birthDate) : null,
            death_date: record.deathDate ? new Date(record.deathDate) : null,
            is_living: record.isLiving ?? true,
          },
        });
        successCount++;
      } catch (error) {
        failureCount++;
        errors.push(`第${record.rowNumber}行 (${record.fullName}): ${error.message}`);
      }
    }

    // 6. 显示导入结果
    console.log('\n✅ 导入完成!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 导入统计:');
    console.log(`  ✓ 成功: ${successCount} 条`);
    console.log(`  ✗ 失败: ${failureCount} 条`);
    console.log(`  📈 家族总人数: ${existingCount + successCount} 人`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    if (errors.length > 0 && errors.length <= 10) {
      console.log('\n⚠️  错误详情:');
      errors.forEach((error, i) => {
        console.log(`  ${i + 1}. ${error}`);
      });
    } else if (errors.length > 10) {
      console.log(`\n⚠️  共 ${errors.length} 个错误（显示前10个）:`);
      errors.slice(0, 10).forEach((error, i) => {
        console.log(`  ${i + 1}. ${error}`);
      });
    }

    // 7. 验证导入结果
    console.log('\n🔍 验证导入结果...');
    const finalCount = await prisma.person.count({
      where: { clan_id: demoClan.id },
    });
    console.log('✅ 家族当前总人数:', finalCount, '人');

    // 查询最新导入的人员
    const recentPersons = await prisma.person.findMany({
      where: { clan_id: demoClan.id },
      orderBy: { created_at: 'desc' },
      take: 5,
      select: {
        id: true,
        full_name: true,
        gender: true,
        birth_date: true,
        death_date: true,
        is_living: true,
        created_at: true,
      },
    });

    console.log('\n📋 最新导入的5条记录:');
    recentPersons.forEach((person, i) => {
      console.log(`  ${i + 1}. ${person.full_name} | ${person.gender === 'male' ? '男' : '女'}`);
      if (person.birth_date) {
        console.log(`     出生: ${person.birth_date.toISOString().split('T')[0]}`);
      }
      console.log(`     在世: ${person.is_living ? '是' : '否'}`);
    });

    console.log('\n✅ PDF导入完成！');
    console.log('\n📌 下一步:');
    console.log('1. 访问族谱树页面查看导入的数据');
    console.log(`   http://localhost:5173/tree/${demoClan.id}`);
    console.log('2. 访问用户中心查看家族信息');
    console.log('   http://localhost:5173/user-center/families');
    console.log('3. 使用演示账号登录:');
    console.log('   管理员: 13800000000 / demo123');
    console.log('   族  员: 13800000001 / demo123');

  } catch (error) {
    console.error('\n❌ 导入失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// 执行
main();
