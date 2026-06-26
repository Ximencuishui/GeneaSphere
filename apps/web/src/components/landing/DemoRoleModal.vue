<script setup lang="ts">
/**
 * 演示账号一键登录弹窗
 *
 * 用途：在营销网页（LandingPage）"立即体验 / 一键体验演示账号"按钮触发时弹出，
 *       让访客选择"族谱管理平台"（管理员）或"族员个人管理中心"（朱小小）。
 *
 * 设计要点：
 * - PC（≥768px）：居中 ElDialog，左右双列卡片
 * - 移动端（<768px）：底部 ElDrawer，上下双列卡片
 * - 触发提交时另一按钮 disabled，防止重复点击
 * - ESC 键 + 点击遮罩均可关闭（submitting 时禁用关闭）
 */
import { ref, computed, onBeforeUnmount } from 'vue'
import axios from 'axios'
import { useAuthStore } from '@/stores/auth'
import { ElMessage } from 'element-plus'

interface Props {
  visible: boolean
}

interface DemoLoginResponse {
  access_token: string
  user: { id: string; phone: string; role: string }
  demoClanId: string | null
  demoClanSlug: string | null
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void
  (e: 'success', role: 'admin' | 'member'): void
}>()

const authStore = useAuthStore()
const submitting = ref<'admin' | 'member' | null>(null)

// 移动端检测（< 768px 视为移动端，使用 Drawer）
const isMobile = ref(typeof window !== 'undefined' && window.innerWidth < 768)
function handleResize() {
  isMobile.value = window.innerWidth < 768
}
if (typeof window !== 'undefined') {
  window.addEventListener('resize', handleResize)
}
onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', handleResize)
  }
})

const dialogVisible = computed({
  get: () => props.visible,
  set: (v) => emit('update:visible', v),
})

/** 从未知错误对象中提取 axios 错误消息 */
function extractErrorMessage(err: unknown, fallback: string): string {
  if (typeof err === 'object' && err !== null && 'response' in err) {
    const response = (err as { response?: { data?: { message?: string } } }).response
    return response?.data?.message || fallback
  }
  return fallback
}

async function handleAdminLogin() {
  if (submitting.value) return
  submitting.value = 'admin'
  try {
    const { data } = await axios.post<DemoLoginResponse>('/api/auth/demo-login')
    authStore.applyDemoLogin(data)
    ElMessage.success('欢迎体验族谱管理后台！')
    emit('success', 'admin')
  } catch (error) {
    ElMessage.error(extractErrorMessage(error, '演示服务暂不可用，请稍后再试'))
  } finally {
    submitting.value = null
  }
}

async function handleMemberLogin() {
  if (submitting.value) return
  submitting.value = 'member'
  try {
    const { data } = await axios.post<DemoLoginResponse>('/api/auth/demo-member-login')
    authStore.applyDemoLogin(data)
    ElMessage.success('欢迎体验族员个人页面！')
    emit('success', 'member')
  } catch (error) {
    ElMessage.error(extractErrorMessage(error, '演示服务暂不可用，请稍后再试'))
  } finally {
    submitting.value = null
  }
}

function handleClose() {
  if (submitting.value) return
  dialogVisible.value = false
}
</script>

<template>
  <!-- PC 端：居中 Modal -->
  <el-dialog
    v-if="!isMobile"
    v-model="dialogVisible"
    title="选择您的体验视角"
    width="720px"
    :close-on-click-modal="!submitting"
    :close-on-press-escape="!submitting"
    :show-close="!submitting"
    align-center
    destroy-on-close
    class="demo-role-dialog"
    @close="handleClose"
  >
    <div class="demo-role-modal">
      <p class="demo-role-tip">
        演示账号已预置完整的朱熹族谱（1000 人 · 28 代），请选择您的视角开始体验。
      </p>

      <div class="role-cards">
        <!-- 管理员卡片 -->
        <div class="role-card role-card-admin" @click="handleAdminLogin">
          <div class="role-badge">👑 管理员</div>
          <div class="role-icon">📊</div>
          <h3 class="role-title">族谱管理平台</h3>
          <p class="role-subtitle">以管理员身份登录</p>
          <ul class="role-features">
            <li>控制面板 · 成员管理</li>
            <li>内容审核 · 归宗合并</li>
            <li>字辈 · 订单 · 操作日志</li>
          </ul>
          <el-button
            class="role-action"
            type="primary"
            size="large"
            :loading="submitting === 'admin'"
            :disabled="!!submitting && submitting !== 'admin'"
            @click.stop="handleAdminLogin"
          >
            立即进入
          </el-button>
        </div>

        <!-- 族员卡片 -->
        <div class="role-card role-card-member" @click="handleMemberLogin">
          <div class="role-badge">🌱 族员</div>
          <div class="role-icon">👤</div>
          <h3 class="role-title">族员个人管理中心</h3>
          <p class="role-subtitle">以"朱小小"身份登录</p>
          <ul class="role-features">
            <li>个人资料 · 家谱浏览</li>
            <li>照片上传 · 音像墙</li>
            <li>小组讨论 · 寻亲匹配</li>
          </ul>
          <el-button
            class="role-action"
            type="primary"
            size="large"
            :loading="submitting === 'member'"
            :disabled="!!submitting && submitting !== 'member'"
            @click.stop="handleMemberLogin"
          >
            立即进入
          </el-button>
        </div>
      </div>

      <div class="demo-role-footer">
        <div>ℹ 演示账号不会写入真实数据变更日志，可在平台管理后台"重置演示数据"恢复初始状态。</div>
        <div class="demo-role-hint">💡 按 ESC 键或点击弹窗外部可关闭（提交中不可关闭）</div>
      </div>
    </div>
  </el-dialog>

  <!-- 移动端：底部 Drawer -->
  <el-drawer
    v-else
    v-model="dialogVisible"
    title="选择您的体验视角"
    direction="btt"
    size="70vh"
    :close-on-click-modal="!submitting"
    :close-on-press-escape="!submitting"
    :show-close="!submitting"
    destroy-on-close
    class="demo-role-drawer"
  >
    <div class="demo-role-modal demo-role-modal-mobile">
      <p class="demo-role-tip">
        演示账号已预置完整的朱熹族谱（1000 人 · 28 代），请选择您的视角开始体验。
      </p>

      <div class="role-cards role-cards-mobile">
        <div class="role-card role-card-admin" @click="handleAdminLogin">
          <div class="role-badge">👑 管理员</div>
          <h3 class="role-title">族谱管理平台</h3>
          <p class="role-subtitle">以管理员身份登录</p>
          <ul class="role-features">
            <li>控制面板 · 成员管理</li>
            <li>内容审核 · 归宗合并</li>
            <li>字辈 · 订单 · 操作日志</li>
          </ul>
          <el-button
            class="role-action"
            type="primary"
            size="large"
            :loading="submitting === 'admin'"
            :disabled="!!submitting && submitting !== 'admin'"
            @click.stop="handleAdminLogin"
          >
            立即进入
          </el-button>
        </div>

        <div class="role-card role-card-member" @click="handleMemberLogin">
          <div class="role-badge">🌱 族员</div>
          <h3 class="role-title">族员个人管理中心</h3>
          <p class="role-subtitle">以"朱小小"身份登录</p>
          <ul class="role-features">
            <li>个人资料 · 家谱浏览</li>
            <li>照片上传 · 音像墙</li>
            <li>小组讨论 · 寻亲匹配</li>
          </ul>
          <el-button
            class="role-action"
            type="primary"
            size="large"
            :loading="submitting === 'member'"
            :disabled="!!submitting && submitting !== 'member'"
            @click.stop="handleMemberLogin"
          >
            立即进入
          </el-button>
        </div>
      </div>

      <div class="demo-role-footer">
        <div>ℹ 演示账号不会写入真实数据变更日志。</div>
        <div class="demo-role-hint">💡 点击空白处或下滑可关闭弹窗（提交中不可关闭）</div>
      </div>
    </div>
  </el-drawer>
</template>

<style scoped>
.demo-role-modal {
  padding: 8px 4px;
}

.demo-role-tip {
  text-align: center;
  color: #5a6a7a;
  font-size: 14px;
  line-height: 1.7;
  margin: 0 0 24px;
}

.role-cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.role-cards-mobile {
  grid-template-columns: 1fr;
}

.role-card {
  position: relative;
  border-radius: 16px;
  padding: 28px 24px 24px;
  text-align: center;
  cursor: pointer;
  transition: transform 0.25s ease, box-shadow 0.25s ease;
  color: white;
  overflow: hidden;
}

.role-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18);
}

.role-card-admin {
  background: linear-gradient(135deg, #5D4037 0%, #8D6E63 100%);
  box-shadow: 0 6px 20px rgba(93, 64, 55, 0.25);
}

.role-card-member {
  background: linear-gradient(135deg, #1976D2 0%, #42A5F5 100%);
  box-shadow: 0 6px 20px rgba(25, 118, 210, 0.25);
}

.role-badge {
  position: absolute;
  top: 12px;
  right: 12px;
  background: rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(8px);
  color: white;
  font-size: 12px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 12px;
  letter-spacing: 0.5px;
}

.role-icon {
  font-size: 48px;
  margin: 8px 0 12px;
}

.role-title {
  font-size: 22px;
  font-weight: 700;
  color: white;
  margin: 0 0 6px;
  letter-spacing: 0.5px;
}

.role-subtitle {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.85);
  margin: 0 0 16px;
}

.role-features {
  list-style: none;
  padding: 0;
  margin: 0 0 20px;
  text-align: left;
}

.role-features li {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.92);
  padding: 4px 0;
  position: relative;
  padding-left: 18px;
}

.role-features li::before {
  content: '✓';
  position: absolute;
  left: 0;
  color: rgba(255, 255, 255, 0.7);
  font-weight: 700;
}

.role-action {
  background: rgba(255, 255, 255, 0.95) !important;
  border: none !important;
  color: #2c3e50 !important;
  font-weight: 600 !important;
  border-radius: 24px !important;
  padding: 10px 32px !important;
  width: 100%;
  transition: all 0.2s !important;
}

.role-card-admin .role-action:hover {
  background: #5D4037 !important;
  color: white !important;
}

.role-card-member .role-action:hover {
  background: #1976D2 !important;
  color: white !important;
}

.demo-role-footer {
  margin-top: 24px;
  padding: 12px 16px;
  background: rgba(201, 169, 110, 0.08);
  border-left: 3px solid #C9A96E;
  border-radius: 6px;
  color: #5a6a7a;
  font-size: 12px;
  line-height: 1.6;
}

.demo-role-hint {
  margin-top: 6px;
  color: #8a9aaa;
  font-size: 11px;
}

@media (max-width: 768px) {
  .role-card {
    padding: 20px 16px 18px;
  }
  .role-icon {
    font-size: 36px;
  }
  .role-title {
    font-size: 18px;
  }
}
</style>

<!-- Element Plus 弹窗样式覆盖（非 scoped） -->
<style>
.demo-role-dialog .el-dialog__header {
  padding: 24px 24px 0;
  margin: 0;
}

.demo-role-dialog .el-dialog__title {
  font-size: 22px;
  font-weight: 700;
  color: #2c3e50;
}

.demo-role-dialog .el-dialog__body {
  padding: 16px 24px 24px;
}

.demo-role-dialog {
  border-radius: 16px;
  overflow: hidden;
}

.demo-role-dialog .el-dialog {
  border-radius: 16px;
}

.demo-role-drawer .el-drawer__header {
  margin-bottom: 12px;
  padding: 16px 20px 0;
  font-size: 18px;
  font-weight: 700;
  color: #2c3e50;
}

.demo-role-drawer .el-drawer__body {
  padding: 0 16px 16px;
  overflow-y: auto;
}
</style>