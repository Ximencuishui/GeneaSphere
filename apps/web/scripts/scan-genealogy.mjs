import fs from 'fs';
const file = 'apps/web/src/components/GenealogyTree.vue';
const lines = fs.readFileSync(file, 'utf8').split('\n');
const out = [];
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  // 检测是否含有非 ASCII 字符
  if (/[^\x00-\x7F]/.test(line)) {
    out.push({ n: i + 1, content: line });
  }
}
console.log('Total lines with non-ASCII:', out.length);
for (const o of out) {
  console.log(`L${o.n}: ${o.content}`);
}