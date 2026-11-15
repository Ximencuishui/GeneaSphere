import { createEditor, createToolbar, SlateTransforms, type IDomEditor } from '@wangeditor/editor'
import { describe, expect, it } from 'vitest'
import { applyManuscriptFont, editorHtmlForStorage, htmlForEditor, registerManuscriptMenus } from './manuscript-editor'
import { MANUSCRIPT_FONT_FAMILY_LIST } from './manuscript-fonts'

const SAMPLE = [
  '<h2 style="text-align:center">朱氏族谱谱序</h2>',
  '<h3 style="text-align:center;color:#666">——暨《紫阳朱氏宗谱》首修序</h3>',
  '<p style="text-indent:2em">盖闻木本水源，人心敦本。</p>',
  '<h4>一、姓氏源流</h4>',
].join('')

function mountEditor(html: string): IDomEditor {
  registerManuscriptMenus()
  const host = document.createElement('div')
  document.body.appendChild(host)
  return createEditor({
    selector: host,
    html,
    config: {
      autoFocus: false,
      scroll: false,
      MENU_CONF: { fontFamily: { fontFamilyList: MANUSCRIPT_FONT_FAMILY_LIST } },
    },
  })
}

async function settle(editor: IDomEditor): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
  editor.destroy()
}

describe('htmlForEditor', () => {
  it('空内容和非法类型退回空段落', () => {
    expect(htmlForEditor('')).toBe('<p><br></p>')
    expect(htmlForEditor('   ')).toBe('<p><br></p>')
    expect(htmlForEditor(null)).toBe('<p><br></p>')
    expect(htmlForEditor(undefined)).toBe('<p><br></p>')
  })

  it('没闭合的标签和纯文本不会抛错', () => {
    expect(() => htmlForEditor('<p>未闭合<b>加粗')).not.toThrow()
    const plain = htmlForEditor('开篇一句')
    expect(plain).toContain('开篇一句')
    expect(plain.startsWith('<p>')).toBe(true)
  })

  it('去掉脚本，并把 font、center 换成编辑器能认的样式', () => {
    const html = htmlForEditor('<script>alert(1)</script><font color="red">红字</font><center>居中一句</center>')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('alert')
    expect(html).toContain('color: red')
    expect(html).toContain('红字')
    expect(html).toContain('text-align: center')
    expect(html).toContain('居中一句')
    expect(html).not.toContain('<font')
    expect(html).not.toContain('<center')
  })

  it('段落上的字体挪进文字样式', () => {
    const html = htmlForEditor('<p style="font-family: 楷体">一段正文</p>')
    expect(html).toContain('font-family: 楷体')
    expect(html).toContain('<span')
    expect(html).toContain('一段正文')
  })

  it('标题上的颜色挪进文字，对齐还留在标题上', () => {
    const html = htmlForEditor('<h3 style="text-align:center;color:#666">序</h3>')
    expect(html).toContain('text-align:center')
    expect(html).toContain('color: #666')
    expect(html).toContain('<span')
    expect(html).toContain('序')
  })
})

describe('editorHtmlForStorage', () => {
  it('编辑器的空文档存成空字符串', () => {
    expect(editorHtmlForStorage('')).toBe('')
    expect(editorHtmlForStorage('<p><br></p>')).toBe('')
    expect(editorHtmlForStorage('<p></p>')).toBe('')
    expect(editorHtmlForStorage('<p>&nbsp;</p>')).toBe('')
  })

  it('有正文或图片时原样保留', () => {
    expect(editorHtmlForStorage('<p style="text-indent:2em">正文</p>')).toContain('正文')
    expect(editorHtmlForStorage('<p><img src="/a.png"></p>')).toContain('<img')
  })
})

describe('WangEditor 读取老谱稿', () => {
  it('标题、居中、首行缩进和颜色能进编辑器再取回 HTML', async () => {
    const editor = mountEditor(htmlForEditor(SAMPLE))
    const html = editor.getHtml()
    expect(html).toContain('朱氏族谱谱序')
    expect(html).toContain('<h2')
    expect(html).toContain('<h3')
    expect(html).toContain('<h4')
    expect(html).toContain('text-align')
    expect(html).toContain('text-indent')
    expect(html).toContain('盖闻木本水源')
    expect(html.toLowerCase()).toContain('color')
    await settle(editor)
  })

  it('不规则标签不会让编辑器崩溃', async () => {
    const messy = '<div><p>甲<b>乙</div><table><tr><td>格</td></table><unknown>丁</unknown><script>alert(1)</script>'
    const editor = mountEditor(htmlForEditor(messy))
    const html = editor.getHtml()
    expect(html).toContain('甲')
    expect(html).toContain('乙')
    expect(html).toContain('丁')
    expect(html).not.toContain('alert')
    await settle(editor)
  })

  it('首行缩进菜单可以重复注册', () => {
    expect(() => {
      registerManuscriptMenus()
      registerManuscriptMenus()
    }).not.toThrow()
  })

  it('首行缩进一次就是两个字符，再点一次取消', async () => {
    const editor = mountEditor(htmlForEditor('<p>一段正文</p>'))
    const bar = document.createElement('div')
    document.body.appendChild(bar)
    createToolbar({
      editor,
      selector: bar,
      config: { toolbarKeys: ['firstLineIndent'] },
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    SlateTransforms.select(editor, {
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [0, 0], offset: 2 },
    })
    const button = bar.querySelector('button')
    expect(button?.textContent).toContain('首行缩进')
    editor.emit('change')
    await new Promise((resolve) => setTimeout(resolve, 0))
    button?.click()
    expect(editor.getHtml()).toMatch(/text-indent:\s*2em/)
    button?.click()
    expect(editor.getHtml()).not.toContain('text-indent')
    await settle(editor)
  })

  it('选中的字和光标所在段落都会把字体写进 HTML', async () => {
    const ranged = mountEditor(htmlForEditor('<p>一段正文</p>'))
    SlateTransforms.select(ranged, {
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [0, 0], offset: 2 },
    })
    applyManuscriptFont(ranged, '楷体')
    const rangedHtml = ranged.getHtml()
    expect(rangedHtml).toMatch(/font-family:\s*楷体/)
    expect(rangedHtml).toContain('一段')
    expect(editorHtmlForStorage(rangedHtml)).toContain('楷体')

    const whole = mountEditor(htmlForEditor('<p>一段正文</p>'))
    SlateTransforms.select(whole, {
      anchor: { path: [0, 0], offset: 1 },
      focus: { path: [0, 0], offset: 1 },
    })
    applyManuscriptFont(whole, '宋体')
    const wholeHtml = whole.getHtml()
    expect(wholeHtml).toMatch(/font-family:\s*宋体/)
    expect(wholeHtml).toContain('一段正文')

    const restored = mountEditor(htmlForEditor(wholeHtml))
    expect(restored.getHtml()).toMatch(/font-family:\s*宋体/)
    await settle(ranged)
    await settle(whole)
    await settle(restored)
  })
})
