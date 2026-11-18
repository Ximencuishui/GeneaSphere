import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ElMessage } from 'element-plus'

/**
 * 缺按家族 slug 过滤的人物列表接口，本页不能复用现成函数：
 * - treeApi.searchPersons：GET /api/tree/persons/search，查询参数 q、clan_id（数字 id，不是路由 slug）；服务端 tree.controller 没有这条路由。
 * - familyBookApi.searchPersons：GET /api/family-book/persons/search，参数 keyword、limit；家族取自 JWT 的 clanId，不接收 slug。
 * - lineageVideoApi.searchPersons：GET /api/lineage-video/persons/search，参数同样是 keyword、limit，家族同样来自 JWT。
 * 因此关联人物下拉保持为空并禁用，保存不得写入「示例人物」或假 person_id。
 */
vi.mock('@/api/migration', () => ({
  migrationApi: {
    getEvents: vi.fn().mockResolvedValue([]),
    getBranches: vi.fn().mockResolvedValue([]),
    getMissingCoords: vi.fn().mockResolvedValue([]),
    createEvent: vi.fn().mockResolvedValue({ id: 'evt-1', message: 'ok' }),
    updateEvent: vi.fn().mockResolvedValue({ message: 'ok' }),
    deleteEvent: vi.fn().mockResolvedValue({ message: 'ok' }),
    fillCoords: vi.fn().mockResolvedValue({ message: 'ok' }),
  },
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { slug: 'zhu-shi' } }),
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

import { migrationApi } from '@/api/migration'
import MigrationEventsPage from './MigrationEventsPage.vue'

const routeSlug = 'zhu-shi'

function mountPage() {
  return mount(MigrationEventsPage, {
    global: { directives: { loading: () => undefined } },
  })
}

async function openCreateDialog(wrapper: ReturnType<typeof mountPage>) {
  const button = wrapper.findAll('button').find((item) => item.text().includes('新建迁徙事件'))
  expect(button).toBeTruthy()
  await button!.trigger('click')
  await flushPromises()
}

describe('迁徙事件管理', () => {
  beforeEach(() => {
    vi.mocked(migrationApi.getEvents).mockClear()
    vi.mocked(migrationApi.getBranches).mockClear()
    vi.mocked(migrationApi.getMissingCoords).mockClear()
    vi.mocked(migrationApi.createEvent).mockClear()
    vi.mocked(ElMessage.success).mockClear()
    vi.mocked(ElMessage.error).mockClear()
  })

  it('页面初始化不把「示例人物」写入下拉（缺按家族 slug 过滤的人物列表接口）', async () => {
    const wrapper = mountPage()
    await flushPromises()
    await openCreateDialog(wrapper)

    const personField = wrapper.findAll('.el-form-item').find((item) => item.text().includes('关联人物'))
    expect(personField).toBeTruthy()
    expect(personField!.find('.el-select__wrapper').classes()).toContain('is-disabled')

    const labels = wrapper.findAllComponents({ name: 'ElOption' }).map((option) => String(option.props('label') ?? ''))
    expect(labels.some((label) => label.includes('示例人物'))).toBe(false)
    expect(wrapper.html()).not.toContain('示例人物')
  })

  it('保存迁徙事件时不提交假 person_id（关联人物下拉没有可选的真实 id）', async () => {
    const wrapper = mountPage()
    await flushPromises()
    await openCreateDialog(wrapper)

    await wrapper.get('input[placeholder="如：山西洪洞"]').setValue('山西洪洞')
    await wrapper.get('input[placeholder="如：四川成都"]').setValue('四川成都')

    const save = wrapper.findAll('button').find((item) => item.text().includes('保存'))
    expect(save).toBeTruthy()
    await save!.trigger('click')
    await flushPromises()

    expect(migrationApi.createEvent).toHaveBeenCalledTimes(1)
    const [slug, payload] = vi.mocked(migrationApi.createEvent).mock.calls[0]
    expect(slug).toBe(routeSlug)
    expect(payload.person_id).toBeUndefined()
    expect(JSON.stringify(payload)).not.toContain('示例人物')
  })

  it('初始化用路由 slug 加载迁徙事件，不依赖再选家族', async () => {
    const wrapper = mountPage()
    await flushPromises()

    expect(migrationApi.getEvents).toHaveBeenCalledTimes(1)
    expect(migrationApi.getEvents).toHaveBeenCalledWith(routeSlug)
    expect(migrationApi.getBranches).toHaveBeenCalledWith(routeSlug)
    expect(migrationApi.getMissingCoords).toHaveBeenCalledWith(routeSlug)
    expect(wrapper.text()).toContain('迁徙事件列表')
    expect(wrapper.text()).not.toContain('请先选择')
    expect(wrapper.text()).not.toContain('选择家族')
  })
})
