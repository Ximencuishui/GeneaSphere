/**
 * 册谱 PDF 的字体。
 * 前端把字体写成 font-family: 宋体 / 楷体 / 仿宋。
 * local() 按顺序找：先是 Windows / macOS 的系统字体，再是容器里单独安装的三款字。
 * 宋体 → AR PL UMing CN，楷体 → LXGW WenKai，仿宋 → 朱雀仿宋。
 * Noto、文泉驿只做缺字回退，不拿来顶替这三款字，否则导出会收成同一种字形。
 * 用户字体如果以 data: 或 https URL 出现，拼进同一段 CSS。
 */

export interface PdfCustomFont {
  family: string
  /** data:font/...;base64,... 、https 字体地址，或已经写好的 url()/local() */
  src: string
}

export interface PdfFontPage {
  addStyleTag(options: { content: string }): Promise<unknown>
  evaluate(fn: (families: string[]) => Promise<void>, families: string[]): Promise<unknown>
}

/** Chromium 启动参数。font-render-hinting=none 避免提示网格把汉字挤糊。 */
export const PUPPETEER_PDF_ARGS = ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none']

const SONG = ['SimSun', 'NSimSun', 'Songti SC', 'STSong', 'AR PL UMing CN', 'Source Han Serif SC']
const KAI = ['KaiTi', 'STKaiti', 'Kaiti SC', 'LXGW WenKai', '霞鹜文楷', 'AR PL UKai CN']
const FANG = [
  'FangSong', 'STFangsong', 'Fangsong SC',
  'Zhuque Fangsong (technical preview)', '朱雀仿宋（预览测试版）',
  'Zhuque Fangsong', '朱雀仿宋',
]
/** 字形里没有的字才落到这里。不放进上面的 src，否则第一款存在的字体会占满整个家族。 */
const CJK_FALLBACK_FAMILY = 'GeneaSphere CJK Fallback'
const CJK_FALLBACK = ['Noto Serif CJK SC', 'Noto Sans CJK SC', 'Source Han Serif SC', 'WenQuanYi Zen Hei']

/** 预置字体，以及册谱旧样式里已经在用的英文家族名。 */
const PRESET_FONTS: { family: string; locals: string[] }[] = [
  { family: '宋体', locals: SONG },
  { family: 'SimSun', locals: SONG },
  { family: '楷体', locals: KAI },
  { family: 'KaiTi', locals: KAI },
  { family: '仿宋', locals: FANG },
  { family: 'FangSong', locals: FANG },
  { family: 'fangsong', locals: FANG },
]

const GENERIC = new Set([
  'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui',
  'ui-serif', 'ui-sans-serif', 'ui-monospace', 'emoji', 'math', 'inherit', 'initial', 'unset',
])

export function buildPdfFontCss(html: string, customFonts: readonly PdfCustomFont[] = []): string {
  const faces = new Map<string, string>()
  for (const font of PRESET_FONTS) {
    faces.set(font.family, localSrc(font.locals))
  }
  for (const family of familiesInHtml(html)) {
    if (!isSafeFamily(family) || faces.has(family)) continue
    faces.set(family, localSrc([family, 'Noto Serif CJK SC', 'Noto Sans CJK SC', 'WenQuanYi Zen Hei']))
  }
  for (const font of [...facesInHtml(html), ...customFonts]) {
    if (!isSafeFamily(font.family)) continue
    const src = normalizeSrc(font.src)
    if (!src || !isSafeFontSrc(src)) continue
    const current = faces.get(font.family)
    if (!current || /url\(/i.test(src)) faces.set(font.family, src)
  }
  const facesCss = [...faces.entries()].map(([family, src]) => fontFaceRule(family, src)).join('\n')
  return `${facesCss}\n${fontFaceRule(CJK_FALLBACK_FAMILY, localSrc(CJK_FALLBACK))}\n${styleFallbackCss()}`
}

/** 行内样式只有「宋体」一个名字。补上后面的家族，缺字才继续找 Noto，而不是画成方块。 */
function styleFallbackCss(): string {
  const stack = (family: string, latin: string) => `"${family}","${latin}","${CJK_FALLBACK_FAMILY}"`
  return [
    ['宋体', 'SimSun'],
    ['楷体', 'KaiTi'],
    ['仿宋', 'FangSong'],
  ].map(([family, latin]) => {
    const selectors = [
      `[style*="font-family: ${family}"]`,
      `[style*="font-family:${family}"]`,
      `[style*="font-family: '${family}'"]`,
      `[style*="font-family:'${family}'"]`,
    ]
    return `${selectors.join(',')}{font-family:${stack(family, latin)} !important;}`
  }).join('\n')
}

/**
 * setContent 之后调用。addStyleTag 必须晚于 setContent，否则新文档会把样式冲掉。
 * 先按家族名 load，再等 document.fonts.ready，避免字没下来就 page.pdf。
 */
export async function injectPdfFonts(
  page: PdfFontPage,
  html: string,
  customFonts: readonly PdfCustomFont[] = [],
): Promise<void> {
  const css = buildPdfFontCss(html, customFonts)
  const families = [...css.matchAll(/font-family:\s*"((?:\\.|[^"])*)"/g)].map((match) => match[1].replace(/\\"/g, '"'))
  if (css) await page.addStyleTag({ content: css })
  await page.evaluate(async (names) => {
    const fonts = (globalThis as { document?: { fonts: { load: (spec: string) => Promise<unknown>; ready: Promise<unknown> } } }).document?.fonts
    if (!fonts) return
    await Promise.all(names.map((name) => fonts.load(`16px "${name.replace(/"/g, '')}"`).catch(() => [])))
    await fonts.ready
  }, families)
}

function fontFaceRule(family: string, src: string): string {
  return `@font-face{font-family:"${escapeCss(family)}";src:${src};font-weight:100 900;font-style:normal;font-display:block;}`
}

function localSrc(names: string[]): string {
  return names.map((name) => `local("${escapeCss(name)}")`).join(',')
}

function familiesInHtml(html: string): string[] {
  const found: string[] = []
  const re = /font-family\s*:/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(html))) {
    const raw = readCssValue(html.slice(match.index + match[0].length), true)
    for (const name of splitCssList(raw)) {
      if (!name || /url\(/i.test(name)) continue
      found.push(name)
    }
  }
  return found
}

function facesInHtml(html: string): PdfCustomFont[] {
  const faces: PdfCustomFont[] = []
  const re = /@font-face\s*\{/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(html))) {
    const body = readCssBlock(html, match.index + match[0].length - 1)
    const family = splitCssList(propertyValue(body, 'font-family'))[0]
    const src = propertyValue(body, 'src')
    if (family && src) faces.push({ family, src })
  }
  return faces
}

function propertyValue(body: string, name: string): string {
  const match = body.match(new RegExp(`(?:^|;)\\s*${name}\\s*:`, 'i'))
  if (!match || match.index === undefined) return ''
  return readCssValue(body.slice(match.index + match[0].length), false)
}

/** 读到分号或块结束。font-family 写在 HTML 属性里时，引号外的引号就是属性结束。 */
function readCssValue(text: string, stopAtBareQuote: boolean): string {
  let quote = ''
  let value = ''
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quote) {
      value += ch
      if (ch === '\\' && i + 1 < text.length) {
        value += text[++i]
        continue
      }
      if (ch === quote) quote = ''
      continue
    }
    if (ch === '"' || ch === "'") {
      const startsToken = value.trim() === '' || /,\s*$/.test(value)
      if (!startsToken && stopAtBareQuote) break
      quote = ch
      value += ch
      continue
    }
    if (ch === ';' || ch === '{' || ch === '}') break
    value += ch
  }
  return value.trim()
}

function readCssBlock(text: string, open: number): string {
  let depth = 0
  let quote = ''
  let body = ''
  for (let i = open; i < text.length; i++) {
    const ch = text[i]
    if (quote) {
      body += ch
      if (ch === '\\' && i + 1 < text.length) {
        body += text[++i]
        continue
      }
      if (ch === quote) quote = ''
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      body += ch
      continue
    }
    if (ch === '{') {
      depth++
      if (depth > 1) body += ch
      continue
    }
    if (ch === '}') {
      depth--
      if (depth === 0) return body
      body += ch
      continue
    }
    body += ch
  }
  return body
}

function splitCssList(value: string): string[] {
  const parts: string[] = []
  let quote = ''
  let current = ''
  for (const ch of value) {
    if (quote) {
      current += ch
      if (ch === quote) quote = ''
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      current += ch
      continue
    }
    if (ch === ',') {
      parts.push(unquote(current))
      current = ''
      continue
    }
    current += ch
  }
  if (current.trim()) parts.push(unquote(current))
  return parts.filter(Boolean)
}

function unquote(value: string): string {
  const trimmed = value.trim()
  const quoted = trimmed.match(/^(['"])(.*)\1$/)
  return (quoted ? quoted[2] : trimmed).trim()
}

function isSafeFamily(name: string): boolean {
  return name.length > 0 && name.length <= 80 && !GENERIC.has(name.toLowerCase()) && !/[<>"\\{}]/.test(name)
}

function normalizeSrc(src: string): string {
  const value = src.trim()
  if (!value) return ''
  if (/^(?:url|local)\(/i.test(value)) return value
  return `url("${escapeCss(value)}")`
}

function isSafeFontSrc(src: string): boolean {
  if (/<\/\s*style/i.test(src) || /javascript:/i.test(src)) return false
  if (/^local\(/i.test(src)) return true
  return /url\(\s*['"]?(?:data:font\/|data:application\/(?:font-woff|font-sfnt|octet-stream)|https:)/i.test(src)
    || /(?:local\(|url\(\s*['"]?(?:data:font\/|https:))/i.test(src)
}

function escapeCss(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}
