import { afterEach, describe, expect, it, vi } from 'vitest'
import { fontFaceSource, loadManuscriptFonts, registerManuscriptFont } from './manuscript-fonts'

describe('谱稿字体加载', () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'FontFace')
  })

  it('没有字体文件时，FontFace 只声明系统字体', () => {
    expect(fontFaceSource({ name: '宋体', locals: ['SimSun', 'Songti SC'] })).toBe('local("SimSun"), local("Songti SC")')
    expect(fontFaceSource({ name: '楷体', locals: ['KaiTi'], file: '  ' })).toBe('local("KaiTi")')
  })

  it('有文件地址时，FontFace 同时加载 url，供编辑区预览', async () => {
    const sources: string[] = []
    const added: string[] = []
    class FakeFontFace {
      constructor(public family: string, public source: string) {}
      load(): Promise<FakeFontFace> {
        sources.push(this.source)
        return Promise.resolve(this)
      }
    }
    vi.stubGlobal('FontFace', FakeFontFace)
    const fonts = document.fonts
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { add: (face: FakeFontFace) => { added.push(face.family) } },
    })

    const ok = await registerManuscriptFont({
      name: '仿宋',
      locals: ['FangSong'],
      file: '/fonts/fangsong.woff2',
    })
    expect(ok).toBe(true)
    expect(sources[0]).toContain('local("FangSong")')
    expect(sources[0]).toContain('url("/fonts/fangsong.woff2")')
    expect(added).toEqual(['仿宋'])

    Object.defineProperty(document, 'fonts', { configurable: true, value: fonts })
    vi.unstubAllGlobals()
  })

  it('某一款加载失败时，其余字体继续注册', async () => {
    const loaded: string[] = []
    class FakeFontFace {
      constructor(public family: string, public source: string) {}
      load(): Promise<FakeFontFace> {
        if (this.family === '楷体') return Promise.reject(new Error('missing'))
        loaded.push(this.family)
        return Promise.resolve(this)
      }
    }
    vi.stubGlobal('FontFace', FakeFontFace)
    const fonts = document.fonts
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { add: () => undefined },
    })
    await loadManuscriptFonts([
      { name: '宋体', locals: ['SimSun'] },
      { name: '楷体', locals: ['KaiTi'] },
      { name: '仿宋', locals: ['FangSong'] },
    ])
    expect(loaded).toEqual(['宋体', '仿宋'])
    Object.defineProperty(document, 'fonts', { configurable: true, value: fonts })
    vi.unstubAllGlobals()
  })
})
