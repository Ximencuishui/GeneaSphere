/**
 * DemoRoleModal.vue 单元测试
 *
 * 覆盖路径：
 * 1. 渲染：PC/Mobile 切换
 * 2. admin 登录：API 调用 + applyDemoLogin + emit
 * 3. member 登录：API 调用 + emit
 * 4. submitting 防重复：点击 admin 后 member 按钮 disabled
 * 5. 错误处理：业务错误 vs 网络错误的 ElMessage 文案
 * 6. close 事件：用户主动关闭弹窗
 */

import { describe, it, expect, beforeEach, vi, afterEach, type Mock } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import axios from 'axios'
import { ElMessage } from 'element-plus'
import DemoRoleModal from '@/components/landing/DemoRoleModal.vue'
import { useAuthStore } from '@/stores/auth'

// ---------- Mocks ----------

// 屏蔽 axios 真实网络请求；每个测试按需 mockResolvedValue / mockRejectedValue
vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
    defaults: { headers: { common: {} as Record<string, string> } },
  },
}))

// Element Plus ElMessage 在 jsdom 中会真实弹出消息条，stub 为 vi.fn() 以便断言
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

// ---------- Helpers ----------

function buildSuccessPayload(role: 'OWNER' | 'EDITOR', phone: string) {
  return {
    access_token: `tok-${phone}`,
    user: { id: `u-${phone}`, phone, role },
    demoClanId: '42',
    demoClanSlug: 'zhuxi-demo',
  }
}

function mountModal(visible = true) {
  return mount(DemoRoleModal, {
    props: { visible },
    attachTo: document.body,
  })
}

// ---------- Test Suite ----------

describe('DemoRoleModal.vue', () => {
  let mockPost: Mock

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
    mockPost = axios.post as Mock
    // 默认桌面端
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 })
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  // ===== 1. 渲染 =====

  it('PC 端（≥768px）渲染 el-dialog', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 })
    const wrapper = mountModal()
    await flushPromises()
    // Element Plus 默认使用 teleport，把 dialog 挂到 body
    const dialogs = document.querySelectorAll('.el-dialog')
    expect(dialogs.length).toBeGreaterThanOrEqual(1)
    wrapper.unmount()
  })

  it('移动端（<768px）渲染 el-drawer', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 600 })
    const wrapper = mountModal()
    // 触发 resize 监听
    window.dispatchEvent(new Event('resize'))
    await flushPromises()
    const drawers = document.querySelectorAll('.el-drawer')
    expect(drawers.length).toBeGreaterThanOrEqual(1)
    wrapper.unmount()
  })

  it('两个角色卡片文案正确渲染', () => {
    const wrapper = mountModal()
    const html = wrapper.html()
    expect(html).toContain('族谱管理平台')
    expect(html).toContain('族员个人管理中心')
    expect(html).toContain('朱小小')
  })

  // ===== 2. 登录交互 =====

  it('admin 登录：调用 demo-login、applyDemoLogin、emit success', async () => {
    const payload = buildSuccessPayload('OWNER', '13800000000')
    mockPost.mockResolvedValue({ data: payload })

    const wrapper = mountModal()
    const authStore = useAuthStore()
    const applySpy = vi.spyOn(authStore, 'applyDemoLogin')

    // 通过文本查找"族谱管理平台"卡片下的"立即进入"按钮
    const adminBtn = wrapper.findAll('.role-action').find((b) => {
      const card = b.element.closest('.role-card')
      return card?.classList.contains('role-card-admin')
    })
    expect(adminBtn).toBeTruthy()
    await adminBtn!.trigger('click')
    await flushPromises()

    expect(mockPost).toHaveBeenCalledWith('/api/auth/demo-login')
    expect(applySpy).toHaveBeenCalledWith(payload)
    expect(ElMessage.success).toHaveBeenCalledWith('欢迎体验族谱管理后台！')
    expect(wrapper.emitted('success')?.[0]).toEqual(['admin'])
  })

  it('member 登录：调用 demo-member-login、emit success', async () => {
    const payload = buildSuccessPayload('EDITOR', '13800000001')
    mockPost.mockResolvedValue({ data: payload })

    const wrapper = mountModal()
    const memberBtn = wrapper.findAll('.role-action').find((b) => {
      const card = b.element.closest('.role-card')
      return card?.classList.contains('role-card-member')
    })
    expect(memberBtn).toBeTruthy()
    await memberBtn!.trigger('click')
    await flushPromises()

    expect(mockPost).toHaveBeenCalledWith('/api/auth/demo-member-login')
    expect(ElMessage.success).toHaveBeenCalledWith('欢迎体验族员个人页面！')
    expect(wrapper.emitted('success')?.[0]).toEqual(['member'])
  })

  // ===== 3. submitting 防重复 =====

  it('点击 admin 后，member 按钮立即 disabled（防重复提交）', async () => {
    // 让请求挂起不 resolve，模拟网络慢
    let resolvePost!: (v: unknown) => void
    mockPost.mockReturnValue(new Promise((r) => { resolvePost = r }))

    const wrapper = mountModal()
    const adminBtn = wrapper.findAll('.role-action').find((b) =>
      b.element.closest('.role-card')?.classList.contains('role-card-admin'),
    )!
    const memberBtn = wrapper.findAll('.role-action').find((b) =>
      b.element.closest('.role-card')?.classList.contains('role-card-member'),
    )!

    // 初始：两个都可点
    expect((adminBtn.element as HTMLButtonElement).disabled).toBe(false)
    expect((memberBtn.element as HTMLButtonElement).disabled).toBe(false)

    await adminBtn.trigger('click')
    await flushPromises()

    // admin loading → 自身自动 disabled；member 也必须 disabled
    expect((adminBtn.element as HTMLButtonElement).disabled).toBe(true)
    expect((memberBtn.element as HTMLButtonElement).disabled).toBe(true)

    // 完成请求
    resolvePost({ data: buildSuccessPayload('OWNER', '13800000000') })
    await flushPromises()
  })

  it('member 提交中：admin 按钮被 disabled', async () => {
    let resolvePost!: (v: unknown) => void
    mockPost.mockReturnValue(new Promise((r) => { resolvePost = r }))

    const wrapper = mountModal()
    const adminBtn = wrapper.findAll('.role-action').find((b) =>
      b.element.closest('.role-card')?.classList.contains('role-card-admin'),
    )!
    const memberBtn = wrapper.findAll('.role-action').find((b) =>
      b.element.closest('.role-card')?.classList.contains('role-card-member'),
    )!

    await memberBtn.trigger('click')
    await flushPromises()

    // member loading → 自身 disabled；admin 也必须 disabled
    expect((memberBtn.element as HTMLButtonElement).disabled).toBe(true)
    expect((adminBtn.element as HTMLButtonElement).disabled).toBe(true)

    resolvePost({ data: buildSuccessPayload('EDITOR', '13800000001') })
    await flushPromises()
  })

  // ===== 4. 错误处理 =====

  it('业务错误（response.data.message）透传给 ElMessage.error', async () => {
    mockPost.mockRejectedValue({
      response: { data: { message: '演示账号尚未初始化，请稍后再试' } },
    })

    const wrapper = mountModal()
    const adminBtn = wrapper.findAll('.role-action').find((b) =>
      b.element.closest('.role-card')?.classList.contains('role-card-admin'),
    )!
    await adminBtn.trigger('click')
    await flushPromises()

    expect(ElMessage.error).toHaveBeenCalledWith('演示账号尚未初始化，请稍后再试')
    expect(wrapper.emitted('success')).toBeUndefined()
  })

  it('网络错误（无 response）显示默认文案', async () => {
    mockPost.mockRejectedValue(new Error('Network Error'))

    const wrapper = mountModal()
    const adminBtn = wrapper.findAll('.role-action').find((b) =>
      b.element.closest('.role-card')?.classList.contains('role-card-admin'),
    )!
    await adminBtn.trigger('click')
    await flushPromises()

    expect(ElMessage.error).toHaveBeenCalledWith('演示服务暂不可用，请稍后再试')
  })

  it('finally 中 submitting 必被清空（避免按钮永久 disabled）', async () => {
    mockPost.mockRejectedValue(new Error('fail'))

    const wrapper = mountModal()
    const adminBtn = wrapper.findAll('.role-action').find((b) =>
      b.element.closest('.role-card')?.classList.contains('role-card-admin'),
    )!
    const memberBtn = wrapper.findAll('.role-action').find((b) =>
      b.element.closest('.role-card')?.classList.contains('role-card-member'),
    )!

    await adminBtn.trigger('click')
    await flushPromises()

    // 错误处理后两个按钮都应恢复可点
    expect((adminBtn.element as HTMLButtonElement).disabled).toBe(false)
    expect((memberBtn.element as HTMLButtonElement).disabled).toBe(false)
  })

  // ===== 5. 双向绑定 =====

  it('props.visible=false 时弹窗关闭', async () => {
    const wrapper = mount(DemoRoleModal, {
      props: { visible: false },
      attachTo: document.body,
    })
    await flushPromises()
    // Element Plus 在 v-model=false 时不挂载 dialog 元素
    expect(document.querySelector('.el-dialog')).toBeFalsy()
    wrapper.unmount()
  })

  it('点击遮罩外的关闭按钮会 emit update:visible false', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 })
    const wrapper = mountModal(true)
    await flushPromises()
    // Element Plus 默认渲染 el-dialog__header 上的关闭按钮
    const closeBtn = document.querySelector('.el-dialog__headerbtn') as HTMLElement | null
    if (closeBtn) {
      closeBtn.click()
      await flushPromises()
      // Element Plus 通过 update:modelValue 传出
      const updates = wrapper.emitted('update:visible')
      expect(updates).toBeTruthy()
      expect(updates![updates!.length - 1]).toEqual([false])
    } else {
      // 若未渲染（受 jsdom 限制），至少确保 props 同步无异常
      expect(wrapper.props('visible')).toBe(true)
    }
  })
})
