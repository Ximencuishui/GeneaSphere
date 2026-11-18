import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ElMessage } from 'element-plus'

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

async function chooseCsv(wrapper: ReturnType<typeof mount>) {
  const input = wrapper.get('input[type="file"]')
  const file = new File(['event_name,event_type\n祭祖,ancestor_worship\n'], 'events.csv', { type: 'text/csv' })
  Object.defineProperty(input.element, 'files', { configurable: true, value: [file] })
  await input.trigger('change')
  await flushPromises()
  return input
}

describe('家族大事件 CSV 导入', () => {
  beforeEach(() => {
    axiosGet.mockReset()
    axiosPost.mockReset()
    axiosGet.mockResolvedValue({ data: { items: [], total: 0 } })
    vi.mocked(ElMessage.success).mockClear()
    vi.mocked(ElMessage.warning).mockClear()
    vi.mocked(ElMessage.error).mockClear()
  })

  it('导入成功后 ElMessage 文案是成功导入 N 条，跳过 M 条重复生卒，失败 K 条', async () => {
    axiosPost.mockResolvedValue({ data: { success: 2, skipped: 1, failed: 1 } })
    const wrapper = mount(FamilyEventPage, {
      global: { directives: { loading: () => undefined } },
    })
    await flushPromises()

    const input = await chooseCsv(wrapper)

    expect(axiosPost).toHaveBeenCalledWith(
      '/api/family-events/zhu/import-csv',
      expect.any(FormData),
      expect.objectContaining({ headers: { 'Content-Type': 'multipart/form-data' } }),
    )
    expect(ElMessage.warning).toHaveBeenCalledWith('成功导入 2 条，跳过 1 条重复生卒，失败 1 条')
    expect((input.element as HTMLInputElement).value).toBe('')
    expect(axiosGet).toHaveBeenCalledTimes(2)
  })

  it('CSV 解析失败时 ElMessage.error 含后端提示', async () => {
    const error = new Error('bad') as Error & { response?: unknown }
    error.response = { status: 400, data: { message: 'CSV 解析失败：引号未闭合' } }
    axiosPost.mockRejectedValue(error)
    const wrapper = mount(FamilyEventPage, {
      global: { directives: { loading: () => undefined } },
    })
    await flushPromises()
    vi.mocked(ElMessage.error).mockClear()

    await chooseCsv(wrapper)

    expect(ElMessage.error).toHaveBeenCalledWith(expect.stringContaining('CSV 解析失败：引号未闭合'))
    expect(ElMessage.success).not.toHaveBeenCalled()
    expect(ElMessage.warning).not.toHaveBeenCalled()
  })
})
