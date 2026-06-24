/**
 * 统一所有 api/*.ts 中的 axios 泛型为双泛型 <T, T>
 *
 * 规则：将 `request.get<T>(` / `request.post<T>(` / `request.put<T>(` / `request.delete<T>(`
 * 中只有一个泛型参数的情况，自动补成 `<T, T>`。
 *
 * 已经双泛型 `<X, Y>` 的保持不变。
 * 顶层逗号感知，避免破坏嵌套泛型 `<Foo<Bar>>` 等。
 */
const fs = require('fs');
const path = require('path');

const API_DIR = path.join(__dirname, '..', 'apps', 'web', 'src', 'api');
const METHODS = ['get', 'post', 'put', 'patch', 'delete'];
const PATTERN = new RegExp(
  `request\\.(${METHODS.join('|')})<([^<>]*(?:<[^<>]*(?:<[^<>]*>[^<>]*)*>[^<>]*)*)>`,
  'g',
);

/**
 * 按顶层逗号切分。感知 < > 嵌套。
 */
function splitTopLevel(str, sep) {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '<') depth++;
    else if (ch === '>') depth--;
    else if (ch === sep && depth === 0) {
      parts.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  parts.push(cur);
  return parts.map((s) => s.trim());
}

let totalFiles = 0;
let totalReplacements = 0;

function processFile(file) {
  const before = fs.readFileSync(file, 'utf8');
  const after = before.replace(PATTERN, (match, method, inner, offset, src) => {
    // 已经有第二个参数 → 跳过
    const parts = splitTopLevel(inner, ',');
    if (parts.length >= 2) return match;
    // 单一参数 → 补成 `<T, T>`
    totalReplacements++;
    return `request.${method}<${inner}, ${inner}>`;
  });
  if (after !== before) {
    fs.writeFileSync(file, after, 'utf8');
    totalFiles++;
    const rel = path.relative(API_DIR, file);
    console.log(`  ${rel}: 单泛型 → 双泛型`);
  }
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full);
    else if (e.isFile() && e.name.endsWith('.ts')) processFile(full);
  }
}

console.log(`扫描 ${API_DIR} ...`);
walk(API_DIR);
console.log(`\n完成：${totalFiles} 个文件，${totalReplacements} 处替换。`);