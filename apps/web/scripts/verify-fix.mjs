import fs from 'fs';
const buf = fs.readFileSync('apps/web/src/components/GenealogyTree.vue');
const target = Buffer.from("data.gender === 'male' ? '", 'utf8');
const idx = buf.indexOf(target);
console.log('gender idx:', idx);
if (idx > 0) {
  const slice = buf.slice(idx, idx+100);
  console.log('hex:', slice.toString('hex'));
  console.log('decoded utf8:', JSON.stringify(slice.toString('utf8')));
}
const target2 = Buffer.from('console.info(', 'utf8');
let pos = 0;
const results = [];
while (true) {
  const i = buf.indexOf(target2, pos);
  if (i < 0) break;
  results.push(i);
  pos = i + 1;
}
console.log('console.info positions:', results);
for (const i of results) {
  const slice = buf.slice(i, i+200);
  const lineEnd = buf.indexOf(Buffer.from(')', 'utf8'), i);
  const text = buf.slice(i, lineEnd).toString('utf8');
  console.log('  ['+i+']:', JSON.stringify(text));
}