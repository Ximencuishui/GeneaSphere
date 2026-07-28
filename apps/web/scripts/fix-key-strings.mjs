// 用 Node 精确修复 GenealogyTree.vue 中已知的关键乱码字符串
import fs from 'fs';

const file = 'apps/web/src/components/GenealogyTree.vue';
let content = fs.readFileSync(file, 'utf8');
const orig = content;
let count = 0;

// 关键修复（每个 fix 是一对 garbled → correct）
// 用 unicode 转义避免脚本本身的编码问题
const fixes = [
  // L406: 401 错误
  ["return '\u767b\u5f55\u5df2\u8fc7\u671f\uff0c\u8bf7\u91cd\u65b0\u767b\u5f55\u540e\u518d\u8bbf\u95ee\u65cf\u8c31'",
   "return '\u767b\u5f55\u5df2\u8fc7\u671f\uff0c\u8bf7\u91cd\u65b0\u767b\u5f55\u540e\u518d\u8bbf\u95ee\u65cf\u8c31'"],
  // L407: 403 错误
  ["return '\u5f53\u524d\u8d26\u53f7\u65e0\u6743\u67e5\u770b\u6b64\u65cf\u8c31'",
   "return '\u5f53\u524d\u8d26\u53f7\u65e0\u6743\u67e5\u770b\u6b64\u65cf\u8c31'"],
  // L408: 404 错误
  ["return '\u672a\u627e\u5230\u8be5\u5bb6\u65cf\uff0c\u53ef\u80fd\u5df2\u88ab\u5220\u9664'",
   "return '\u672a\u627e\u5230\u8be5\u5bb6\u65cf\uff0c\u53ef\u80fd\u5df2\u88ab\u5220\u9664'"],
  // L409: 5xx 错误
  ["return '\u670d\u52a1\u5668\u5f00\u5c0f\u5dee\u4e86\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5'",
   "return '\u670d\u52a1\u5668\u5f00\u5c0f\u5dee\u4e86\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5'"],
];

// L449 console.info
const l449 = "console.info('[GenealogyTree] 5xx \u95ee\u9898\u81ea\u52a8\u91cd\u8bd5\u2026')";
console.log('L449 fix target:', l449);

// L1494 gender
const l1494 = "data.gender === 'male' ? '\u7537' : '\u5973'";
console.log('L1494 fix target:', l1494);

// L1645 toggle
const l1645 = "ElMessage.success(`\u5df2\u5207\u6362\u4e3a\${layoutDirection.value === 'TB' ? '\u7eb5\u5411' : '\u6a2a\u5411'}\u5e03\u5c40`)";
console.log('L1645 fix target:', l1645);

// 直接操作字节：用 Buffer 找位置
const buf = Buffer.from(content, 'utf8');

// 5xx auto-retry 信息
const target1 = Buffer.from("console.info('[GenealogyTree] 5xx ", 'utf8');
const idx1 = buf.indexOf(target1);
console.log('console.info 5xx idx:', idx1);
if (idx1 > 0) {
  // 找到行尾
  let lineEnd = buf.indexOf(Buffer.from(');', 'utf8'), idx1);
  if (lineEnd > 0) {
    const before = buf.slice(0, idx1 + target1.length);
    const after = buf.slice(lineEnd);
    const replacement = Buffer.from("console.info('[GenealogyTree] 5xx \u95ee\u9898\u81ea\u52a8\u91cd\u8bd5\u2026'", 'utf8');
    const newBuf = Buffer.concat([before, replacement, after]);
    content = newBuf.toString('utf8');
    count++;
    console.log('Fixed L449');
  }
}

// L1494 gender 字符串
const target2 = Buffer.from("data.gender === 'male' ? '", 'utf8');
const idx2 = buf.indexOf(target2);
console.log('gender idx:', idx2);
if (idx2 > 0) {
  let lineEnd = buf.indexOf(Buffer.from(';', 'utf8'), idx2);
  if (lineEnd > 0) {
    const before = buf.slice(0, idx2 + target2.length);
    const after = buf.slice(lineEnd);
    const replacement = Buffer.from("\u7537' : '\u5973'", 'utf8');
    const newBuf = Buffer.concat([before, replacement, after]);
    content = newBuf.toString('utf8');
    count++;
    console.log('Fixed L1494');
  }
}

// L1645 toggle layout 提示
const target3 = Buffer.from("ElMessage.success(`", 'utf8');
const idx3 = buf.indexOf(target3);
console.log('ElMessage success idx:', idx3);
if (idx3 > 0) {
  // 找 layoutDirection 之后
  const layoutIdx = buf.indexOf(Buffer.from('layoutDirection.value ===', 'utf8'), idx3);
  console.log('layoutDirection idx:', layoutIdx);
  if (layoutIdx > 0) {
    // 找到反引号结束
    const backtickIdx = buf.indexOf(Buffer.from('`', 'utf8'), layoutIdx);
    console.log('backtick idx:', backtickIdx);
    if (backtickIdx > 0) {
      const before = buf.slice(0, idx3 + target3.length);
      const after = buf.slice(backtickIdx);
      const replacement = Buffer.from("\u5df2\u5207\u6362\u4e3a${layoutDirection.value === 'TB' ? '\u7eb5\u5411' : '\u6a2a\u5411'}\u5e03\u5c40`", 'utf8');
      const newBuf = Buffer.concat([before, replacement, after]);
      content = newBuf.toString('utf8');
      count++;
      console.log('Fixed L1645');
    }
  }
}

if (count > 0) {
  const hasBom = orig.charCodeAt(0) === 0xFEFF;
  let toWrite = content;
  if (hasBom && toWrite.charCodeAt(0) !== 0xFEFF) toWrite = '\ufeff' + toWrite;
  fs.writeFileSync(file, toWrite, 'utf8');
  console.log('Total fixed:', count);
} else {
  console.log('No changes.');
}