import {
  Boot,
  DomEditor,
  SlateEditor,
  SlateElement,
  SlateRange,
  SlateText,
  SlateTransforms,
  type IButtonMenu,
  type IDomEditor,
  type ISelectMenu,
} from '@wangeditor/editor'
import { MANUSCRIPT_FONTS, manuscriptFontStack } from './manuscript-fonts'

const MENU_KEY = 'firstLineIndent'
const FONT_MENU_KEY = 'manuscriptFont'
const INDENT = '2em'

type IndentBlock = { indent?: string | null }

/** 工具栏上的「首行缩进」：点一次写成 text-indent:2em，再点一次取消。 */
class FirstLineIndentMenu implements IButtonMenu {
  readonly title = '首行缩进'
  readonly tag = 'button'
  /** 没点进正文时也保持可点。真正没有段落时 exec 自己返回。 */
  readonly alwaysEnable = true

  getValue(): string {
    return ''
  }

  isActive(editor: IDomEditor): boolean {
    const block = selectedBlock(editor)
    return !!block?.indent && parseFloat(String(block.indent)) > 0
  }

  isDisabled(editor: IDomEditor): boolean {
    return selectedBlock(editor) == null
  }

  exec(editor: IDomEditor): void {
    const block = selectedBlock(editor)
    if (!block) return
    const indented = !!block.indent && parseFloat(String(block.indent)) > 0
    SlateTransforms.setNodes(
      editor,
      { indent: indented ? null : INDENT } as Partial<IndentBlock>,
      { match: (node) => SlateElement.isElement(node), mode: 'highest' },
    )
  }
}

type BlockEntry = [IndentBlock, number[]]

function selectedBlockEntry(editor: IDomEditor): BlockEntry | null {
  try {
    const matches = SlateEditor.nodes(editor, {
      match: (node) => {
        if (!SlateElement.isElement(node)) return false
        const type = DomEditor.getNodeType(node)
        return type === 'paragraph' || type.startsWith('header')
      },
      universal: true,
      mode: 'highest',
    })
    const first = matches.next().value
    if (!first) return null
    return [first[0] as IndentBlock, first[1]]
  } catch {
    return null
  }
}

function selectedBlock(editor: IDomEditor): IndentBlock | null {
  return selectedBlockEntry(editor)?.[0] ?? null
}

type FontText = { fontFamily?: string | null }

/**
 * 选中一段文字时只改选区。光标停在段落里时，整段文字带上 font-family。
 * 字体记在文字标记上，保存出来是 span 的内联样式。
 */
export function applyManuscriptFont(editor: IDomEditor, family: string): void {
  const selection = editor.selection
  if (!selection) return
  const next = family.trim()
  if (!SlateRange.isCollapsed(selection)) {
    if (next) editor.addMark('fontFamily', next)
    else editor.removeMark('fontFamily')
    return
  }
  const entry = selectedBlockEntry(editor)
  if (!entry) return
  SlateTransforms.setNodes(
    editor,
    { fontFamily: next || null } as Partial<FontText>,
    { at: entry[1], match: (node) => SlateText.isText(node) },
  )
  if (next) editor.addMark('fontFamily', next)
  else editor.removeMark('fontFamily')
}

class ManuscriptFontMenu implements ISelectMenu {
  readonly title = '字体'
  readonly tag = 'select'
  readonly width = 88
  readonly alwaysEnable = true

  getOptions(editor: IDomEditor) {
    const current = this.getValue(editor)
    return [
      { value: '', text: '默认', selected: current === '' },
      ...MANUSCRIPT_FONTS.map((font) => ({
        value: font.name,
        text: font.name,
        selected: current === font.name,
        styleForRenderMenuList: { 'font-family': manuscriptFontStack(font.name) },
      })),
    ]
  }

  getValue(editor: IDomEditor): string {
    const selection = editor.selection
    if (!selection) return ''
    if (!SlateRange.isCollapsed(selection)) {
      const marks = SlateEditor.marks(editor) as FontText | null
      return marks?.fontFamily || ''
    }
    const entry = selectedBlockEntry(editor)
    if (!entry) return ''
    const texts = SlateEditor.nodes(editor, {
      at: entry[1],
      match: (node) => SlateText.isText(node),
    })
    const first = texts.next().value
    if (!first) return ''
    return (first[0] as FontText).fontFamily || ''
  }

  isActive(): boolean {
    return false
  }

  isDisabled(editor: IDomEditor): boolean {
    return selectedBlock(editor) == null && !editor.selection
  }

  exec(editor: IDomEditor, value: string | boolean): void {
    applyManuscriptFont(editor, value ? String(value) : '')
  }
}

let menuRegistered = false

/** 注册一次。热更新再次执行时，已注册的菜单键直接跳过。 */
export function registerManuscriptMenus(): void {
  if (menuRegistered) return
  registerMenu(MENU_KEY, () => new FirstLineIndentMenu())
  registerMenu(FONT_MENU_KEY, () => new ManuscriptFontMenu())
  menuRegistered = true
}

function registerMenu(key: string, factory: () => IButtonMenu | ISelectMenu): void {
  try {
    Boot.registerMenu({ key, factory })
  } catch (err) {
    const message = err instanceof Error ? err.message : ''
    if (!message.includes('Duplicated')) throw err
  }
}

export const MANUSCRIPT_INDENT_MENU = MENU_KEY
export const MANUSCRIPT_FONT_MENU = FONT_MENU_KEY

const BLOCK_COLOR_SELECTOR = 'h1,h2,h3,h4,h5,h6,p,li,blockquote'
const ALIGN_BLOCK_SELECTOR = 'p,h1,h2,h3,h4,h5,h6,div,blockquote,ul,ol'

/**
 * 老谱稿交给编辑器之前先整理一遍。
 * 浏览器会补上没闭合的标签；编辑器认不出的 font / center 换成它能往返的样式。
 * 解析失败时退回空段落，避免整页崩掉。
 */
export function htmlForEditor(raw: unknown): string {
  const source = typeof raw === 'string' ? raw.replace(/^\uFEFF/, '').trim() : ''
  if (!source) return '<p><br></p>'
  try {
    const doc = new DOMParser().parseFromString(
      `<div id="gs-manuscript-root">${source}</div>`,
      'text/html',
    )
    const root = doc.getElementById('gs-manuscript-root')
    if (!root) return '<p><br></p>'
    root.querySelectorAll('script,style,iframe,object,embed,link,meta').forEach((el) => el.remove())
    replaceFont(root)
    replaceCenter(root)
    liftBlockColor(root)
    liftBlockFontFamily(root)
    sanitizeTree(root)
    const html = root.innerHTML.trim()
    return html || '<p><br></p>'
  } catch {
    return '<p><br></p>'
  }
}

/** 编辑器空文档是 `<p><br></p>`，存回接口时仍用空字符串。有图的段落保留。 */
export function editorHtmlForStorage(html: string): string {
  const trimmed = (html || '').replace(/^\uFEFF/g, '').trim()
  if (!trimmed) return ''
  if (/<img\b/i.test(trimmed)) return trimmed
  const text = trimmed
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\u00a0/g, ' ')
    .trim()
  return text ? trimmed : ''
}

function replaceFont(root: HTMLElement): void {
  root.querySelectorAll('font').forEach((font) => {
    const span = font.ownerDocument.createElement('span')
    const parts: string[] = []
    const color = font.getAttribute('color')?.trim()
    const style = font.getAttribute('style')?.trim()
    if (color) parts.push(`color: ${color}`)
    if (style) parts.push(style.replace(/;?\s*$/, ''))
    if (parts.length) span.setAttribute('style', parts.join('; '))
    while (font.firstChild) span.appendChild(font.firstChild)
    font.replaceWith(span)
  })
}

function replaceCenter(root: HTMLElement): void {
  root.querySelectorAll('center').forEach((center) => {
    const blocks = [...center.children].filter((child) => ALIGN_BLOCK_SELECTOR.split(',').includes(child.tagName.toLowerCase()))
    const onlyBlocks = blocks.length > 0 && [...center.childNodes].every((node) => {
      if (node.nodeType === Node.TEXT_NODE) return !(node.textContent || '').trim()
      return node.nodeType === Node.ELEMENT_NODE && blocks.includes(node as Element)
    })
    if (onlyBlocks) {
      blocks.forEach((child) => addTextAlign(child))
      const parent = center.parentNode
      while (center.firstChild) parent?.insertBefore(center.firstChild, center)
      center.remove()
      return
    }
    const paragraph = center.ownerDocument.createElement('p')
    paragraph.setAttribute('style', 'text-align: center')
    while (center.firstChild) paragraph.appendChild(center.firstChild)
    center.replaceWith(paragraph)
  })
}

function addTextAlign(element: Element): void {
  const style = element.getAttribute('style') || ''
  if (/text-align\s*:/i.test(style)) return
  const next = style.trim().replace(/;?\s*$/, '')
  element.setAttribute('style', next ? `${next}; text-align: center` : 'text-align: center')
}

/** 段落上的 font-family 编辑器记在文字上，先挪进 span，保存和再打开才还是同一款字。 */
function liftBlockFontFamily(root: HTMLElement): void {
  root.querySelectorAll(BLOCK_COLOR_SELECTOR).forEach((el) => {
    const style = el.getAttribute('style') || ''
    const match = style.match(/(?:^|;)\s*font-family\s*:\s*([^;]+)/i)
    if (!match) return
    const family = match[1].trim().replace(/^['"]|['"]$/g, '')
    const rest = stripStyle(style, /(?:^|;)\s*font-family\s*:\s*[^;]+/gi)
    if (rest) el.setAttribute('style', rest)
    else el.removeAttribute('style')
    if (!family || !el.firstChild) return
    if ([...el.children].some((child) => /font-family\s*:/i.test(child.getAttribute('style') || ''))) return
    const span = el.ownerDocument.createElement('span')
    span.setAttribute('style', `font-family: ${family}`)
    while (el.firstChild) span.appendChild(el.firstChild)
    el.appendChild(span)
  })
}

function stripStyle(style: string, pattern: RegExp): string {
  return style
    .replace(pattern, '')
    .replace(/^[;\s]+|[;\s]+$/g, '')
    .replace(/;{2,}/g, ';')
    .trim()
}

/** 标题上的 color 编辑器只认文字节点上的颜色，先挪进 span，避免一打开就丢掉。 */
function liftBlockColor(root: HTMLElement): void {
  root.querySelectorAll(BLOCK_COLOR_SELECTOR).forEach((el) => {
    const style = el.getAttribute('style') || ''
    const match = style.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i)
    if (!match) return
    const color = match[1].trim()
    const rest = stripStyle(style, /(?:^|;)\s*color\s*:\s*[^;]+/gi)
    if (rest) el.setAttribute('style', rest)
    else el.removeAttribute('style')
    if ([...el.children].some((child) => /(?:^|;)\s*color\s*:/i.test(child.getAttribute('style') || ''))) return
    if (!el.firstChild) return
    const span = el.ownerDocument.createElement('span')
    span.setAttribute('style', `color: ${color}`)
    while (el.firstChild) span.appendChild(el.firstChild)
    el.appendChild(span)
  })
}

const SAFE_BLOCKS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'blockquote', 'ul', 'ol', 'table', 'pre', 'hr'])
const SAFE_INLINE = new Set(['span', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del', 'a', 'code', 'sub', 'sup'])

/**
 * 只留下编辑器注册过的块。div、自定义标签里的文字如果直接挂到根上，
 * WangEditor 会抛 “Text node parent is Editor”。
 */
function sanitizeTree(root: HTMLElement): void {
  const blocks: HTMLElement[] = []
  collectBlocks(root, blocks)
  root.replaceChildren(...(blocks.length ? blocks : [emptyParagraph(root.ownerDocument)]))
}

function collectBlocks(parent: ParentNode, blocks: HTMLElement[]): void {
  const doc = (parent as Node).ownerDocument
  if (!doc) return
  let inline: Node[] = []
  const flush = () => {
    const meaningful = inline.filter((node) => {
      if (node.nodeType === Node.TEXT_NODE) return !!(node.textContent || '').trim()
      return true
    })
    inline = []
    if (!meaningful.length) return
    const paragraph = doc.createElement('p')
    meaningful.forEach((node) => paragraph.appendChild(node))
    blocks.push(paragraph)
  }

  for (const node of [...parent.childNodes]) {
    if (node.nodeType === Node.TEXT_NODE) {
      if ((node.textContent || '').trim()) inline.push(node.cloneNode())
      continue
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue
    const element = node as HTMLElement
    const tag = element.tagName.toLowerCase()
    if (tag === 'br') {
      flush()
      continue
    }
    if (SAFE_INLINE.has(tag) || tag === 'img') {
      inline.push(...cloneInlineNodes(element))
      continue
    }
    if (tag === 'h6') {
      flush()
      blocks.push(cloneBlock(element, 'h5'))
      continue
    }
    if (tag === 'table') {
      flush()
      const table = sanitizeTable(element)
      if (table) blocks.push(table)
      else pushTextBlocks(element, blocks)
      continue
    }
    if (tag === 'ul' || tag === 'ol') {
      flush()
      blocks.push(sanitizeList(element))
      continue
    }
    if (tag === 'pre') {
      flush()
      blocks.push(sanitizePre(element))
      continue
    }
    if (tag === 'hr') {
      flush()
      blocks.push(doc.createElement('hr'))
      continue
    }
    if (SAFE_BLOCKS.has(tag)) {
      flush()
      blocks.push(cloneBlock(element, tag))
      continue
    }
    flush()
    collectBlocks(element, blocks)
  }
  flush()
}

function cloneInlineNodes(element: HTMLElement): Node[] {
  const holder = element.ownerDocument.createElement('span')
  const dummy = element.ownerDocument.createElement('div')
  dummy.appendChild(element.cloneNode(true))
  appendInlines(dummy, holder)
  return [...holder.childNodes]
}

function cloneBlock(element: HTMLElement, tag: string): HTMLElement {
  const copy = element.ownerDocument.createElement(tag)
  const style = element.getAttribute('style')
  if (style) copy.setAttribute('style', style)
  appendInlines(element, copy)
  if (!copy.childNodes.length) copy.appendChild(element.ownerDocument.createElement('br'))
  return copy
}

function appendInlines(source: ParentNode, target: HTMLElement): void {
  const doc = target.ownerDocument
  for (const node of [...source.childNodes]) {
    if (node.nodeType === Node.TEXT_NODE) {
      target.appendChild(node.cloneNode())
      continue
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue
    const child = node as HTMLElement
    const tag = child.tagName.toLowerCase()
    if (tag === 'br') {
      target.appendChild(doc.createElement('br'))
      continue
    }
    if (tag === 'img') {
      const src = child.getAttribute('src')
      if (!src) continue
      const img = doc.createElement('img')
      img.setAttribute('src', src)
      const alt = child.getAttribute('alt')
      if (alt) img.setAttribute('alt', alt)
      target.appendChild(img)
      continue
    }
    if (SAFE_INLINE.has(tag)) {
      const copy = doc.createElement(tag)
      const style = child.getAttribute('style')
      if (style) copy.setAttribute('style', style)
      if (tag === 'a') {
        const href = child.getAttribute('href')
        if (href) copy.setAttribute('href', href)
      }
      appendInlines(child, copy)
      target.appendChild(copy)
      continue
    }
    if (SAFE_BLOCKS.has(tag) || tag === 'div' || tag === 'section' || tag === 'article') {
      appendInlines(child, target)
      continue
    }
    appendInlines(child, target)
  }
}

function sanitizeList(element: HTMLElement): HTMLElement {
  const list = element.ownerDocument.createElement(element.tagName.toLowerCase())
  const items = [...element.children].filter((child) => child.tagName.toLowerCase() === 'li')
  const source = items.length ? items : [element]
  source.forEach((item) => {
    const li = element.ownerDocument.createElement('li')
    appendInlines(item, li)
    if (!li.childNodes.length) li.appendChild(element.ownerDocument.createElement('br'))
    list.appendChild(li)
  })
  return list
}

function sanitizeTable(element: HTMLElement): HTMLElement | null {
  const doc = element.ownerDocument
  const table = doc.createElement('table')
  element.querySelectorAll('tr').forEach((row) => {
    const tr = doc.createElement('tr')
    ;[...row.children].forEach((cell) => {
      const name = cell.tagName.toLowerCase()
      if (name !== 'td' && name !== 'th') return
      const next = doc.createElement(name)
      appendInlines(cell, next)
      tr.appendChild(next)
    })
    if (tr.childNodes.length) table.appendChild(tr)
  })
  return table.childNodes.length ? table : null
}

function sanitizePre(element: HTMLElement): HTMLElement {
  const pre = element.ownerDocument.createElement('pre')
  const code = element.ownerDocument.createElement('code')
  code.textContent = element.textContent ?? ''
  pre.appendChild(code)
  return pre
}

function pushTextBlocks(element: HTMLElement, blocks: HTMLElement[]): void {
  const text = (element.textContent || '').trim()
  if (!text) return
  const paragraph = element.ownerDocument.createElement('p')
  paragraph.textContent = text
  blocks.push(paragraph)
}

function emptyParagraph(doc: Document): HTMLElement {
  const paragraph = doc.createElement('p')
  paragraph.appendChild(doc.createElement('br'))
  return paragraph
}
