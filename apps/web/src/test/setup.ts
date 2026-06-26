/**
 * Vitest 全局测试 setup
 *
 * 在每个测试文件运行前自动加载：
 * 1. 全局 stub ElDialog/ElDrawer（保留真实 props/emits，避免 jsdom Teleport 复杂度）
 * 2. 真实注册 ElButton（验证 click/disabled/loading 交互）
 * 3. 模拟 window.matchMedia（Element Plus 需要）
 * 4. 模拟 IntersectionObserver（部分 UI 组件需要）
 * 5. 静默 Element Plus 内部警告
 */

import { vi } from 'vitest'
import { config } from '@vue/test-utils'
import * as ElementPlus from 'element-plus'

// ---------- 1. 全局 stub Element Plus 弹窗组件 ----------

/**
 * ElDialog stub：渲染为简单的 div（不 teleport），保留 modelValue 控制可见性。
 * 真实场景下 Element Plus 用 teleport 把 dialog 挂到 body，jsdom 中表现不一致，
 * 这里 stub 后 wrapper.html() 能直接抓到 dialog 内容。
 */
const ElDialogStub = {
  name: 'ElDialog',
  props: [
    'modelValue', 'title', 'width', 'alignCenter', 'destroyOnClose',
    'showClose', 'closeOnClickModal', 'closeOnPressEscape',
  ],
  emits: ['update:modelValue', 'close'],
  template: `
    <div v-if="modelValue" class="el-dialog el-dialog-stub" :data-title="title">
      <div class="el-dialog__header"><slot name="header" /></div>
      <div class="el-dialog__body"><slot /></div>
      <div class="el-dialog__footer"><slot name="footer" /></div>
      <button v-if="showClose" class="el-dialog__headerbtn" @click="$emit('update:modelValue', false)">×</button>
    </div>
  `,
}

const ElDrawerStub = {
  name: 'ElDrawer',
  props: ['modelValue', 'title', 'direction', 'size', 'destroyOnClose', 'showClose', 'closeOnClickModal', 'closeOnPressEscape'],
  emits: ['update:modelValue', 'close'],
  template: `
    <div v-if="modelValue" class="el-drawer el-drawer-stub" :data-title="title">
      <div class="el-drawer__header"><slot name="header" /></div>
      <div class="el-drawer__body"><slot /></div>
    </div>
  `,
}

/**
 * 真实注册其他 Element Plus 组件（ElButton、ElMessage 等），
 * 让点击、disabled 等交互行为在测试中真实生效。
 */
const { ElDialog, ElDrawer, ...restComponents } = ElementPlus as unknown as Record<string, unknown> & {
  ElDialog: unknown
  ElDrawer: unknown
}

config.global.stubs = {
  ElDialog: ElDialogStub,
  ElDrawer: ElDrawerStub,
}
config.global.components = restComponents as unknown as Record<string, object>

// ---------- 2. window.matchMedia mock ----------

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// ---------- 3. IntersectionObserver mock ----------

;(globalThis as any).IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
  takeRecords: vi.fn(() => []),
  root: null,
  rootMargin: '',
  thresholds: [],
}))

// ---------- 4. 静默 Element Plus 警告 ----------

const originalConsoleWarn = console.warn
console.warn = (...args: unknown[]) => {
  const msg = String(args[0] ?? '')
  if (msg.includes('[Vue warn]')) return
  originalConsoleWarn(...args)
}
