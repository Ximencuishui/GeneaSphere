/**
 * 批量修复 api/*.ts 中的 axios 泛型问题
 *
 * 将 `request.get<T>(...)` 改为 `request.get<T, T>(...)`，
 * 让 axios 返回 Promise<T> 而非 Promise<AxiosResponse<T>>。
 *
 * 同时处理 .post<T>、.put<T>、.delete<T> 模式。
 */
const fs = require('fs');
const path = require('path');

const API_DIR = path.join(__dirname, '..', 'apps', 'web', 'src', 'api');

const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

// 匹配 `request.<method><TypeName>(` 模式（泛型只有一个参数）
const PATTERN = new RegExp(
  `request\\.(${METHODS.join('|')})<([A-Za-z_][\\w<>\\[\\]\\s,]*?)>`,
  'g',
);

let totalFiles = 0;
let totalReplacements = 0;

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      walk(full);
    } else if (e.isFile() && e.name.endsWith('.ts')) {
      processFile(full);
    }
  }
}

function processFile(file) {
  const before = fs.readFileSync(file, 'utf8');
  // 跳过已经是 `<X, X>` 的情况
  const after = before.replace(PATTERN, (match, method, type, offset, src) => {
    // 检查是否已经是两个泛型参数
    const next = src.slice(offset + match.length, offset + match.length + 10);
    if (next.startsWith(',')) return match; // 已经是双泛型
    return `request.${method}<${type}, ${type}>`;
  });
  if (after !== before) {
    fs.writeFileSync(file, after, 'utf8');
    totalFiles++;
    const count = (before.match(PATTERN) || []).length;
    totalReplacements += count;
    console.log(`  ${path.relative(API_DIR, file)}: ${count} 处替换`);
  }
}

console.log(`扫描 ${API_DIR} ...`);
walk(API_DIR);
console.log(`\n完成：${totalFiles} 个文件，${totalReplacements} 处替换。`);
