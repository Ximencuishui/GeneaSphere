import fs from 'fs';
const buf = fs.readFileSync('apps/web/src/components/GenealogyTree.vue');
// 检查 L1494 周围 100 bytes
const start = 61800;
const slice = buf.slice(start, start+150);
console.log('hex:', slice.toString('hex'));
console.log('utf8:', JSON.stringify(slice.toString('utf8')));
// 重新做 lineEnd 的查找
const t = Buffer.from("data.gender === 'male' ? '", 'utf8');
const idx = buf.indexOf(t);
console.log('idx:', idx);
let lineEnd = buf.indexOf(Buffer.from(';', 'utf8'), idx);
console.log('lineEnd:', lineEnd);
// 看看 idx..lineEnd 之间的字节
const between = buf.slice(idx, lineEnd+1);
console.log('between hex:', between.toString('hex'));
console.log('between utf8:', JSON.stringify(between.toString('utf8')));