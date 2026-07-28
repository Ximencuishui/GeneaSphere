import fs from 'fs';

const file = 'apps/web/src/components/GenealogyTree.vue';
const buf = fs.readFileSync(file);

// 修复 L1494 gender 行
// 当前字节：data.gender === 'male' ? '生? : '生?;
// 期望字节：data.gender === 'male' ? '男' : '女';

const t = Buffer.from("data.gender === 'male' ? '", 'utf8');
const idx = buf.indexOf(t);
console.log('gender idx:', idx);

if (idx > 0) {
  const lineEnd = buf.indexOf(Buffer.from(';', 'utf8'), idx);
  console.log('lineEnd:', lineEnd);

  const before = buf.slice(0, idx + t.length);
  const after = buf.slice(lineEnd);

  // 男' : '女'  - 字节：e7 94 b7 27 20 3a 20 27 e5 a5 b3 27
  const replacement = Buffer.from([0xe7, 0x94, 0xb7, 0x27, 0x20, 0x3a, 0x20, 0x27, 0xe5, 0xa5, 0xb3, 0x27]);

  console.log('replacement bytes:', replacement.length, replacement.toString('hex'));

  const newBuf = Buffer.concat([before, replacement, after]);
  fs.writeFileSync(file, newBuf);
  console.log('written, new size:', newBuf.length);
  console.log('verification:', JSON.stringify(newBuf.slice(idx, lineEnd+1).toString('utf8')));
}