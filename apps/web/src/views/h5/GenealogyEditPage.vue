<template>
  <div class="h5-page">
    <!-- 通知文案（来自 CrowdsourceEditPage 创建并通过链接携带 token） -->
    <div v-if="step === 'login'" class="h5-card">
      <h1 class="h5-title">族谱信息核验</h1>
      <p class="h5-subtitle">
        请使用您的手机号登录，核验/修改您的族谱信息。提交后由家族管理员审核。
      </p>

      <label class="h5-label">手机号 *</label>
      <input
        v-model="phone"
        class="h5-input"
        type="tel"
        inputmode="numeric"
        maxlength="11"
        placeholder="请输入 11 位手机号"
      />

      <label class="h5-label">短信验证码 *</label>
      <div class="h5-sms-row">
        <input
          v-model="smsCode"
          class="h5-input"
          inputmode="numeric"
          maxlength="6"
          placeholder="6 位验证码"
        />
        <button
          type="button"
          class="h5-btn h5-btn--secondary h5-btn--inline"
          :disabled="smsCountdown > 0 || sendingSms"
          @click="handleSendSms"
        >
          {{ smsCountdown > 0 ? `${smsCountdown}s 后重发` : sendingSms ? '发送中…' : '发送验证码' }}
        </button>
      </div>

      <button class="h5-btn" :disabled="loggingIn" type="button" @click="handleLogin">
        {{ loggingIn ? '登录中…' : '登录并继续' }}
      </button>

      <p class="h5-tip">
        登录即表示您同意将本次修改提交至家族管理员审核，审核通过后将写入族谱。
      </p>
    </div>

    <!-- 步骤 2：展示通知文案 + 修改表单 -->
    <div v-else-if="step === 'edit'" class="h5-card">
      <h1 class="h5-title">请确认或修改您的信息</h1>
      <p v-if="noticeTitle" class="h5-subtitle">{{ noticeTitle }}</p>
      <p v-if="noticeContent" class="h5-notice">{{ noticeContent }}</p>

      <label class="h5-label">姓名</label>
      <input v-model="form.full_name" class="h5-input" placeholder="您的姓名" />

      <label class="h5-label">性别</label>
      <select v-model="form.gender" class="h5-select">
        <option value="male">男</option>
        <option value="female">女</option>
      </select>

      <label class="h5-label">出生年份</label>
      <input
        v-model.number="form.birth_year"
        class="h5-input"
        type="number"
        placeholder="如 1970"
      />

      <label class="h5-label">字辈</label>
      <input v-model="form.xipai" class="h5-input" placeholder="选填" />

      <label class="h5-label">联系电话</label>
      <input v-model="form.phone" class="h5-input" type="tel" placeholder="选填" />

      <label class="h5-label">生平简介</label>
      <textarea
        v-model="form.bio"
        class="h5-select"
        rows="3"
        placeholder="选填，简单记录您的履历/事迹"
      />

      <button class="h5-btn" :disabled="submitting" type="button" @click="handleSubmit">
        {{ submitting ? '提交中…' : '提交修改' }}
      </button>

      <p class="h5-tip">
        提交后管理员会在"修谱→众包修改"中审核，通过后才会写入族谱。
      </p>
    </div>

    <!-- 步骤 3：完成 -->
    <div v-else-if="step === 'done'" class="h5-card">
      <h1 class="h5-title">提交成功</h1>
      <p class="h5-subtitle">您的修改已提交，请等待管理员审核。</p>
      <button class="h5-btn h5-btn--secondary" type="button" @click="onClose">关闭</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'
import { showToast } from 'vant'
import 'vant/es/toast/style'
import '@/styles/h5.scss'

const route = useRoute()
const clanSlug = String(route.query.clanSlug || '')
const token = String(route.query.token || '')

type Step = 'login' | 'edit' | 'done'
const step = ref<Step>('login')

const phone = ref('')
const smsCode = ref('')
const smsCountdown = ref(0)
const sendingSms = ref(false)
const loggingIn = ref(false)

const noticeTitle = ref('')
const noticeContent = ref('')

const form = ref({
  full_name: '',
  gender: 'male' as 'male' | 'female',
  birth_year: undefined as number | undefined,
  xipai: '',
  phone: '',
  bio: '',
})

const submitting = ref(false)

async function handleSendSms() {
  if (!/^1\d{10}$/.test(phone.value)) {
    showToast('请输入正确的 11 位手机号')
    return
  }
  sendingSms.value = true
  try {
    // TODO: 待后端 API  POST /api/auth/sms-send  { phone, purpose: 'genealogy-edit' }
    showToast('（TODO）验证码接口待接入')
    smsCountdown.value = 60
    const t = setInterval(() => {
      smsCountdown.value -= 1
      if (smsCountdown.value <= 0) clearInterval(t)
    }, 1000)
  } catch (e: any) {
    showToast(e?.response?.data?.message || '发送失败')
  } finally {
    sendingSms.value = false
  }
}

async function handleLogin() {
  if (!/^1\d{10}$/.test(phone.value)) {
    showToast('请输入正确的手机号')
    return
  }
  if (!/^\d{6}$/.test(smsCode.value)) {
    showToast('请输入 6 位验证码')
    return
  }
  loggingIn.value = true
  try {
    // TODO: 待后端 API  POST /api/auth/sms-login  { phone, code }
    // 成功后保存 token，拉取通知文案 + 当前可修改字段
    showToast('（TODO）登录接口待接入；模拟进入编辑步骤')
    // 模拟：从 query 读取展示数据（如管理员在通知中携带了 title/content）
    noticeTitle.value = String(route.query.title || '请各位族亲核实个人信息')
    noticeContent.value = String(
      route.query.content ||
        '本次修谱期间，请点击下方表单核实/修改您的姓名、出生年份、字辈、联系电话与生平简介，提交后由家族管理员审核。',
    )
    form.value.phone = phone.value
    step.value = 'edit'
  } catch (e: any) {
    showToast(e?.response?.data?.message || '登录失败')
  } finally {
    loggingIn.value = false
  }
}

async function handleSubmit() {
  if (!form.value.full_name.trim()) {
    showToast('请填写姓名')
    return
  }
  submitting.value = true
  try {
    // TODO: 待后端 API  POST /api/genealogy/${clanSlug}/crowdsource/submissions
    // body: { token, phone, ...form }
    showToast('（TODO）提交接口待接入；模拟成功')
    step.value = 'done'
  } catch (e: any) {
    showToast(e?.response?.data?.message || '提交失败')
  } finally {
    submitting.value = false
  }
}

function onClose() {
  // 微信/小程序环境可能直接关闭；浏览器环境提示用户自行关闭
  if (typeof window !== 'undefined' && window.history.length > 1) {
    window.close()
    setTimeout(() => {
      showToast('请手动关闭页面')
    }, 200)
  }
}

onMounted(() => {
  if (!clanSlug && !token) {
    // 允许直接打开页面（演示用）；真实场景应校验 token
    console.warn('[H5 genealogy-edit] 未携带 clanSlug/token，按预览模式加载')
  }
})
</script>

<style scoped>
.h5-notice {
  background: #fdf6ec;
  border-left: 3px solid #e6a23c;
  padding: 8px 12px;
  margin: 0 0 12px 0;
  color: #606266;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  border-radius: 4px;
}

.h5-sms-row {
  display: flex;
  gap: 8px;
  align-items: stretch;
}

.h5-sms-row .h5-input {
  flex: 1;
}

.h5-btn--inline {
  flex-shrink: 0;
  padding: 0 12px;
  font-size: 13px;
}

.h5-btn:disabled,
.h5-btn--secondary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
