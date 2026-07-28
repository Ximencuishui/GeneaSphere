import fs from 'fs';
const file = 'apps/web/src/components/GenealogyTree.vue';
let content = fs.readFileSync(file, 'utf8');

const lines = content.split('\n');
let fixed = 0;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  // 匹配单引号字面量 + 包含 ? 字符 + 后面跟逗号
  const m = line.match(/'[^']*\?,/);
  if (!m) continue;
  const hasChinese = /[\u4e00-\u9fff]/.test(m[0]);
  if (!hasChinese) continue;
  // 按行内容判断替换哪个 stage label
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
    lines[i] = line.replace(/'[^']*'/, "'\u6b63\u5728\u52a0\u8f7d\u65cf\u8c31\u6811\u2026'");
    fixed++;
  } else {
    console.log('L' + (i+1) + ' matched but no stage keyword:', line);
  }
}
console.log('Fixed lines:', fixed);
fs.writeFileSync(file, lines.join('\n'), 'utf8');
console.log('mtime:', fs.statSync(file).mtime.toISOString());

// 校验
const verifyContent = fs.readFileSync(file, 'utf8');
const verifyLines = verifyContent.split('\n');
for (let i = 285; i < 295; i++) {
  console.log('L' + (i+1) + ': ' + (verifyLines[i] || ''));
}
