<template>
  <div class="h5-page">
    <!-- 通知文案（来自 CrowdsourceEditPage 创建并通过链接携带 token） -->
    <div v-if="step === 'login'" class="h5-card">
      <h1 class="h5-title">族谱信息核验</h1>
      <p v-if="noticeTitle" class="h5-subtitle">{{ noticeTitle }}</p>
      <p v-if="noticeContent" class="h5-notice">{{ noticeContent }}</p>
      <p v-else class="h5-subtitle">
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

      <button class="h5-btn" :disabled="loggingIn || !noticeValid" type="button" @click="handleLogin">
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

      <label class="h5-label">姓名 *</label>
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
      <input v-model="form.contact_phone" class="h5-input" type="tel" placeholder="选填" />

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
      <p class="h5-subtitle">
        已提交 {{ submittedCount }} 条修改记录，请等待管理员审核。
      </p>
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
const noticeValid = ref(false)

const form = ref({
  full_name: '',
  gender: 'male' as 'male' | 'female',
  birth_year: undefined as number | undefined,
  xipai: '',
  contact_phone: '',
  bio: '',
})

const submitting = ref(false)
const submittedCount = ref(0)

/**
 * 调用 /api/auth/send-sms-code，purpose 固定为 LOGIN（族员身份验证）。
 * 后端在开发模式下会把验证码打到日志，前端如返回 devCode 则自动填充方便测试。
 */
async function handleSendSms() {
  if (!/^1\d{10}$/.test(phone.value)) {
    showToast('请输入正确的 11 位手机号')
    return
  }
  sendingSms.value = true
  try {
    const { data } = await axios.post('/api/auth/send-sms-code', {
      phone: phone.value,
      purpose: 'LOGIN',
    })
    showToast('验证码已发送')
    // 开发模式：后端会把验证码一并返回（仅未配置 TENCENT_SMS_* 时），方便前端联调
    const devCode = data?.data?.code ?? data?.code
    if (devCode && /^\d{6}$/.test(String(devCode))) {
      smsCode.value = String(devCode)
    }
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

/**
 * 调用 /api/auth/login，使用短信验证码登录。
 * 登录成功后进入编辑步骤；如果后端没返回手机号，预填本步骤输入的手机号。
 */
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
    await axios.post('/api/auth/login', {
      phone: phone.value,
      smsCode: smsCode.value,
    })
    if (!noticeTitle.value) noticeTitle.value = '请各位族亲核实个人信息'
    if (!noticeContent.value) {
      noticeContent.value = '本次修谱期间，请核实或修改您的族谱信息，提交后由家族管理员审核。'
    }
    form.value.contact_phone = phone.value
    step.value = 'edit'
  } catch (e: any) {
    showToast(e?.response?.data?.message || '登录失败')
  } finally {
    loggingIn.value = false
  }
}

/**
 * 提交族谱信息修改申请：调用 /api/genealogy/{slug}/crowdsource/submissions。
 * 后端会把姓名 / 性别 / 出生年的差异写入 PersonModificationRequest，
 * 字辈 / 联系电话 / 生平简介作为附加信息一并提交，供管理员人工补充。
 */
async function handleSubmit() {
  if (!form.value.full_name.trim()) {
    showToast('请填写姓名')
    return
  }
  if (!clanSlug || !token) {
    showToast('通知链接不完整，无法提交')
    return
  }
  submitting.value = true
  try {
    const payload: Record<string, unknown> = {
      token,
      phone: phone.value,
      full_name: form.value.full_name.trim(),
      gender: form.value.gender,
    }
    if (form.value.birth_year !== undefined && Number.isFinite(form.value.birth_year)) {
      payload.birth_year = form.value.birth_year
    }
    if (form.value.xipai.trim()) payload.xipai = form.value.xipai.trim()
    if (form.value.contact_phone.trim()) payload.contact_phone = form.value.contact_phone.trim()
    if (form.value.bio.trim()) payload.bio = form.value.bio.trim()

    const { data } = await axios.post(
      `/api/genealogy/${clanSlug}/crowdsource/submissions`,
      payload,
    )
    const result = data?.data ?? data
    submittedCount.value = Number(result?.request_count ?? 0)
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

onMounted(async () => {
  if (!clanSlug || !token) {
    showToast('通知链接不完整')
    return
  }
  try {
    const { data } = await axios.post(
      `/api/genealogy/${clanSlug}/crowdsource/notices/resolve`,
      { token },
    )
    const notice = data?.data ?? data
    noticeTitle.value = notice?.title || ''
    noticeContent.value = notice?.content || ''
    noticeValid.value = true
  } catch (e: any) {
    showToast(e?.response?.data?.message || '通知链接无效或已过期')
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