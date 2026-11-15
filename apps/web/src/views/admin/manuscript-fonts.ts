/**
 * 谱稿三款正文字体。
 * 仓库里没有字体文件时，用 FontFace 的 local() 挂到系统字体上。
 * 以后用户上传字体，把文件地址填进 file，再调用 registerManuscriptFont。
 */
export interface ManuscriptFont {
  /** 下拉框文字，也是写进 HTML 的 font-family 名字 */
  name: string
  /** 系统里可能出现的字体名。FontFace 会按这个顺序找本机字体 */
  locals: string[]
  /**
   * 自定义字体文件地址，例如上传接口返回的 https URL，或 URL.createObjectURL 的 blob 地址。
   * 留空就只用 locals。
   */
  file?: string
}

export const MANUSCRIPT_FONTS: ManuscriptFont[] = [
  { name: '宋体', locals: ['SimSun', '宋体', 'NSimSun', 'STSong', 'Songti SC'] },
  { name: '楷体', locals: ['KaiTi', '楷体', 'STKaiti', 'Kaiti SC'] },
  { name: '仿宋', locals: ['FangSong', '仿宋', 'STFangsong', 'Fangsong SC'] },
]

/** 交给 WangEditor，老 HTML 里的这三款字体读回来才不会被丢掉。 */
export const MANUSCRIPT_FONT_FAMILY_LIST = MANUSCRIPT_FONTS.map((font) => ({
  name: font.name,
  value: font.name,
}))

export function manuscriptFontStack(name: string): string {
  const font = MANUSCRIPT_FONTS.find((item) => item.name === name)
  if (!font) return name
  return [font.name, ...font.locals].join(', ')
}

/** 进入页面时注册三款字体。单款失败不影响其余，调用方不用再接拒绝。 */
export function loadManuscriptFonts(fonts: readonly ManuscriptFont[] = MANUSCRIPT_FONTS): Promise<void> {
  return Promise.all(fonts.map((font) => registerManuscriptFont(font))).then(() => undefined)
}

/**
 * 把一款字体注册进 document.fonts。
 * file 有值时追加 url()，上传的字体文件因此可以在编辑区里预览。
 */
export async function registerManuscriptFont(font: ManuscriptFont): Promise<boolean> {
  if (typeof FontFace === 'undefined' || typeof document === 'undefined' || !document.fonts?.add) return false
  const source = fontFaceSource(font)
  if (!source) return false
  try {
    const face = new FontFace(font.name, source)
    document.fonts.add(await face.load())
    return true
  } catch {
    return false
  }
}

export function fontFaceSource(font: ManuscriptFont): string {
  const parts = font.locals
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => `local("${name.replace(/"/g, '')}")`)
  const file = font.file?.trim()
  if (file) parts.push(`url("${file.replace(/"/g, '')}")`)
  return parts.join(', ')
}
