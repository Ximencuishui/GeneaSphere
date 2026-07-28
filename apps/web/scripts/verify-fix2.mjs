import fs from 'fs';
const buf = fs.readFileSync('apps/web/src/components/GenealogyTree.vue');
console.log('total size:', buf.length);
const t = Buffer.from("data.gender === 'male' ? '", 'utf8');
const idx = buf.indexOf(t);
console.log('gender idx:', idx);
if (idx > 0) {
  const s = buf.slice(idx, idx+60);
  console.log('hex:', s.toString('hex'));
  console.log('utf8:', JSON.stringify(s.toString('utf8')));
}
const c = Buffer.from('console.info(', 'utf8');
let pos = 0;
while (true) {
  const i = buf.indexOf(c, pos);
  if (i < 0) break;
  const end = buf.indexOf(Buffer.from(');', 'utf8'), i);
  console.log('console.info ['+i+']:', JSON.stringify(buf.slice(i, end).toString('utf8')));
  pos = i + 1;
}