import fs from 'fs';

const file = 'apps/web/src/components/GenealogyTree.vue';
const buf = fs.readFileSync(file);

let content = buf;

// 修复工具函数：找到 target 字符串并替换为 replacement 字节
function fix(targetStr, replacementBytes) {
  const t = Buffer.from(targetStr, 'utf8');
  const idx = content.indexOf(t);
  if (idx < 0) {
    console.log('NOT FOUND:', targetStr);
    return false;
  }
  // 找下一个 ; 或行结束
  let lineEnd = content.indexOf(Buffer.from(';', 'utf8'), idx);
  if (lineEnd < 0) lineEnd = content.indexOf(Buffer.from('\n', 'utf8'), idx);
  console.log(`FOUND ${targetStr} at ${idx}, lineEnd=${lineEnd}`);
  const before = content.slice(0, idx + t.length);
  const after = content.slice(lineEnd);
  content = Buffer.concat([before, replacementBytes, after]);
  return true;
}

// 修复项：用字节数组构造每个中文字符
const fixList = [
  // L1493: data.original.full_name || data.original.label || '未知'
  // 当前是 GBK '鏈€煡' = "未知"乱码
  // 替换为 '未知' 字节：e6 9c aa e7 9f a5
  { find: "data.original.label || '", replace: Buffer.from([0x27, 0xe6, 0x9c, 0xaa, 0xe7, 0x9f, 0xa5, 0x27]), desc: 'name default (未知)' },

  // L1495: 出生: ${birthYear}
  // 当前是 GBK '鍑虹敓' = "出生"乱码
  // 替换为 `出生: ${...}` 字节：60 e5 87 ba e7 94 9f 3a 20 24 7b ... 7d 60
  // 因为模板字符串太复杂，直接用 Buffer 构造
  { find: "data.birth_year ? `", replace: Buffer.from([0x60, 0xe5, 0x87, 0xba, 0xe7, 0x94, 0x9f, 0x3a, 0x20]), desc: 'birth template start' },

  // L1496: 去世
  { find: "data.death_year ? `", replace: Buffer.from([0x60, 0xe5, 0x8e, 0xbb, 0xe4, 0xb8, 0x96, 0x3a, 0x20]), desc: 'death template start' },

  // L1497: 在世 / 已故
  { find: "data.is_living ? '", replace: Buffer.from([0x27, 0xe5, 0x9c, 0xa8, 0xe4, 0xb8, 0x96, 0x27]), desc: 'living (在世)' },
];

// 修复 L1497 的 "已故" 部分（在 'living : ' 之后）
// L1497: data.is_living ? '在世' : '已故';
// 已经修复了第一部分，现在修复第二部分（已故）

let fixedCount = 0;
for (const item of fixList) {
  if (fix(item.find, item.replace)) {
    fixedCount++;
    console.log('Fixed:', item.desc);
  }
}

// 修复 L1497 第二部分 "已故"
// 当前字节应该是 '在世' + 一些 + ' : ' + 乱码 + ';'
// 找 'living ? ' 的位置，然后找到 ';' 之前的最后乱码
const livingTarget = Buffer.from("data.is_living ? '", 'utf8');
const livingIdx = content.indexOf(livingTarget);
if (livingIdx > 0) {
  // 找到 ';' 结束
  let endIdx = content.indexOf(Buffer.from(';', 'utf8'), livingIdx);
  console.log('L1497 living idx:', livingIdx, 'endIdx:', endIdx);
  // 在 endIdx 之前找 ': ' 模式，应该是 ' : \''
  const sepPattern = Buffer.from([0x27, 0x20, 0x3a, 0x20, 0x27]);
  let sepIdx = content.indexOf(sepPattern, livingIdx);
  console.log('L1497 sep idx:', sepIdx);
  // sepIdx + 5 = 第二部分开始
  // 替换 sepIdx+5 .. endIdx 为 已故'
  if (sepIdx > 0 && sepIdx + 5 < endIdx) {
    const before = content.slice(0, sepIdx + 5);
    const after = content.slice(endIdx);
    // 已故' = e5 b7 b2 e6 95 85 27 = 7 bytes
    const replacement = Buffer.from([0xe5, 0xb7, 0xb2, 0xe6, 0x95, 0x85, 0x27]);
    content = Buffer.concat([before, replacement, after]);
    fixedCount++;
    console.log('Fixed L1497 已故');
  }
}

// 修复 L1558 focusElement 失败
// console.warn('[GenealogyTree] focusElement 失败，保持 fitView:', err);
const focusTarget = Buffer.from("console.warn('[GenealogyTree] focusElement ", 'utf8');
const focusIdx = content.indexOf(focusTarget);
if (focusIdx > 0) {
  let endIdx = content.indexOf(Buffer.from(':', 'utf8'), focusIdx);
  if (endIdx < 0) endIdx = content.indexOf(Buffer.from(',', 'utf8'), focusIdx);
  console.log('L1558 focus idx:', focusIdx, 'endIdx:', endIdx);
  if (endIdx > 0) {
    const before = content.slice(0, focusIdx + focusTarget.length);
    const after = content.slice(endIdx);
    // 失败 = e5 a4 b1 e8 b4 a5 = 6 bytes
    const replacement = Buffer.from([0xe5, 0xa4, 0xb1, 0xe8, 0xb4, 0xa5]);
    content = Buffer.concat([before, replacement, after]);
    fixedCount++;
    console.log('Fixed L1558 focusElement 失败');
  }
}

// 修复 L1565 渲染失败 ElMessage
// ElMessage.error(`渲染失败: ${...}`);
const renderErrTarget = Buffer.from("ElMessage.error(`", 'utf8');
const renderIdx = content.indexOf(renderErrTarget);
console.log('L1565 render err idx:', renderIdx);

// 修复 L1610 找到匹配
// ElMessage.info(`找到 ${count} 个匹配结果`);
const findTarget = Buffer.from("ElMessage.info(`", 'utf8');
let findPos = 0;
const matches = [];
while (true) {
  const i = content.indexOf(findTarget, findPos);
  if (i < 0) break;
  matches.push(i);
  findPos = i + 1;
}
console.log('ElMessage.info(` positions:', matches);

// 修复 L1622 未找到
const noFindTarget = Buffer.from("ElMessage.warning('", 'utf8');
const noFindIdx = content.indexOf(noFindTarget);
console.log('L1622 warning idx:', noFindIdx);

fs.writeFileSync(file, content);
console.log('Total fixed:', fixedCount);
console.log('Final file size:', content.length);