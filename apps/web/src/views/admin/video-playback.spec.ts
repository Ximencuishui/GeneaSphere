import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const completed = {
  id: '1',
  title: '回顾',
  video_url: 'https://cdn.example/a.mp4',
  status: 'completed',
  created_at: '2026-01-01T00:00:00.000Z',
  start_year: 1130,
  end_year: 1200,
  event_count: 1,
  duration_seconds: 8,
  file_size: 1024,
  event_type_filter: [],
  style: 'nostalgic',
  branch_filter: '',
}

vi.mock('axios', () => ({
  default: {
    get: vi.fn((url: string) => {
      if (url.includes('/branches')) {
        return Promise.resolve({ data: [{ name: '长房' }] })
      }
      if (url.includes('/preview')) {
        return Promise.resolve({
          data: {
            event_count: 1,
            year_range: { earliest: 1130, latest: 1200 },
            estimated_duration_seconds: 8,
          },
        })
      }
      return Promise.resolve({ data: { items: [completed] } })
    }),
    post: vi.fn(),
  },
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { slug: 'zhu' } }),
  useRouter: () => ({ push: vi.fn() }),
}))

import axios from 'axios'
import EventVideoPage from './EventVideoPage.vue'
import MigrationVideoPage from './MigrationVideoPage.vue'

const listGet = (items: unknown[]) => (url: string) => {
  if (url.includes('/branches')) return Promise.resolve({ data: [{ name: '长房' }] })
  if (url.includes('/preview')) {
    return Promise.resolve({
      data: {
        event_count: 1,
        year_range: { earliest: 1130, latest: 1200 },
        estimated_duration_seconds: 8,
      },
    })
  }
  return Promise.resolve({ data: { items } })
}

async function mountPage(component: object) {
  const wrapper = mount(component)
  await flushPromises()
  return wrapper
}

describe('视频播放按钮', () => {
  beforeEach(() => {
    vi.spyOn(window, 'open').mockImplementation(() => null)
  })

  it('大事件视频点击播放不抛错', async () => {
    const wrapper = await mountPage(EventVideoPage)
    const play = wrapper.findAll('button').find((button) => button.text() === '播放')

    expect(play).toBeTruthy()
    expect(() => play!.trigger('click')).not.toThrow()
    await play!.trigger('click')
    expect(window.open).toHaveBeenCalledWith('https://cdn.example/a.mp4', '_blank')
  })

  it('迁徙历史视频点击播放不抛错', async () => {
    const wrapper = await mountPage(MigrationVideoPage)
    const play = wrapper.findAll('button').find((button) => button.text() === '播放')

    expect(play).toBeTruthy()
    expect(() => play!.trigger('click')).not.toThrow()
    await play!.trigger('click')
    expect(window.open).toHaveBeenCalledWith('https://cdn.example/a.mp4', '_blank')
  })

  it('failed 项目显示生成失败提示且没有播放按钮', async () => {
    const failed = { ...completed, status: 'failed', video_url: null, title: '未生成' }
    vi.mocked(axios.get).mockImplementation(listGet([failed]) as never)
    const eventPage = await mountPage(EventVideoPage)
    const migrationPage = await mountPage(MigrationVideoPage)

    expect(eventPage.text()).toContain('生成失败，请稍后重试')
    expect(eventPage.text()).not.toContain('播放')
    expect(migrationPage.text()).toContain('生成失败，请稍后重试')
    expect(migrationPage.text()).not.toContain('播放')

    vi.mocked(axios.get).mockImplementation(listGet([completed]) as never)
  })

  it('房支接口返回 name 时下拉有该项', async () => {
    const wrapper = await mountPage(MigrationVideoPage)
    await wrapper.get('.el-select').trigger('click')
    await flushPromises()

    expect(document.body.textContent).toContain('长房')
  })
})

function mockAnchorClick() {
  const anchorClick = vi.fn()
  const realCreate = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation(((tagName: string, options?: ElementCreationOptions) => {
    const element = realCreate(tagName, options)
    if (tagName.toLowerCase() === 'a') {
      vi.spyOn(element, 'click').mockImplementation(anchorClick)
    }
    return element
  }) as typeof document.createElement)
  return anchorClick
}

describe('视频下载按钮', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(window, 'open').mockImplementation(() => null)
  })

  it('大事件视频点击下载不抛错', async () => {
    const wrapper = await mountPage(EventVideoPage)
    const anchorClick = mockAnchorClick()
    const download = wrapper.findAll('button').find((button) => button.text() === '下载')

    expect(download).toBeTruthy()
    await expect(download!.trigger('click')).resolves.toBeUndefined()
    expect(anchorClick).toHaveBeenCalled()
  })

  it('迁徙历史视频点击下载不抛错', async () => {
    const wrapper = await mountPage(MigrationVideoPage)
    const anchorClick = mockAnchorClick()
    const download = wrapper.findAll('button').find((button) => button.text() === '下载')

    expect(download).toBeTruthy()
    await expect(download!.trigger('click')).resolves.toBeUndefined()
    expect(anchorClick).toHaveBeenCalled()
  })
})
