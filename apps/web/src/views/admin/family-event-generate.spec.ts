import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ElMessage, ElMessageBox } from 'element-plus'

const { axiosPost } = vi.hoisted(() => ({
  axiosPost: vi.fn(),
}))

function defaultPost(url: string, body?: { event_name?: string }) {
  if (url.includes('generate-life-events')) {
    return Promise.resolve({
      data: {
        candidates: [
          { person_id: '101', event_name: '甲诞辰', event_type: 'birth', event_date: '1130-01-01', event_year: 1130 },
          { person_id: '102', event_name: '乙逝世', event_type: 'death', event_date: '1200-01-01', event_year: 1200 },
        ],
      },
    })
  }
  if (body?.event_name === '乙逝世') {
    return Promise.reject(new Error('写入失败'))
  }
  return Promise.resolve({ data: { id: '1' } })
}

vi.mock('axios', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: { items: [], total: 0 } }),
    post: (url: string, body?: { event_name?: string }) => axiosPost(url, body),
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
    ElMessageBox: {
      confirm: vi.fn().mockResolvedValue(undefined),
    },
  }
})

import FamilyEventPage from './FamilyEventPage.vue'

describe('自动生成失败累计', () => {
  beforeEach(() => {
    axiosPost.mockReset()
    axiosPost.mockImplementation(defaultPost)
    vi.mocked(ElMessage.warning).mockClear()
    vi.mocked(ElMessage.success).mockClear()
    vi.mocked(ElMessageBox.confirm).mockClear()
  })

  it('一条创建失败时提示包含失败条数', async () => {
    const wrapper = mount(FamilyEventPage, {
      global: { directives: { loading: () => undefined } },
    })
    await flushPromises()

    await wrapper.get('button.el-button--warning').trigger('click')
    await flushPromises()

    expect(ElMessage.warning).toHaveBeenCalledWith('成功 1 条，失败 1 条')
  })

  it('自动生成 POST 的 body 含 person_id', async () => {
    const wrapper = mount(FamilyEventPage, {
      global: { directives: { loading: () => undefined } },
    })
    await flushPromises()

    await wrapper.get('button.el-button--warning').trigger('click')
    await flushPromises()

    const createCalls = axiosPost.mock.calls.filter((call) => !String(call[0]).includes('generate-life-events'))
    expect(createCalls.map((call) => call[1])).toEqual([
      expect.objectContaining({ person_id: '101', event_name: '甲诞辰', event_type: 'birth' }),
      expect.objectContaining({ person_id: '102', event_name: '乙逝世', event_type: 'death' }),
    ])
  })

  it('已存在或唯一冲突记为跳过', async () => {
    axiosPost.mockImplementation((url: string, body?: { event_name?: string }) => {
      if (url.includes('generate-life-events')) {
        return Promise.resolve({
          data: {
            candidates: [
              { person_id: '101', event_name: '甲诞辰', event_type: 'birth', event_date: '1130-01-01', event_year: 1130 },
              { person_id: '102', event_name: '乙逝世', event_type: 'death', event_date: '1200-01-01', event_year: 1200 },
            ],
          },
        })
      }
      if (body?.event_name === '甲诞辰') return Promise.resolve({ data: { skipped: true } })
      const error = new Error('Unique constraint failed') as Error & { response?: unknown }
      error.response = { status: 500, data: { message: 'Unique constraint failed on the fields: (`person_id`,`event_type`)' } }
      return Promise.reject(error)
    })

    const wrapper = mount(FamilyEventPage, {
      global: { directives: { loading: () => undefined } },
    })
    await flushPromises()

    await wrapper.get('button.el-button--warning').trigger('click')
    await flushPromises()

    expect(ElMessage.success).toHaveBeenCalledWith('已自动生成 0 个事件，跳过 2 条')
    expect(ElMessage.warning).not.toHaveBeenCalled()
  })
})
