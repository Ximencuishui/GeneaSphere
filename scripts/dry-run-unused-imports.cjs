/**
 * Dry-run: 扫描 src/ 找出可清理的 import
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', 'apps', 'web', 'src');
const TS_FILES = [];

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full);
    else if (e.isFile() && (e.name.endsWith('.ts') || e.name.endsWith('.vue'))) {
      TS_FILES.push(full);
    }
  }
}
walk(ROOT);

function parseNamedImports(spec) {
  const out = [];
  const parts = [];
  let depth = 0;
  let cur = '';
  for (let i = 0; i < spec.length; i++) {
    const ch = spec[i];
    if (ch === '{' || ch === '<' || ch === '(' || ch === '[') depth++;
    else if (ch === '}' || ch === '>' || ch === ')' || ch === ']') depth--;
    else if (ch === ',' && depth === 0) {
      parts.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  parts.push(cur);
  for (const p of parts) {
    const s = p.trim();
    if (!s) continue;
    let isType = false;
    let body = s;
    if (body.startsWith('type ')) {
      isType = true;
      body = body.slice(5).trim();
    }
    let exported, local;
    if (body.includes(' as ')) {
      [exported, local] = body.split(' as ').map((x) => x.trim());
    } else {
      exported = body;
      local = body;
    }
    out.push({ exported, local, isType });
  }
  return out;
}

let stats = { files: 0, removed: 0, details: [] };
for (const file of TS_FILES) {
  const src = fs.readFileSync(file, 'utf8');
  const newSrc = src.replace(/import\s+\{([^}]+)\}\s+from\s+['"][^'"]+['"]\s*;?/g, (full, names) => {
    const items = parseNamedImports(names);
    const kept = items.filter(({ local }) => {
      const esc = local.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rest = src.replace(full, '');
      const re = new RegExp('\\b' + esc + '\\b');
      return re.test(rest);
    });
    if (kept.length === items.length) return full;
    const removedNames = items
      .filter((i) => !kept.find((k) => k.local === i.local))
      .map((i) => i.local);
    stats.removed += removedNames.length;
    stats.details.push({
      file: path.relative(ROOT, file),
      removed: removedNames,
    });
    if (kept.length === 0) return '';
    const ks = kept
      .map(({ exported, local, isType }) => {
        const pre = isType ? 'type ' : '';
        return exported === local ? local : exported + ' as ' + local;
      })
      .join(', ');
    const fromMatch = full.match(/from\s+['"][^'"]+['"]/);
    return 'import { ' + ks + ' } ' + (fromMatch ? fromMatch[0] : '') + ';';
  });
  if (newSrc !== src) stats.files++;
}
console.log('Files:', stats.files, 'Removed:', stats.removed);
for (const d of stats.details) console.log(d.file, '→', d.removed.join(', '));