#!/usr/bin/env node
/**
 * 静态交叉核对：菜单项路径 vs 路由配置一致性 (v2)
 * 用法: node scripts/audit-menus-routes.mjs
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const norm = (p) => p.replace(/:[^/]+/g, ':p')
const joinPath = (parent, child) => {
  if (!child) return parent || '/'
  if (child === '') return parent || '/'
  const base = parent === '/' || !parent ? '' : parent
  return `${base}/${child}`.replace(/\/+/g, '/')
}

// ---------- 通用对象字面量解析器 ----------
// 把 JS 源码中的对象数组解析为 {props} 列表（只处理字符串值 + children 数组）
function parseRouteRecords(src) {
  const records = []
  // 匹配 route record 对象：以 { 开头，含 path: '...' 或 component 等
  // 用逐字符扫描找顶层对象
  let i = 0
  const len = src.length
  const results = []
  while (i < len) {
    const open = src.indexOf('{', i)
    if (open === -1) break
    // 从 open 开始找匹配的 }
    let depth = 0
    let j = open
    let inStr = false
    let strCh = ''
    let end = -1
    for (; j < len; j++) {
      const ch = src[j]
      if (inStr) {
        if (ch === '\\') { j++; continue }
        if (ch === strCh) inStr = false
        continue
      }
      if (ch === '"' || ch === "'" || ch === '`') { inStr = true; strCh = ch; continue }
      if (ch === '{') depth++
      else if (ch === '}') { depth--; if (depth === 0) { end = j; break } }
    }
    if (end === -1) break
    const objSrc = src.slice(open + 1, end)
    // 提取属性
    const props = {}
    const pathM = objSrc.match(/(?:^|,)\s*path:\s*(?:(?:'([^']*)')|(?:"([^"]*)")|(`([^`]*)`))/)
    const nameM = objSrc.match(/(?:^|,)\s*name:\s*'([^']+)'/)
    const hasChildren = /\bchildren\s*:\s*\[/.test(objSrc)
    const hasComponent = /\bcomponent\s*:/.test(objSrc)
    const hasRedirect = /\bredirect\s*:/.test(objSrc)
    const metaM = objSrc.match(/\bmeta:\s*\{([\s\S]*?)\}/)
    let title = ''
    if (metaM) {
      const tm = metaM[1].match(/title:\s*'([^']*)'/)
      if (tm) title = tm[1]
    }
    if (pathM || nameM) {
      props.path = pathM ? (pathM[1] ?? pathM[2] ?? pathM[3] ?? '') : undefined
      props.name = nameM ? nameM[1] : undefined
      props.hasChildren = hasChildren
      props.hasComponent = hasComponent
      props.hasRedirect = hasRedirect
      props.title = title
      results.push({ props, start: open, end })
    }
    // 从 open+1 继续，确保嵌套在 children 里的子路由对象也能被扫描到
    i = open + 1
  }
  // 组织父子关系：外层记录包含 children，内层记录在其区间内
  const top = results.filter((r) => !results.some((o) => o.start < r.start && o.end > r.end))
  const getChildrenOf = (rec) => results.filter((o) => o.start > rec.start && o.end < rec.end && !results.some((mid) => mid.start > rec.start && mid.end < rec.end && mid.start < o.start && mid.end > o.end))
  const out = []
  const walk = (rec, parentPath) => {
    const p = rec.props
    const full = p.path === undefined ? parentPath : joinPath(parentPath, p.path)
    if (p.name) {
      out.push({ path: full, name: p.name, title: p.title, redirect: p.hasRedirect, component: p.hasComponent })
    } else if (p.hasRedirect && p.path) {
      out.push({ path: full, name: `(redirect)`, title: '', redirect: true })
    }
    if (p.hasChildren) {
      for (const c of getChildrenOf(rec)) walk(c, full)
    }
  }
  for (const rec of top) walk(rec, '')
  return out
}

let routerSrc = readFileSync(join(ROOT, 'apps/web/src/router/index.ts'), 'utf8')
// 先剥离注释（// 与 /* */），避免 { 后紧跟注释导致属性正则失配
routerSrc = routerSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
const routeRecords = parseRouteRecords(routerSrc)
const routePaths = new Set(routeRecords.filter((r) => !r.redirect).map((r) => norm(r.path)))
const nameToPath = new Map(routeRecords.filter((r) => r.name).map((r) => [r.name, r.path]))

// ---------- 布局菜单解析 ----------
function parseLayout(file) {
  const src = readFileSync(join(ROOT, 'apps/web/src/layouts', file), 'utf8')
  const items = []
  const groupRe = /\{\s*(?:title|name):\s*'([^']+)',[\s\S]*?children:\s*\[([\s\S]*?)\n\s*\],\s*\}/g
  let g
  while ((g = groupRe.exec(src)) !== null) {
    const groupTitle = g[1]
    const childrenSrc = g[2]
    const childRe = /\{\s*title:\s*'([^']+)',[\s\S]*?path:\s*(?:(?:'([^']*)')|(`([^`]*)`))\s*\}/g
    let c
    while ((c = childRe.exec(childrenSrc)) !== null) {
      const title = c[1]
      // c[2]=单引号内容, c[4]=反引号模板内容（c[3] 含反引号）
      let path = c[2] ?? c[4] ?? ''
      path = path.replace(/\$\{[^}]+\}/g, ':p') // 模板变量 → 参数
      path = path.split('?')[0]
      items.push({ group: groupTitle, title, path: norm(path) })
    }
  }
  return items
}

const adminMenu = parseLayout('AdminLayout.vue')
const userMenu = parseLayout('UserCenterLayout.vue')
const platformMenu = parseLayout('PlatformAdminLayout.vue')

function audit(name, menu) {
  console.log(`\n========== ${name} (${menu.length} 个菜单项) ==========`)
  let noRoute = 0
  const seen = new Map()
  for (const item of menu) {
    const key = `${item.group}::${item.path}`
    seen.set(key, (seen.get(key) || 0) + 1)
    if (!routePaths.has(item.path)) {
      noRoute++
      console.log(`  ❌ [无对应路由] 「${item.group}」→「${item.title}」 ${item.path}`)
    }
  }
  for (const [k, v] of seen) if (v > 1) console.log(`  ⚠️ [重复路径] ${k} x${v}`)
  if (noRoute === 0) console.log('  ✅ 全部菜单路径均可命中路由')
  return noRoute
}

audit('家族管理后台 AdminLayout', adminMenu)
audit('用户中心 UserCenterLayout', userMenu)
audit('平台管理后台 PlatformAdminLayout', platformMenu)

// ---------- 路由孤儿 ----------
console.log(`\n========== 路由清单（含未入菜单项） ==========`)
const allMenuPaths = new Set([...adminMenu, ...userMenu, ...platformMenu].map((i) => i.path))
for (const r of routeRecords) {
  if (!r.name || r.redirect) continue
  const inMenu = allMenuPaths.has(norm(r.path))
  console.log(`  ${inMenu ? '✅' : '—'} ${r.name.padEnd(38)} ${r.path.padEnd(42)} ${r.title || ''}`)
}
