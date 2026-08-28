import fs from 'fs';
const fp = 'e:/GeneaSphere/apps/server/src/auth/demo-seed.service.ts';
let content = fs.readFileSync(fp, 'utf8');

// 找出 attempt < 500 的位置并打印上下文
const idx = content.indexOf('attempt < 500');
console.log('Found at index:', idx);
console.log('Context:');
console.log(content.substring(idx - 50, idx + 600));
console.log('\n--- bytes ---');
const bytes = Buffer.from(content.substring(idx - 50, idx + 200), 'utf8');
for (let i = 0; i < Math.min(200, bytes.length); i++) {
  console.log(i + ': ' + bytes[i].toString(16) + ' ' + (bytes[i] >= 32 && bytes[i] < 127 ? String.fromCharCode(bytes[i]) : '?'));
}
