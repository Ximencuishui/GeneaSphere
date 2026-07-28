import fs from 'fs';
const file = 'apps/web/src/components/GenealogyTree.vue';
let content = fs.readFileSync(file, 'utf8');

// 直接用正则匹配每行：单引号字符串中的乱码
// 原文期望的 charCode: 正 0x6B63, 在 0x5728, 拉 0x62C9, 取 0x53D6, 家 0x5BB6, 族 0x65CF, 数 0x6570, 据 0x636E, … 0x2026
// 直接用 ASCII 模式匹配: 'XXX?,  其中 XXX 是任意非 ASCII 字符 + ?
// 把这种 pattern 全部替换为正确的中文

const lines = content.split('\n');
let fixed = 0;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  // 匹配: '   <任何非 ASCII 字符> ? ,   （单引号 + 乱码中文字 + ? ,）
  // 关键：行尾是 ?,' 而 ? 是字面量 0x3F
  if (line.match(/:\s*'[^']*[\u4e00-\u9fff]\?,'/)) {
    // 替换整个字面量为正确的 5 个 stage label
    if (line.includes('fetch:')) {
      lines[i] = line.replace(/'[^']*'/, "'\u6b63\u5728\u62c9\u53d6\u5bb6\u65cf\u6570\u636e\u2026'");
      fixed++;
    } else if (line.includes('parse:')) {
      lines[i] = line.replace(/'[^']*'/, "'\u6b63\u5728\u89e3\u6790\u8c31\u7cfb\u7ed3\u6784\u2026'");
      fixed++;
    } else if (line.includes('render:')) {
      lines[i] = line.replace(/'[^']*'/, "'\u6b63\u5728\u6e32\u67d3\u65cf\u8c31\u6811\u2026'");
      fixed++;
    } else if (line.includes('finalize:')) {
      lines[i] = line.replace(/'[^']*'/, "'\u6b63\u5728\u9002\u914d\u753b\u5e03\u2026'");
      fixed++;
    } else if (line.includes('loadingStage.value')) {
      lines[i] = line.replace(/:\s*'[^']*'/, ": '\u6b63\u5728\u52a0\u8f7d\u65cf\u8c31\u6811\u2026'");
      fixed++;
    }
  }
}
console.log('Fixed lines:', fixed);
const newContent = lines.join('\n');
fs.writeFileSync(file, newContent, 'utf8');
console.log('mtime:', fs.statSync(file).mtime.toISOString());

// 校验
const verifyContent = fs.readFileSync(file, 'utf8');
const verifyLines = verifyContent.split('\n');
for (let i = 285; i < 295; i++) {
  console.log('L' + (i+1) + ': ' + (verifyLines[i] || ''));
}
