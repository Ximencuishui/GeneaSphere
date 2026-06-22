const fs = require('fs');
const path = require('path');
const dir = 'e:/GeneaSphere/apps/web/src/views/platform-admin';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.vue'));
for (const name of files) {
  const f = path.join(dir, name);
  let c = fs.readFileSync(f, 'utf8');
  const orig = c;
  // 修复 `n 字面字符 → 换行
  c = c.replace(/`n\s*<span>\{\{ row\.family\.name \}\}<\/span>\s*`n/g, '\n            <span>{{ row.family.name }}</span>\n          ');
  c = c.replace(/`n\s*<span>\{\{ row\.clan\.name \}\}<\/span>\s*`n/g, '\n            <span>{{ row.clan.name }}</span>\n          ');
  if (c !== orig) {
    fs.writeFileSync(f, c, 'utf8');
    console.log('Fixed', name);
  }
}
