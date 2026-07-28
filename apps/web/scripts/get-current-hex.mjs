import fs from 'fs';
const buf = fs.readFileSync('apps/web/src/components/GenealogyTree.vue');
const lines = buf.toString('utf8').split('\n');

const targets = [
  'ElMessage.info(`宸茬敓',
  'console.warn(\'[GenealogyTree] 缂栬緫',
  'ElMessage.info(\'璇蜂粠',
  'toolbarCollapsed ? \'灞曞紑',
  'searchResultCount > 0 ? `鎵惧埌',
];
for (const t of targets) {
  const idx = lines.findIndex(l => l.includes(t));
  console.log(`\n=== ${t} at line ${idx+1} ===`);
  if (idx >= 0) {
    console.log(JSON.stringify(lines[idx]));
    const start = buf.indexOf(Buffer.from(lines[idx].replace(/\r$/, ''), 'utf8'));
    if (start > 0) {
      const slice = buf.slice(start, start + lines[idx].length + 50);
      console.log('hex:', slice.toString('hex'));
    }
  } else {
    console.log('NOT FOUND');
  }
}