import fs from 'fs';

const file = 'apps/web/src/components/GenealogyTree.vue';
const buf = fs.readFileSync(file);

// 之前修复成了 "渲服失败"，需要改为 "渲染失败"
// 当前字节：60 e6 b8 b2 e6 9c 8d e5 a4 b1 e8 b4 a5 = `渲服失败
// 目标字节：60 e6 b8 b2 e6 9f 93 e5 a4 b1 e8 b4 a5 = `渲染失败

const broken = Buffer.from([0x60, 0xe6, 0xb8, 0xb2, 0xe6, 0x9c, 0x8d, 0xe5, 0xa4, 0xb1, 0xe8, 0xb4, 0xa5]);
const fixed = Buffer.from([0x60, 0xe6, 0xb8, 0xb2, 0xe6, 0x9f, 0x93, 0xe5, 0xa4, 0xb1, 0xe8, 0xb4, 0xa5]);

const idx = buf.indexOf(broken);
console.log('idx:', idx);

if (idx > 0) {
  const before = buf.slice(0, idx);
  const after = buf.slice(idx + broken.length);
  const newBuf = Buffer.concat([before, fixed, after]);
  fs.writeFileSync(file, newBuf);
  console.log('Fixed L1565: 渲服失败 → 渲染失败');
  console.log('verify:', JSON.stringify(newBuf.slice(idx, idx+fixed.length).toString('utf8')));
} else {
  console.log('NOT FOUND');
}