import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { axiosGet, axiosPost } = vi.hoisted(() => ({
  axiosGet: vi.fn(),
  axiosPost: vi.fn(),
}))

vi.mock('axios', () => ({
  default: {
    get: (url: string) => axiosGet(url),
    post: (url: string, body?: unknown, config?: unknown) => axiosPost(url, body, config),
  },
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { slug: 'zhu' } }),
}))

vi.mock('element-plus', async () => {
  const actual = await vi.importActual<typeof import('element-plus')>('element-plus')
  return {
    ...actual,
    ElMessage: {
      success: vi.fn(),
      warning: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
    },
  }
})

import FamilyEventPage from './FamilyEventPage.vue'

function tokenFor(sub: string) {
  return `x.${btoa(JSON.stringify({ sub }))}.y`
}

describe('家族大事件照片上传', () => {
  beforeEach(() => {
    localStorage.setItem('geneasphere_token', tokenFor('user-9'))
    axiosGet.mockReset()
    axiosPost.mockReset()
    axiosGet.mockImplementation((url: string) => {
      if (String(url).includes('/api/clans/')) return Promise.resolve({ data: { id: '7' } })
      return Promise.resolve({ data: { items: [], total: 0 } })
    })
    axiosPost.mockImplementation((url: string) => {
      if (String(url).includes('/api/media/upload')) {
        return Promise.resolve({
          data: { id: '42', thumb_url: '/media/thumb/a.webp', file_url: '/media/a.jpg' },
        })
      }
      return Promise.resolve({ data: { id: '1' } })
    })
  })

  it('上传回调得到的 id 进入保存 body 的 media_ids', async () => {
    const wrapper = mount(FamilyEventPage, {
      global: { directives: { loading: () => undefined } },
    })
    await flushPromises()

    await wrapper.get('button.el-button--primary').trigger('click')
    await flushPromises()

    const upload = wrapper.findComponent({ name: 'ElUpload' })
    expect(upload.exists()).toBe(true)
    await upload.props('httpRequest')({
      file: new File(['img'], 'a.jpg', { type: 'image/jpeg' }),
      onSuccess: () => undefined,
      onError: () => undefined,
    })
    await flushPromises()

    const dialog = wrapper.get('.el-dialog')
    await dialog.get('input').setValue('祭祖留影')
    await dialog.get('button.el-button--primary').trigger('click')
    await flushPromises()

    expect(axiosPost).toHaveBeenCalledWith(
      '/api/media/upload',
      expect.any(FormData),
      expect.objectContaining({ headers: { 'Content-Type': 'multipart/form-data' } }),
    )
    const saveCall = axiosPost.mock.calls.find((call) => call[0] === '/api/family-events/zhu')
    expect(saveCall?.[1]).toEqual(expect.objectContaining({
      event_name: '祭祖留影',
      media_ids: [42],
    }))
  })
})
