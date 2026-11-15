import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import GenealogyManuscriptPage from './GenealogyManuscriptPage.vue'

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    put: vi.fn(),
  },
}))

vi.mock('element-plus', async () => {
  const actual = await vi.importActual<typeof import('element-plus')>('element-plus')
  return {
    ...actual,
    ElMessage: {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn(),
    },
  }
})

const PREFACE = '<h2 style="text-align:center">朱氏族谱谱序</h2><p style="text-indent:2em">盖闻木本水源。</p>'

function volumes() {
  return [
    { catalog_slot: 'preface', type: 'document', title: '卷一 谱序源流', content: PREFACE, config: { note: 1 } },
    { catalog_slot: 'rules-fanli', type: 'document', title: '凡例', content: '<p>凡例正文</p>', config: null },
    { catalog_slot: 'lineage', type: 'shilu', title: '卷三 世系录', content: null, config: { gender_filter: 'male' } },
  ]
}

async function mountPage() {
  vi.mocked(axios.get).mockResolvedValue({ data: volumes() })
  vi.mocked(axios.put).mockResolvedValue({ data: {} })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/zupu/:slug/genealogy/manuscript', component: GenealogyManuscriptPage },
      { path: '/tree/:slug', component: { template: '<div />' } },
    ],
  })
  await router.push('/zupu/zhuxi-demo/genealogy/manuscript')
  await router.isReady()
  const wrapper = mount(GenealogyManuscriptPage, {
    attachTo: document.body,
    global: {
      plugins: [router],
      directives: { loading: {} },
      stubs: {
        ElButton: { template: '<button class="el-btn"><slot /></button>' },
      },
    },
  })
  await flushPromises()
  await new Promise((resolve) => setTimeout(resolve, 0))
  return wrapper
}

describe('谱稿正文编辑器', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.clearAllMocks()
  })

  it('用富文本编辑器显示正文，保存仍提交原来的 HTML 字符串', async () => {
    const wrapper = await mountPage()
    expect(document.querySelector('textarea')).toBeNull()
    expect(document.body.textContent).toContain('首行缩进')
    expect(document.body.textContent).toContain('H2')
    const fontMenu = document.querySelector<HTMLElement>('[data-menu-key="manuscriptFont"]')
    expect(fontMenu).toBeTruthy()
    fontMenu?.click()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(document.body.textContent).toContain('宋体')
    expect(document.body.textContent).toContain('楷体')
    expect(document.body.textContent).toContain('仿宋')
    expect(document.body.textContent).toContain('朱氏族谱谱序')
    expect(document.body.textContent).toContain('盖闻木本水源')

    const save = [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('保存这一槽'))
    save?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(axios.put).toHaveBeenCalledTimes(1)
    const [url, body] = vi.mocked(axios.put).mock.calls[0]
    expect(url).toBe('/api/genealogy/zhuxi-demo/slots/preface')
    expect(body.content).toContain('朱氏族谱')
    expect(body.content).toContain('text-indent')
    expect(body.config).toEqual({ note: 1 })
    wrapper.unmount()
  })

  it('切到世系录再回到谱序，不把别的槽写进当前正文', async () => {
    const wrapper = await mountPage()
    const click = (label: string) => {
      const button = [...document.querySelectorAll('aside button')].find((item) => item.textContent?.includes(label))
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    }
    click('世系录')
    await flushPromises()
    expect(document.body.textContent).toContain('谱系稿里改')

    click('凡例')
    await flushPromises()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(document.body.textContent).toContain('凡例正文')

    click('谱序源流')
    await flushPromises()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(document.body.textContent).toContain('朱氏族谱谱序')
    expect(document.body.textContent).not.toContain('凡例正文')

    const save = [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('保存这一槽'))
    save?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    const body = vi.mocked(axios.put).mock.calls.at(-1)?.[1] as { content: string }
    expect(body.content).toContain('朱氏族谱')
    expect(body.content).not.toContain('凡例正文')
    wrapper.unmount()
  })
})
